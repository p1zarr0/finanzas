/* ================================================================
   EL LECTOR DE CORREOS DEL BANCO
   Se pega en Google Apps Script (script.google.com). Corre solo cada
   15 minutos DENTRO de tu propia cuenta de Google.

   Qué hace: busca los avisos de compra que te manda el banco, les saca
   el monto y el comercio, y los deja en tu buzón. La app los recoge la
   próxima vez que la abras y te los muestra para que los confirmes.

   Qué NO hace: no lee correos que no sean del banco, no guarda el texto
   del correo en ninguna parte, y no le manda nada a nadie que no sea tu
   propio buzón. Del correo salen tres cosas —cuánto, dónde y cuándo— y
   el resto se queda donde estaba.

   Google ya tiene tu Gmail: este script no se lo entrega a un tercero
   nuevo, solo lo lee desde adentro. Por eso es el camino más discreto
   de los tres.

   ----------------------------------------------------------------
   CÓMO INSTALARLO (una sola vez)

   1. Entra a https://script.google.com y crea un proyecto nuevo.
   2. Borra lo que venga y pega TODO este archivo.
   3. Arriba, en CONFIG, pon la dirección de tu buzón y su clave.
   4. Elige la función  probarLector  y aprieta ▷ Ejecutar.
      Google te va a pedir permiso para leer tu Gmail: es este script,
      corriendo en tu cuenta. Acéptalo.
      En "Registro de ejecución" vas a ver qué entendió de cada correo,
      SIN mandar nada a ninguna parte. Es para revisar antes de soltarlo.
   5. Si se ve bien, elige  instalarDisparador  y aprieta ▷ Ejecutar.
      Desde ahí corre solo cada 15 minutos.

   Si algo sale mal, ejecuta  desinstalarDisparador  y se detiene todo.
   ================================================================ */

const CONFIG = {
  // La misma dirección que pegaste en la app, con su clave incluida
  BUZON: 'https://buzon.TU-CUENTA.workers.dev?k=TU_CLAVE',

  /* De quién son los correos que se miran. Si tu banco no está, agrégalo;
     si sobra alguno, bórralo. Se buscan por dominio del remitente, que es
     lo único que no cambia cuando el banco rediseña sus correos. */
  BANCOS: [
    'bancochile.cl',      // Banco de Chile y Edwards
    'santander.cl',
    'bci.cl',
    'bancoestado.cl',
    'somosmach.com'       // MACH
  ],

  // Cuántos días hacia atrás mirar. Con 3 sobra: el disparador corre cada
  // 15 minutos, y el margen es solo por si Google se salta una vuelta.
  DIAS: 3,

  // La etiqueta con que se marca lo ya procesado, para no mandarlo dos
  // veces. Se crea sola la primera vez.
  ETIQUETA: 'Anotado en Finanzas'
};

/* ================================================================
   ENTENDER EL CORREO

   No hay un parser por banco a propósito. Cada banco escribe distinto y
   los rediseña cada tanto, así que en vez de aprenderse cinco formatos
   —y quedar cojo el día que cambie uno— se buscan señales que ninguno
   puede evitar: la palabra que dice qué pasó, el monto en pesos, y el
   nombre del comercio después de "en".

   Es la misma decisión que se tomó para leer la cartola.
   ================================================================ */

// Lo que confirma que el correo habla de plata que se movió. Sin una de
// estas, es publicidad o un estado de cuenta y no se toca.
const ES_MOVIMIENTO = /(compra|pagaste|pago|cargo|giro|transferencia|abono|dep[oó]sito|te transfiri|comercio|monto|transacci[oó]n)/i;

// Plata que ENTRA. Se prueba sobre el correo entero: un "abono" es ingreso
// aunque la palabra "cargo" aparezca más abajo en la letra chica.
const ES_INGRESO = /(transferencia recibida|recibiste|te transfiri|abono|dep[oó]sito|acreditad)/i;

/* Lo que descarta el correo aunque hable de plata. Sin esto, un aviso de
   compra RECHAZADA te anotaría un gasto que nunca ocurrió, y el correo de
   "¿no reconoces esta compra?" te lo anotaría por segunda vez. */
const NO_CUENTA = /(rechazad|no se (pudo|realiz)|fallid|anulad|revertid|no reconoces|si no reconoces|estado de cuenta|resumen mensual|newsletter|promoci[oó]n|beneficio)/i;

// Las palabras que hacen que el monto de al lado SEA el de la compra
const VERBO_DE_PLATA = /(compra|pagaste|pago|cargo|giro|transferencia|abono|dep[oó]sito|monto)/i;

/* Las que hacen que el monto de al lado NO sea el de la compra. El correo
   del banco casi siempre trae dos o tres cifras —lo que gastaste, el cupo
   que te queda, el saldo— y la más grande no es la que te interesa. */
const NO_ES_EL_MONTO = /(cupo|saldo|disponible|l[ií]nea de cr[eé]dito|total facturado|descuento|ahorra|desde)/i;

/* El monto. En Chile el punto separa los miles: $12.990 son doce mil
   novecientos noventa.

   Se miran TODAS las cifras del correo con lo que viene antes de cada una,
   en vez de quedarse con la primera. Un correo que dice "Cupo disponible:
   $500.000" antes de "compra por $12.990" anotaría medio millón de gasto
   si se tomara la primera, y eso es exactamente lo que pasaba. */
function montoDelCorreo(texto) {
  const candidatos = [];
  const busca = /\$\s*([\d][\d.]*)/g;
  let hallado;

  while ((hallado = busca.exec(texto)) !== null) {
    const n = Number(hallado[1].replace(/\./g, ''));
    // Menos de cien pesos no es una compra: casi siempre es un número
    // suelto que quedó pegado a un signo peso en la maqueta del correo.
    if (!isFinite(n) || n < 100) continue;

    const antes = texto.slice(Math.max(0, hallado.index - 45), hallado.index);
    if (NO_ES_EL_MONTO.test(antes)) continue;

    candidatos.push({ monto: n, conVerbo: VERBO_DE_PLATA.test(antes) });
  }

  if (!candidatos.length) return null;
  const conVerbo = candidatos.filter(function (c) { return c.conVerbo; });
  return conVerbo.length ? conVerbo[0].monto : candidatos[0].monto;
}

/* Le saca la cola al nombre: la frase que sigue ("PANADERIA SAN JOSE. Te
   queda...") y la palabrita que arrastra la fecha ("JUAN PEREZ el"). */
const COLA_SOBRANTE = /\s+\b(el|la|los|las|al?|con|por|del?|desde|hasta|para|en|hacia)\b\s*$/i;

function limpiarNombre(texto) {
  let t = texto.replace(/\s+/g, ' ').split(/\.\s/)[0];
  /* Y el campo siguiente, cuando el correo viene armado como tabla:
     "Comercio: MERCADO LIBRE Fecha: 15/08/2026" tiene que quedarse en
     "MERCADO LIBRE". Una palabra seguida de dos puntos es otra etiqueta,
     no parte del nombre de la tienda. */
  t = t.split(/\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s*:/)[0];
  for (let i = 0; i < 3; i++) t = t.replace(COLA_SOBRANTE, '');
  return t.replace(/[.,;:\s-]+$/, '').trim();
}

/* De dónde salió la plata. En un gasto es el comercio, que los bancos
   escriben después de "en" y casi siempre en mayúsculas, porque así llega
   desde la red de tarjetas. En un ingreso es quien te transfirió, que va
   después de "de" y puede venir con mayúsculas y minúsculas. */
function comercioDelCorreo(texto, esIngreso) {
  const intentos = esIngreso
    ? [
        /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ .'-]{2,40})/,
        /\bconcepto\s*:?\s*([^\n,.;]{2,40})/i
      ]
    : [
        /\bcomercio\s*:?\s*([^\n,.;]{2,40})/i,
        /\ben\s+el\s+comercio\s+([^\n,.;]{2,40})/i,
        // Corta justo antes de lo que viene después del nombre: la fecha,
        // la tarjeta, la hora
        /\ben\s+([A-ZÁÉÍÓÚÑ0-9][^\n,.;]{2,40}?)(?=\s+(?:el|con|por|a las|\d{1,2}[\/-]))/,
        /\ben\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 &'-]{2,40})/
      ];

  for (let i = 0; i < intentos.length; i++) {
    const hallado = texto.match(intentos[i]);
    if (!hallado) continue;
    const limpio = limpiarNombre(hallado[1]);
    // "en tu cuenta", "en el sitio web": son frases del correo, no tiendas
    if (/^(tu|su|el|la|los|las|nuestro|nuestra|l[ií]nea|internet|el sitio)\b/i.test(limpio)) continue;
    if (limpio.length >= 3) return limpio;
  }
  return '';
}

/* Devuelve {monto, tipo, comercio} o null si el correo no sirve. */
function interpretarCorreo(asunto, cuerpo) {
  const texto = (asunto + '\n' + cuerpo).replace(/\s+/g, ' ');

  if (NO_CUENTA.test(texto)) return null;
  if (!ES_MOVIMIENTO.test(texto)) return null;

  const monto = montoDelCorreo(texto);
  if (!monto) return null;

  const esIngreso = ES_INGRESO.test(texto);
  return {
    monto: monto,
    tipo: esIngreso ? 'ingreso' : 'gasto',
    // Sin nombre igual se manda: el monto y la fecha ya sirven, y en la app
    // le pones la categoría a mano. Peor sería perder el movimiento.
    comercio: comercioDelCorreo(texto, esIngreso) || (esIngreso ? 'Abono' : 'Compra')
  };
}

/* ================================================================
   LEER GMAIL
   ================================================================ */

// El HTML del correo convertido en texto corrido. Los bancos mandan
// tablas y estilos; a nosotros nos sirven solo las palabras.
function textoPlano(mensaje) {
  const cuerpo = mensaje.getPlainBody();
  if (cuerpo && cuerpo.trim()) return cuerpo;
  return mensaje.getBody()
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function busquedaGmail() {
  const de = CONFIG.BANCOS.map(function (d) { return 'from:' + d; }).join(' OR ');
  return '(' + de + ') newer_than:' + CONFIG.DIAS + 'd -label:"' + CONFIG.ETIQUETA + '"';
}

// Recorre los correos y devuelve lo entendido. No manda ni marca nada:
// eso lo deciden quienes la llaman, que son el lector y la prueba.
function recolectar() {
  const hilos = GmailApp.search(busquedaGmail(), 0, 50);
  const salida = [];

  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (mensaje) {
      const leido = interpretarCorreo(mensaje.getSubject(), textoPlano(mensaje));
      salida.push({
        hilo: hilo,
        id: mensaje.getId(),
        asunto: mensaje.getSubject(),
        de: mensaje.getFrom(),
        fecha: mensaje.getDate(),
        leido: leido
      });
    });
  });

  return salida;
}

/* ================================================================
   PROBAR SIN MANDAR NADA
   Esta es la que se ejecuta primero. Muestra en el registro qué habría
   entendido de cada correo, y no toca el buzón ni marca los correos.
   Si algo sale mal interpretado, esta salida es lo que hay que mirar.
   ================================================================ */
function probarLector() {
  const encontrados = recolectar();

  Logger.log('Búsqueda: ' + busquedaGmail());
  Logger.log('Correos que calzan: ' + encontrados.length);
  Logger.log('--- NO SE MANDÓ NADA. Esto es solo una prueba. ---');

  if (!encontrados.length) {
    Logger.log('');
    Logger.log('Si esperabas ver algo, revisa:');
    Logger.log(' - que CONFIG.BANCOS tenga el dominio de tu banco');
    Logger.log('   (mira de qué dirección llega el aviso: "de: xxx@banco.cl")');
    Logger.log(' - que tengas avisos de los últimos ' + CONFIG.DIAS + ' días');
    return;
  }

  encontrados.forEach(function (c, i) {
    Logger.log('');
    Logger.log((i + 1) + ') ' + c.asunto);
    Logger.log('   de: ' + c.de + '   fecha: ' + c.fecha);
    if (c.leido) {
      Logger.log('   ENTENDÍ -> ' + c.leido.tipo + ' de $' +
                 c.leido.monto.toLocaleString('es-CL') + ' en "' + c.leido.comercio + '"');
    } else {
      Logger.log('   NO LO ANOTÉ (no parece un aviso de compra, o no le encontré el monto)');
    }
  });

  const entendidos = encontrados.filter(function (c) { return c.leido; }).length;
  Logger.log('');
  Logger.log('Resumen: entendí ' + entendidos + ' de ' + encontrados.length + '.');
  Logger.log('Si alguno quedó mal, copia SU LÍNEA de acá (no el correo) y la corregimos.');
}

/* ================================================================
   EL LECTOR DE VERDAD
   Es lo que corre cada 15 minutos.
   ================================================================ */
function revisarCorreos() {
  if (CONFIG.BUZON.indexOf('TU-CUENTA') !== -1) {
    throw new Error('Falta poner la dirección de tu buzón en CONFIG.BUZON');
  }

  const encontrados = recolectar();
  if (!encontrados.length) return;

  const mensajes = [];
  encontrados.forEach(function (c) {
    if (!c.leido) return;
    mensajes.push({
      // El id del correo es el id en el buzón: si por lo que sea el mismo
      // correo se manda dos veces, se sobrescribe en vez de duplicarse.
      id: c.id,
      texto: c.leido.comercio,
      monto: c.leido.monto,
      tipo: c.leido.tipo,
      fecha: c.fecha.toISOString(),
      de: 'correo'
    });
  });

  if (mensajes.length) enviarAlBuzon(mensajes);

  /* Se marcan TODOS los correos mirados, incluidos los que no se
     entendieron. Si solo se marcaran los entendidos, los otros se
     volverían a leer cada 15 minutos para nada, durante tres días. */
  const etiqueta = GmailApp.getUserLabelByName(CONFIG.ETIQUETA) ||
                   GmailApp.createLabel(CONFIG.ETIQUETA);
  const hilosVistos = [];
  encontrados.forEach(function (c) {
    if (hilosVistos.indexOf(c.hilo.getId()) === -1) {
      hilosVistos.push(c.hilo.getId());
      c.hilo.addLabel(etiqueta);
    }
  });
}

/* Arma la dirección de /anotar conservando la clave. Se le saca la barra
   final a la base si la trae: sin esto, pegar la dirección con barra
   —"...workers.dev/?k=..."— daba "//anotar" y el buzón contestaba 404. */
function urlAnotar() {
  const partes = CONFIG.BUZON.split('?');
  const base = partes[0].replace(/\/+$/, '');
  const clave = partes[1] || '';
  return base + '/anotar' + (clave ? '?' + clave : '');
}

function enviarAlBuzon(mensajes) {
  const respuesta = UrlFetchApp.fetch(urlAnotar(), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ mensajes: mensajes }),
    muteHttpExceptions: true
  });

  const codigo = respuesta.getResponseCode();
  if (codigo !== 200) {
    // Se lanza el error a propósito: así Google te manda el correo de
    // "tu script falló" y te enteras, en vez de que deje de funcionar
    // en silencio durante semanas.
    throw new Error('El buzón contestó ' + codigo + ': ' + respuesta.getContentText());
  }
  Logger.log('Mandados al buzón: ' + mensajes.length);
}

/* ================================================================
   EL DISPARADOR
   ================================================================ */
function instalarDisparador() {
  desinstalarDisparador();          // nunca dos corriendo a la vez
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(15).create();
  Logger.log('Listo: va a revisar tus correos cada 15 minutos.');
}

function desinstalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCorreos') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Disparador detenido.');
}
