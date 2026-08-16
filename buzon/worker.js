/* ================================================================
   EL BUZÓN
   Se instala en Cloudflare Workers (gratis). Es lo único de este
   proyecto que vive fuera de tu teléfono.

   Qué guarda: frases sueltas sin procesar, tal como te llegaron.
     { texto: "almuerzo 8500", fecha: "2026-08-16T14:30:00Z" }

   Qué NO guarda, nunca: tu historial, tus categorías, tus ahorros,
   tus totales, tu nombre, tu RUT, tu saldo. La app no le manda datos
   al buzón; solo le pide. El flujo va en un solo sentido.

   Cuánto dura: hasta que abres la app y se lo lleva. Y aunque no la
   abras, se borra solo a los 7 días (el TTL de abajo).

   Cómo se protege: toda petición necesita la clave secreta. Y como
   la clave viaja en la URL, y las URL quedan escritas en los registros
   de medio mundo, el buzón la acepta también por cabecera.
   ================================================================ */

// Cuánto sobrevive un mensaje sin que nadie lo recoja. En segundos.
const DIAS = 7;
const TTL = DIAS * 24 * 60 * 60;

/* Respuesta en JSON. El navegador exige el permiso CORS porque la app
   vive en github.io y el buzón en workers.dev: para el navegador son
   dos sitios distintos y sin este permiso ni siquiera intenta pedir. */
function json(datos, estado = 200, origen = '*') {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origen,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-clave',
      'cache-control': 'no-store'
    }
  });
}

/* Comparar claves con === es más rápido cuando fallan en la primera
   letra que cuando fallan en la última, y esa diferencia de tiempo
   deja adivinar la clave letra por letra. Esta versión demora lo
   mismo siempre. Es exagerado para un buzón personal, pero son seis
   líneas y quita el problema de encima. */
function claveCorrecta(dada, esperada) {
  if (typeof dada !== 'string' || !esperada) return false;
  if (dada.length !== esperada.length) return false;
  let diferencia = 0;
  for (let i = 0; i < dada.length; i++) diferencia |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diferencia === 0;
}

export default {
  async fetch(peticion, entorno) {
    const url = new URL(peticion.url);
    const origen = entorno.ORIGEN_APP || '*';

    // El navegador pregunta antes de pedir de verdad. Hay que contestarle.
    if (peticion.method === 'OPTIONS') return json({}, 204, origen);

    /* --- Webhook de WhatsApp ---
       Va antes de la clave porque quien llama es Meta, que no la tiene.
       Se protege distinto: con el token de verificación y con la firma. */
    if (url.pathname === '/whatsapp') return whatsapp(peticion, entorno);

    // Todo lo demás es tuyo, y necesita la clave
    const clave = peticion.headers.get('x-clave') || url.searchParams.get('k');
    if (!claveCorrecta(clave, entorno.CLAVE)) return json({ error: 'clave incorrecta' }, 401, origen);

    if (url.pathname === '/pendientes') return pendientes(entorno, origen);
    if (url.pathname === '/listo')      return listo(peticion, entorno, origen);
    if (url.pathname === '/anotar')     return anotar(peticion, entorno, origen);

    return json({ error: 'no existe' }, 404, origen);
  }
};

/* --- Lo que la app viene a buscar --- */
async function pendientes(entorno, origen) {
  const lista = await entorno.BUZON.list({ prefix: 'msj:' });
  const mensajes = [];

  for (const llave of lista.keys) {
    const crudo = await entorno.BUZON.get(llave.name);
    if (!crudo) continue;                    // se venció entre el list y el get
    try { mensajes.push({ id: llave.name.slice(4), ...JSON.parse(crudo) }); }
    catch (e) { await entorno.BUZON.delete(llave.name); }   // basura, fuera
  }

  mensajes.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  return json({ pendientes: mensajes }, 200, origen);
}

/* --- "Ya los tengo, bórralos" ---
   El borrado lo manda la app y no el buzón por su cuenta al entregarlos:
   si se corta el internet justo después de entregar, los mensajes se
   habrían perdido sin llegar a ninguna parte. Así, mientras la app no
   confirme, siguen ahí. */
async function listo(peticion, entorno, origen) {
  let ids = [];
  try { ids = (await peticion.json()).ids || []; } catch (e) { /* cuerpo vacío */ }
  if (!Array.isArray(ids)) return json({ error: 'ids debe ser una lista' }, 400, origen);

  await Promise.all(ids.slice(0, 500).map(id => entorno.BUZON.delete('msj:' + String(id))));
  return json({ borrados: ids.length }, 200, origen);
}

/* --- Dejar un mensaje ---
   Lo usa el lector de correos del banco (Apps Script). Acepta el texto
   crudo o los campos ya separados, porque el correo del banco viene con
   el monto ya identificado y no hay para qué volver a adivinarlo. */
async function anotar(peticion, entorno, origen) {
  let cuerpo = {};
  try { cuerpo = await peticion.json(); } catch (e) {
    return json({ error: 'se esperaba JSON' }, 400, origen);
  }

  const entrantes = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [cuerpo];
  let guardados = 0;

  for (const m of entrantes.slice(0, 200)) {
    if (!m || (!m.texto && !m.monto)) continue;
    /* El id lo pone quien manda, si puede: el lector de correos usa el id
       del mensaje de Gmail, y así reenviar el mismo correo dos veces
       sobrescribe en vez de duplicar. Si no viene, uno al azar. */
    const id = String(m.id || crypto.randomUUID()).slice(0, 64);
    await entorno.BUZON.put('msj:' + id, JSON.stringify({
      texto: String(m.texto || '').slice(0, 300),
      fecha: m.fecha || new Date().toISOString(),
      monto: typeof m.monto === 'number' ? m.monto : undefined,
      tipo:  m.tipo === 'ingreso' || m.tipo === 'ahorro' ? m.tipo : undefined,
      de:    String(m.de || 'correo').slice(0, 20)
    }), { expirationTtl: TTL });
    guardados++;
  }

  return json({ guardados }, 200, origen);
}

/* ================================================================
   WHATSAPP
   Meta llama acá cada vez que le escribes al bot.
   ================================================================ */
async function whatsapp(peticion, entorno) {
  const url = new URL(peticion.url);

  /* Al conectar el webhook, Meta hace una sola visita con estos tres
     parámetros y espera que le devuelvas el desafío tal cual, en texto
     pelado. Si le contestas JSON, no lo acepta. */
  if (peticion.method === 'GET') {
    const modo = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    if (modo === 'subscribe' && token === entorno.TOKEN_META) {
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return new Response('no', { status: 403 });
  }

  if (peticion.method !== 'POST') return new Response('no', { status: 405 });

  const crudo = await peticion.text();

  /* La firma prueba que el mensaje viene de Meta y no de alguien que
     encontró la URL. Sin esto, cualquiera podría llenarte el buzón. */
  if (!await firmaValida(crudo, peticion.headers.get('x-hub-signature-256'), entorno.SECRETO_META)) {
    return new Response('firma invalida', { status: 401 });
  }

  let datos;
  try { datos = JSON.parse(crudo); } catch (e) { return new Response('ok'); }

  const mensajes = datos?.entry?.[0]?.changes?.[0]?.value?.messages || [];
  for (const m of mensajes) {
    if (m.type !== 'text') continue;

    /* Solo tu número. El bot de prueba de Meta ya está limitado a los
       destinatarios que autorizaste, pero esto lo deja explícito: si
       algún día lo pasas a un número real, sigue siendo solo tuyo. */
    if (entorno.MI_NUMERO && m.from !== entorno.MI_NUMERO) continue;

    await entorno.BUZON.put('msj:' + m.id, JSON.stringify({
      texto: String(m.text?.body || '').slice(0, 300),
      // WhatsApp manda la hora en segundos; el resto del mundo en milisegundos
      fecha: new Date(Number(m.timestamp || 0) * 1000 || Date.now()).toISOString(),
      de: 'whatsapp'
    }), { expirationTtl: TTL });

    await responder(entorno, m.from, '✅ Anotado. Aparece cuando abras la app.');
  }

  /* Siempre 200, aunque algo falle. Meta reintenta lo que no le
     contestan y podría dejarte el mismo gasto anotado cinco veces. */
  return new Response('ok');
}

/* La firma es un HMAC del cuerpo con el secreto de la app de Meta. */
async function firmaValida(cuerpo, cabecera, secreto) {
  if (!secreto) return true;                  // sin secreto configurado, no se exige
  if (!cabecera || !cabecera.startsWith('sha256=')) return false;

  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(cuerpo));
  const esperada = [...new Uint8Array(firma)]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return claveCorrecta(cabecera.slice(7), esperada);
}

/* El "✅ Anotado" de vuelta. Meta solo deja contestar libremente dentro
   de las 24 horas siguientes a tu mensaje, que es justo este caso. */
async function responder(entorno, para, texto) {
  if (!entorno.TELEFONO_ID || !entorno.TOKEN_WHATSAPP) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${entorno.TELEFONO_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + entorno.TOKEN_WHATSAPP,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: para,
        type: 'text', text: { body: texto }
      })
    });
  } catch (e) {
    // Que falle el acuse de recibo no puede perder el mensaje: ya está guardado
  }
}
