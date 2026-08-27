/* ================================================================
   EL LECTOR DE CORREOS DEL BANCO
   Se pega en Google Apps Script (script.google.com), en la cuenta a la
   que llegan los avisos.

   Hace dos cosas:
   - LEE tus correos del banco y entiende qué movimiento cuenta cada uno.
   - Se los ENTREGA a la app cuando ella los pide (la parte de doGet, al
     final del archivo).

   ANTES DE NADA: llena las dos líneas de más abajo que vienen con texto
   de ejemplo, CONFIG.YO y CONFIG.CLAVE. Se pierden cada vez que pegas
   este archivo encima, y las dos fallan distinto:
     - Sin CONFIG.YO, los traspasos entre tus propias cuentas se cuentan
       como movimientos y tus totales del mes quedan inflados. Al menos
       probarLector te lo grita.
     - Sin CONFIG.CLAVE, la app deja de recibir movimientos y NADIE TE
       AVISA. Y tiene que ser la MISMA clave que ya tiene la app.

   PARA PROBARLO, sin tocar nada ni mandar nada:
   1. Pega TODO este archivo en el proyecto (borrando lo que haya).
   2. Llena CONFIG.YO y CONFIG.CLAVE.
   3. Arriba, en la lista de funciones, elige  probarLector
   4. Aprieta ▷ Ejecutar.
      La primera vez Google pide permiso para leer tu Gmail: es este
      script, corriendo en tu cuenta.
   5. Abre "Registro de ejecución" abajo y mira lo que entendió.

   probarLector NO marca ni mueve ningún correo y NO le manda nada a la
   app. Se puede ejecutar las veces que quieras sin consecuencias.

   PARA QUE LOS CAMBIOS LLEGUEN A LA APP hay que publicar:
   Implementar -> Administrar implementaciones -> lápiz -> Nueva versión.
   Nunca "Nueva implementación": crea otra dirección y deja la anterior
   sin servicio, en silencio.
   ================================================================ */

const CONFIG = {
  /* De quién son los correos que se miran. Se busca por el dominio del
     remitente, que es lo único que no cambia cuando el banco rediseña.
     Si tu banco no está, agrégalo; si sobra alguno, bórralo. */
  BANCOS: [
    'bancochile.cl',      // Banco de Chile y Edwards
    'bancoestado.cl',
    'somosmach.com',      // MACH
    'santander.cl',
    'bci.cl'
  ],

  /* Los remitentes del banco que SOLO mandan publicidad. Se excluyen en la
     búsqueda de Gmail, no después.

     No es cosmético, y esto costó verlo: Gmail entrega de a 50 conversaciones
     por búsqueda, y la publicidad se come ese cupo. En una prueba de 60 días
     salieron 55 correos y 28 eran promociones del BCI; los correos más viejos
     —entre ellos el único aviso de compra con TARJETA DE CRÉDITO que había—
     quedaron fuera del cupo y no llegaron a mirarse nunca. Parecía que ese
     correo no existía, y lo que pasaba es que no alcanzaba a entrar.

     Van dominios completos y no palabras: "beneficio" o "promoción" también
     aparecen en el pie de correos de verdad. */
  NO_MIRAR: [
    'info.bci.cl',            // "Conoce Bci", "Fer del Bci"
    'comercial.bancochile.cl' // avisos comerciales del Banco de Chile
  ],

  /* Cuántos días hacia atrás mirar en la corrida de verdad. No es lo mismo
     que DESDE: esto es la ventana para ponerse al día si no abriste la app
     en unos días, y aquello es una raya en el pasado que no se cruza nunca.
     Con 7 sobra: aunque te vayas una semana, nada se pierde. */
  DIAS: 7,

  /* La fecha desde la que se empieza a mirar, en formato aaaa/mm/dd.

     Sirve para partir con la cuenta limpia: todo lo anterior a este día se
     ignora para siempre, aunque caiga dentro de los 7 días de arriba. Sin
     esto, al conectar la app te llega de golpe el historial de la semana
     —transferencias viejas que ya tenías anotadas a mano— y hay que
     descartarlas una por una.

     Ponla en el día que conectas. Después no hay que tocarla más: la
     ventana de DIAS avanza sola con el tiempo y esta raya queda atrás.

     Déjala vacía ('') si algún día quieres que mire todo el historial que
     alcance la ventana. */
  DESDE: '',

  /* Cuántos al probar. Es más largo a propósito: la primera vez quieres
     VER algo, y si justo no compraste nada en la última semana saldría
     vacío y parecería que está roto. */
  DIAS_AL_PROBAR: 60,

  // La etiqueta con que se marca lo ya procesado. Se crea sola.
  ETIQUETA: 'Anotado en Finanzas',

  /* TU NOMBRE, como lo escriben los bancos. Sirve para reconocer los
     traspasos entre tus propias cuentas y NO anotarlos: pasar plata de
     BancoEstado a MACH no es un ingreso ni un gasto, es la misma plata
     cambiada de bolsillo. Si se anotara, tus totales del mes se inflarían
     por los dos lados.

     Pon las variantes que uses. En el correo de MACH aparece completo
     ("Recibiste una transferencia de Nombre Apellido Apellido"), pero
     otros bancos lo escriben distinto o en mayúsculas. Da lo mismo cómo
     lo escribas acá: se compara sin distinguir mayúsculas. */
  YO: [
    'ESCRIBE TU NOMBRE COMPLETO AQUÍ'
  ],

  /* La contraseña de tu buzón de movimientos.

     La dirección del script es "cualquiera con el enlace", así que sin
     esto bastaría con adivinar la URL para leer tus movimientos. Con la
     clave, la dirección completa —dirección + clave— es la contraseña.

     Inventa una larga y rara. No tiene que ser memorizable: la pegas una
     sola vez en la app y no la escribes nunca más. Algo como
     "perro-azul-4471-mesa-verde" sirve de sobra.

     Esa dirección con la clave adentro NO se le muestra a nadie, ni se
     pega en un chat: es la llave de tus movimientos. */
  CLAVE: 'INVENTA_UNA_CLAVE_LARGA_AQUI'
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

/* --- ¿Salió o entró la plata? ---

   Esta es la parte que más importa que esté bien: un gasto anotado como
   ingreso no solo queda mal, deja tus totales del mes al revés.

   La decisión NO se toma buscando palabras sueltas en todo el correo.
   Así se hacía antes y estaba mal: el comprobante de una transferencia
   que TÚ enviaste trae en la letra chica "los fondos serán acreditados
   en la cuenta de destino", y esa palabra sola lo convertía en ingreso.

   Se mira la frase con que abre el correo, que es la que de verdad dice
   lo que pasó y ningún banco escribe al azar:

     "Acabas de realizar una Transferencia"   (BancoEstado, plata que sale)
     "Realizaste una transferencia"           (MACH, plata que sale)
     "se ha realizado una compra"             (Banco de Chile, gasto)
     "Recibiste una transferencia de..."      (MACH, plata que entra)

   Primero se pregunta si TÚ lo hiciste. Solo si eso no calza se pregunta
   si te llegó. Y recién al final queda el método viejo, por si aparece un
   banco con otra redacción. */
/* "usted ha efectuado una transferencia" es del Banco de Chile, y tiene que
   llevar el "usted" SÍ O SÍ.

   Sin el "usted", esta frase también aparece cuando te llega plata: "nuestro(a)
   cliente Fulano ha efectuado una transferencia de fondos A TU CUENTA". Ese
   error ya se cometió una vez y las transferencias a terceros entraban como
   ingreso. El "usted" es lo único que separa una de la otra.

   Lo que la hizo falta (27 de agosto de 2026): los avisos "Transferencias de
   Fondos a Khipu Clbs D" y "a TOKU SPA" se descartaban enteros. El pie del
   correo del banco trae una palabra de SUENA_A_PUBLICIDAD, y como ninguna
   frase de acá calzaba, loDescarta concluía "es publicidad y no dice que haya
   pasado nada". El monto y el nombre estaban perfectos; nunca se llegó a
   mirarlos.

   Y el detalle que lo explica todo: "a Medio de Pago Fintoc" —el mismo correo,
   el mismo pie— SÍ se leía. No por mérito de nadie: el NOMBRE del destinatario
   contenía "a medio de pago", que estaba en esta lista por otra razón. Un
   correo se salvaba por accidente y dos se perdían. Cuidado con las entradas
   cortas de acá: calzan con nombres de empresas, no solo con frases del banco. */
const YO_ENVIE = /(acabas de realizar|acabas de hacer|realizaste una|se ha realizado una compra|realizaste una compra|usted ha efectuado una transferencia|enviaste|pagaste|compra por|giro por|a terceros|a medio de pago)/i;

/* Ojo con esta frase: tiene que ser LA COMPLETA. El Banco de Chile avisa lo
   que RECIBES con "nuestro(a) cliente Fulano ha efectuado una transferencia
   de fondos A TU CUENTA". Al principio bastaba con "ha efectuado una
   transferencia", y eso salió mal: esa media frase también aparece cuando
   quien la efectúa eres tú, así que las transferencias a terceros entraban
   como ingreso. Lo que distingue una de otra es el "a tu cuenta". */
const YO_RECIBI = /(recibiste|te transfiri|transferencia recibida|abono en tu cuenta|dep[oó]sito en tu cuenta|transferencia de fondos a tu cuenta)/i;

/* El respaldo, para un banco que no diga ninguna de las de arriba.
   Ojo: acá ya NO está "acreditad". Esa palabra vive en la letra chica de
   los comprobantes de envío y era justamente la que daba vuelta el signo. */
const ES_INGRESO = /(transferencia recibida|recibiste|te transfiri|abono|dep[oó]sito)/i;

function laPlataEntra(texto) {
  if (YO_ENVIE.test(texto)) return false;
  if (YO_RECIBI.test(texto)) return true;
  return ES_INGRESO.test(texto);
}

/* --- Lo que descarta un correo --- 

   Son dos listas y no una, porque las palabras no pesan lo mismo.

   Las FUERTES dicen que la plata no se movió: una compra rechazada, una
   transferencia anulada. Esas mandan siempre, pase lo que pase. Sin ellas,
   un aviso de compra rechazada te anotaría un gasto que nunca ocurrió.

   Las de PUBLICIDAD son otra cosa. "Promoción", "beneficio" y "newsletter"
   sirven para botar la publicidad del banco, pero también aparecen en el
   pie de correos legítimos: MACH cierra sus comprobantes de transferencia
   hablando de tus beneficios, y por esa sola palabra se descartaban TODAS
   sus transferencias.

   Por eso estas segundas solo descartan si el correo no dice, además, que
   una transacción ocurrió de verdad. Si el banco abre con "Recibiste una
   transferencia", lo que diga el pie ya no importa. */
const NO_CUENTA_FUERTE = /(rechazad|no se (pudo|realiz)|fallid|anulad|revertid|no reconoces|si no reconoces|estado de cuenta|resumen mensual)/i;

const SUENA_A_PUBLICIDAD = /(newsletter|promoci[oó]n|beneficio)/i;

function loDescarta(texto) {
  if (NO_CUENTA_FUERTE.test(texto)) return true;
  if (!SUENA_A_PUBLICIDAD.test(texto)) return false;
  // Tiene palabra de publicidad: solo se salva si además dice que pasó algo
  return !(YO_ENVIE.test(texto) || YO_RECIBI.test(texto));
}

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

  if (!candidatos.length) {
    /* MACH arma el correo como tabla y pone la cifra en su propia celda,
       sin el signo peso: "Monto | 12.000". Con la regla de arriba no
       aparecía ningún candidato y el correo se descartaba entero, que es
       por qué MACH fallaba siempre.

       Este segundo intento solo corre si no se encontró nada con $, y se
       exige que la cifra venga justo después de la palabra "Monto": un
       número suelto en un correo puede ser cualquier cosa —un folio, un
       número de cuenta, un año— y anotarlo como plata sería peor que no
       anotar nada. */
    const suelto = texto.match(/\bmonto\b[^\d]{0,25}([\d][\d.]{2,})/i);
    if (suelto) {
      const n = Number(suelto[1].replace(/\./g, ''));
      if (isFinite(n) && n >= 100) return n;
    }
    return null;
  }
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
  /* Los comprobantes de transferencia vienen como tabla y el nombre de la
     otra persona está etiquetado. Se prueba primero porque es lo más
     confiable que hay: no se adivina, el banco lo dice.

     Pero SOLO cuando la plata sale. En un ingreso, el bloque "Datos de
     destinatario" del Banco de Chile te describe a TI, y sacar de ahí el
     "comercio" pondría tu propio nombre en cada plata que te llega. Ahí la
     contraparte va en la frase de apertura: "nuestro(a) cliente Fulano ha
     efectuado una transferencia a tu cuenta". */
  if (esIngreso) {
    const remite = texto.match(/cliente\s*(?:\(a\))?\s+([^\n]{2,50}?)\s+ha efectuado/i) ||
                   texto.match(/\b(?:remitente|ordenante)\s*:?\s*([^\n]{2,40}?)(?=\s+rut\b)/i);
    if (remite) {
      const limpio = limpiarNombre(remite[1]);
      if (limpio.length >= 3) return limpio;
    }
  } else {
    /* "Nombre y Apellido" es como lo rotula el Banco de Chile; "Nombre" a
       secas, BancoEstado; "Nombre destinatario", MACH. El "Rut" que viene
       después es lo que marca dónde termina. */
    const destinatario = texto.match(/\bnombre(?:\s+y\s+apellido|\s+(?:destinatario|remitente|beneficiario|ordenante))?\s*:?\s*([^\n]{2,40}?)(?=\s+rut\b)/i);
    if (destinatario) {
      const limpio = limpiarNombre(destinatario[1]);
      if (limpio.length >= 3) return limpio;
    }
  }

  /* El número de la tarjeta se saca ANTES de buscar el comercio, y no es
     un capricho: el aviso de crédito dice "con Tarjeta de Crédito
     terminada en 1234 en JUMBO el 10/07/2026", y la regla que busca el
     nombre después de "en" se llevaba "1234 en JUMBO" como si fuera el
     nombre de la tienda. Sacando el pedazo de la tarjeta, el único "en"
     que queda es el bueno. */
  const sinTarjeta = texto
    .replace(/\bterminad[ao]\s+en\s+[\dxX*•·-]{2,}/gi, ' ')
    .replace(/\bfinal(?:izada)?\s+en\s+[\dxX*•·-]{2,}/gi, ' ')
    .replace(/[*xX•·]{2,}[\s-]*\d{3,4}/g, ' ');

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
    const hallado = sinTarjeta.match(intentos[i]);
    if (!hallado) continue;
    const limpio = limpiarNombre(hallado[1]);
    /* Frases del correo que no son el nombre de nadie. "Chile" estaba
       saliendo como comercio en TODOS los avisos del Banco de Chile: la
       regla veía "…de Chile" en el pie del correo y se la llevaba. Y
       "Transferencia Electronica de Fondos" es el tipo de operación, no
       quién te transfirió. */
    if (/^(tu|su|el|la|los|las|nuestro|nuestra|l[ií]nea|internet|el sitio|chile|estado|banco|transferencia|comprobante|fondos|cuenta|l[ií]nea)\b/i.test(limpio)) continue;
    if (limpio.length >= 3) return limpio;
  }
  return '';
}

/* --- ¿Es un traspaso entre tus propias cuentas? ---

/* Compara nombres como los escriben los bancos, que nunca es como los
   escribes tú. Un mismo nombre llegaba en tres formas distintas:

     BancoEstado     "NOMBRE APELLIDO"                 sin segundo nombre, sin ñ
     Banco de Chile  "*NOMBRE NOMBRE2 APELLIDO*"       sin el segundo apellido,
                                                       y con asteriscos
     CONFIG.YO       "NOMBRE NOMBRE2 APELLIDO APELLIDO2"

   Buscar la frase completa adentro no calzaba con ninguno. Por eso se
   compara por PARTES: se parten los dos nombres en palabras y basta con
   que coincidan dos —un nombre y un apellido— para darlo por tuyo.

   Dos y no una a propósito: con una sola, cualquier "NOMBRE" o cualquier
   "APELLIDO" del mundo sería tuyo, y entre estos correos hay una
   transferencia real a "OTRO-NOMBRE APELLIDO" —un pariente, que comparte
   el apellido pero no es uno— que NO hay que ignorar. */
function sinTildes(t) {
  return (t || '').toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n');
}

// Deja solo letras y números, para que "*NOMBRE*" y "NOMBRE" sean iguales
function enPalabras(t) {
  return sinTildes(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
}

function contieneMiNombre(donde) {
  if (!donde) return false;
  const suyas = enPalabras(donde);

  return CONFIG.YO.some(function (n) {
    if (!n || n.indexOf('ESCRIBE TU NOMBRE') !== -1) return false;

    const mias = enPalabras(n).filter(function (p) { return p.length >= 3; });
    if (!mias.length) return false;

    const calzan = mias.filter(function (p) { return suyas.indexOf(p) !== -1; }).length;
    return calzan >= Math.min(2, mias.length);
  });
}

function esTraspasoMio(asunto, texto, entra) {
  // "Recibiste una transferencia de [tu nombre]" — MACH lo dice en el asunto
  if (contieneMiNombre(asunto)) return true;

  if (entra) {
    /* Te llegó plata: la contraparte es QUIEN LA MANDÓ, y va en la frase
       de apertura. Acá NO se puede mirar el bloque "Datos de destinatario"
       del Banco de Chile: en una transferencia recibida el destinatario
       eres tú, así que buscarte ahí marcaría como traspaso tuyo cada peso
       que te transfiera cualquiera. */
    const quien = texto.match(/cliente\s*(?:\(a\))?\s+([^\n]{2,50}?)\s+ha efectuado/i) ||
                  texto.match(/\b(?:remitente|ordenante)\s*:?\s*([^\n]{2,40}?)(?=\s+rut\b)/i);
    return quien ? contieneMiNombre(quien[1]) : false;
  }

  /* Salió plata: la contraparte es a QUIEN se la mandaste, y esa sí va en
     la tabla del destinatario. Solo los 200 caracteres siguientes: más
     allá vuelve a aparecer tu nombre en el pie y volveríamos al problema. */
  const partes = texto.split(/\bhacia\b|destinatario/i);
  if (partes.length < 2) return false;
  return contieneMiNombre(partes.slice(1).join(' ').slice(0, 200));
}

/* Devuelve {monto, tipo, comercio} o null si el correo no sirve.
   También devuelve {traspaso:true} en los traspasos tuyos, a propósito. */
/* --- ¿Con qué pagaste? Débito o crédito ---

   Acá no hay nada que adivinar: el Banco de Chile lo escribe dos veces, en
   el asunto y en el cuerpo, y son dos correos distintos.

     "Compra con Tarjeta de Crédito"   asunto
     "...una compra por $X con Tarjeta de Crédito ... en COMERCIO el ..."

     "Cargo en Cuenta"                 asunto
     "...una compra por $X con cargo a Cuenta ... en COMERCIO el ..."

   Ojo con lo segundo: el débito casi nunca se llama débito. La compra con
   la tarjeta de la cuenta corriente llega como "cargo a Cuenta", y para lo
   único que nos importa —¿la plata salió hoy?— es exactamente lo mismo.
   Por eso las dos formas cuentan como débito.

   Devuelve '' cuando el correo no lo dice, y eso es a propósito. Vale para
   los otros bancos, cuya redacción todavía no se ha visto: es mejor dejarlo
   en blanco que inventarle un medio de pago a una compra. */
const CON_CREDITO = /tarjeta\s+de\s+cr[eé]dito/i;
const CON_DEBITO  = /(tarjeta\s+de\s+d[eé]bito|cargo\s+(?:a|en)\s+(?:tu\s+)?cuenta|redcompra)/i;

function medioDePago(texto) {
  /* Crédito primero. "Tarjeta de Crédito" no admite discusión, y algunos
     avisos de crédito nombran igual la cuenta donde después se paga la
     tarjeta, así que preguntar por el débito antes daría vuelta el caso. */
  if (CON_CREDITO.test(texto)) return 'credito';
  if (CON_DEBITO.test(texto)) return 'debito';
  return '';
}

/* Por qué un correo no se anotó, dicho en palabras.

   Existe SOLO para la prueba: no lo llama nadie del camino de verdad, así que
   no puede romper nada. Se escribió porque "NO LO ANOTÉ (no parece un aviso de
   compra, o no le encontré el monto)" juntaba cuatro motivos distintos en una
   sola frase, y con eso no se puede arreglar nada.

   El caso que lo motivó: "Transferencias de Fondos a Khipu Clbs D" y "a TOKU
   SPA" no encuentran monto, y "a Medio de Pago Fintoc" —mismo banco, mismo
   asunto— sí. Para saber la diferencia hay que ver QUÉ CIFRAS vio y por cuál
   descartó cada una. Adivinar desde acá no sirve; ya se intentó otras veces y
   siempre ganó mirar el correo de verdad.

   El orden importa: es el mismo que sigue interpretarCorreo, para que lo que
   se lea acá sea de verdad el motivo por el que se cayó y no otro parecido. */
function motivoDelRechazo(asunto, cuerpo) {
  const texto = (asunto + '\n' + cuerpo).replace(/\s+/g, ' ');

  if (NO_CUENTA_FUERTE.test(texto)) {
    return 'dice que la plata NO se movió: "' + texto.match(NO_CUENTA_FUERTE)[0] + '"';
  }
  if (loDescarta(texto)) return 'parece publicidad y no dice que haya pasado nada';
  if (!ES_MOVIMIENTO.test(texto)) return 'no habla de plata que se haya movido';

  if (!montoDelCorreo(texto)) {
    /* Se repite el recorrido de montoDelCorreo, pero contando en voz alta.
       La ventana de 45 caracteres y el uso de hallado.index son los mismos de
       allá A PROPÓSITO: si acá se mirara distinto, el diagnóstico explicaría
       una decisión que nadie tomó. Al tocar montoDelCorreo, tocar esto. */
    const vistas = [];
    const busca = /\$\s*([\d][\d.]*)/g;
    let hallado;
    while ((hallado = busca.exec(texto)) !== null) {
      const n = Number(hallado[1].replace(/\./g, ''));
      const antes = texto.slice(Math.max(0, hallado.index - 45), hallado.index);
      let veredicto;
      if (!isFinite(n) || n < 100) veredicto = 'menos de $100, la ignoré';
      else if (NO_ES_EL_MONTO.test(antes)) veredicto = 'venía después de "' + antes.match(NO_ES_EL_MONTO)[0] + '"';
      else veredicto = 'la habría tomado';
      vistas.push('$' + hallado[1] + ' → ' + veredicto);
    }

    // El segundo intento, el de las cifras sin signo peso ("Monto | 12.000")
    const suelto = texto.match(/\bmonto\b[^\d]{0,25}([\d][\d.]{2,})/i);
    const cola = suelto
      ? '  Y sin signo $ vi "' + suelto[0] + '", pero no me sirvió.'
      : '  Tampoco hay una cifra pegada a la palabra "Monto".';

    /* Y el pedazo crudo alrededor de la palabra "Monto", que es lo único que
       cierra el caso.

       Estos correos del Banco de Chile traen el monto en una TABLA
       ("Datos de la Transferencia: Fecha · Cuenta · Monto · ID"), y una tabla
       no llega igual a texto plano que un párrafo: Gmail puede dejar la
       etiqueta y su valor juntos, o poner todas las etiquetas seguidas y los
       valores después. Sin ver cómo quedó, cualquier arreglo es adivinanza,
       y en este lector adivinar ya salió mal cinco veces.

       Se muestran 90 caracteres a cada lado. Sale solo en la prueba, que es
       algo que corres tú y lees tú. */
    const donde = texto.search(/\bmonto\b/i);
    const crudo = donde === -1
      ? '  La palabra "Monto" no aparece en ninguna parte del correo.'
      : '\n     Así llegó el pedazo del "Monto": ...' +
        texto.slice(Math.max(0, donde - 90), donde + 90).trim() + '...';

    return (vistas.length
      ? 'no le encontré el monto. Cifras con $ que vi: ' + vistas.join(' | ')
      : 'no le encontré el monto: no hay ninguna cifra con signo $') + cola + crudo;
  }


  // No debería llegar acá nunca: si hay monto y no lo descartó nada, el
  // correo se habría entendido y esta función ni se habría llamado.
  return 'no sé por qué, avísame si ves esto';
}

/* El motivo, con el tamaño del texto por delante.

   El tamaño no es un adorno. Los correos de Khipu y TOKU, reconstruidos a
   mano con lo que se ve en pantalla, se leen PERFECTO: $26.749 y $14.990, con
   el nombre y el tipo correctos. O sea que lo que los rompe no está en lo que
   uno ve, sino en lo que textoPlano recibe de Gmail.

   getPlainBody() devuelve la versión en texto que arma Google, y no siempre
   trae todo: una tabla puede llegar vacía, cortada, o el correo puede venir
   sin parte de texto y caer al respaldo que desarma el HTML. Un cuerpo de 80
   caracteres cuando la pantalla muestra media página lo dice al tiro. */
function porQueNo(asunto, cuerpo) {
  const largo = (cuerpo || '').length;
  const aviso = largo < 200
    ? ' !! OJO: el texto que recibí tiene solo ' + largo + ' caracteres. ' +
      'Gmail no me está entregando el correo completo, y ese es el problema de raíz.'
    : ' (texto recibido: ' + largo + ' caracteres)';
  return motivoDelRechazo(asunto, cuerpo) + aviso;
}

function interpretarCorreo(asunto, cuerpo) {
  const texto = (asunto + '\n' + cuerpo).replace(/\s+/g, ' ');

  if (loDescarta(texto)) return null;
  if (!ES_MOVIMIENTO.test(texto)) return null;

  const entra = laPlataEntra(texto);
  const comercio = comercioDelCorreo(texto, entra);

  /* Dos formas de reconocer un traspaso tuyo, y la primera es la buena:
     si el nombre de la contraparte que ya se extrajo eres TÚ, es tuyo y
     punto. No importa de qué parte del correo salió ni cómo lo rotule el
     banco.

     Hizo falta porque el aviso de "Transferencia a Terceros" del Banco de
     Chile no usa las palabras "Hacia" ni "destinatario", que es donde
     esTraspasoMio va a buscar. El nombre estaba bien sacado —salía
     "NOMBRE APELLIDO"— pero nadie lo comparaba, y esa transferencia se
     colaba como gasto.

     La segunda sigue estando para los correos donde no se logra extraer un
     nombre pero el asunto o la tabla igual te delatan. */
  if (contieneMiNombre(comercio) || esTraspasoMio(asunto, texto, entra)) {
    return { traspaso: true };
  }

  const monto = montoDelCorreo(texto);
  if (!monto) return null;

  /* Compra con tarjeta o transferencia a una persona. La app las trata
     distinto: las transferencias van a su propia categoría en vez de
     mezclarse con Alimentación o Gastos varios, porque pasarle plata a
     alguien no es lo mismo que comprar algo, aunque las dos resten.

     La distingue la palabra "compra", que es la que usan los bancos en
     el aviso de tarjeta y no aparece en un comprobante de transferencia. */
  const clase = /\bcompra\b/i.test(texto) ? 'compra' : 'transferencia';

  return {
    monto: monto,
    tipo: entra ? 'ingreso' : 'gasto',
    clase: clase,
    /* El medio de pago solo se pregunta en las compras. En una
       transferencia la pregunta no tiene sentido —no hay tarjeta— y el
       "con cargo a tu cuenta" de un comprobante de transferencia la
       marcaría como débito sin que eso signifique nada. */
    medio: clase === 'compra' ? medioDePago(texto) : '',
    // Sin nombre igual se manda: el monto y la fecha ya sirven, y en la app
    // le pones la categoría a mano. Peor sería perder el movimiento.
    comercio: comercio || (entra ? 'Abono' : 'Transferencia')
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

/* Al probar se miran más días, NO se excluye lo ya etiquetado y NO se
   respeta la fecha de corte. Si no, la segunda vez que ejecutas la prueba
   no te muestra nada —porque la corrida de verdad ya se llevó todo, o
   porque la raya de DESDE deja fuera todo el historial— y parece que dejó
   de funcionar. La prueba está para ver cómo lee, no para simular. */
function busquedaGmail(esPrueba) {
  const de = CONFIG.BANCOS.map(function (d) { return 'from:' + d; }).join(' OR ');
  const dias = esPrueba ? CONFIG.DIAS_AL_PROBAR : CONFIG.DIAS;
  let q = '(' + de + ') newer_than:' + dias + 'd';

  /* La publicidad se saca ACÁ, en la búsqueda, y no más adelante al leer
     cada correo. Filtrarla después igual gasta el cupo de 50 conversaciones
     que entrega Gmail, y por eso los avisos más viejos se perdían. */
  CONFIG.NO_MIRAR.forEach(function (d) { q += ' -from:' + d; });

  if (esPrueba) return q;

  /* OJO con los espacios de la etiqueta. Gmail busca las etiquetas con
     GUIONES donde el nombre tiene espacios: -label:Anotado-en-Finanzas
     funciona, y -label:"Anotado en Finanzas" no excluye nada.

     Con la forma entre comillas los correos se etiquetaban bien pero la
     exclusión no los reconocía, así que la app volvía a ofrecer los mismos
     movimientos cada vez que la abrías. */
  q += ' -label:' + CONFIG.ETIQUETA.replace(/\s+/g, '-');

  // La raya en el pasado. Va además de la ventana, no en vez de ella.
  if (CONFIG.DESDE) q += ' after:' + CONFIG.DESDE;

  return q;
}

// Recorre los correos y devuelve lo entendido. No manda ni marca nada:
// eso lo deciden quienes la llaman, que son el lector y la prueba.
/* Cuántas conversaciones pide Gmail de una vez. Gmail NO avisa cuando te
   entrega menos de las que hay: devuelve las más nuevas y calla el resto.
   Con el tope en 50 se perdieron avisos de compra sin que nada lo dijera,
   así que ahora son 100 y además se avisa cuando se llega al tope. */
const TOPE_HILOS = 100;

// Queda en true cuando la búsqueda llegó al tope, es decir cuando podría
// haber correos más viejos que no se miraron. Lo lee probarLector.
let seCortoLaBusqueda = false;

function recolectar(esPrueba) {
  const hilos = GmailApp.search(busquedaGmail(esPrueba), 0, TOPE_HILOS);
  seCortoLaBusqueda = hilos.length >= TOPE_HILOS;
  const salida = [];

  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (mensaje) {
      const asunto = mensaje.getSubject();
      const cuerpo = textoPlano(mensaje);
      const leido = interpretarCorreo(asunto, cuerpo);
      salida.push({
        hilo: hilo,
        id: mensaje.getId(),
        asunto: asunto,
        de: mensaje.getFrom(),
        fecha: mensaje.getDate(),
        leido: leido,
        /* El cuerpo se guarda SOLO en la prueba y SOLO cuando el correo no se
           entendió: es lo único que porQueNo necesita para explicarse. En la
           corrida de verdad no se guarda ninguno, para no arrastrar el texto
           completo de cada correo en memoria sin usarlo nunca. */
        cuerpo: (esPrueba && !leido) ? cuerpo : null
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
  /* Este aviso existe porque el nombre se pierde cada vez que se pega el
     archivo completo encima, y sin él la detección de traspasos queda
     apagada en silencio: los traspasos entre tus cuentas salen contados
     como ingresos y nada te lo dice. Mejor gritarlo en la primera línea. */
  const sinNombre = !CONFIG.YO.some(function (n) {
    return n && n.indexOf('ESCRIBE TU NOMBRE') === -1;
  });
  if (sinNombre) {
    Logger.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    Logger.log('   OJO: falta tu nombre en CONFIG.YO, arriba del archivo.');
    Logger.log('   Sin eso, los traspasos entre tus propias cuentas se');
    Logger.log('   cuentan como ingresos y tus totales quedan inflados.');
    Logger.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    Logger.log('');
  }

  const encontrados = recolectar(true);

  Logger.log('Búsqueda: ' + busquedaGmail(true));
  Logger.log('Correos que calzan: ' + encontrados.length);
  Logger.log('--- NO SE MANDÓ NADA NI SE MARCÓ NINGÚN CORREO. Es solo una prueba. ---');

  /* Gmail entrega hasta TOPE_HILOS conversaciones y no dice nada cuando hay
     más: simplemente te da las más nuevas. Si esto no se avisara, un correo
     viejo que falta parecería no existir en vez de no haberse mirado, que es
     exactamente lo que pasó con el primer aviso de compra con crédito. */
  if (seCortoLaBusqueda) {
    Logger.log('');
    Logger.log('!!! LA BÚSQUEDA SE CORTÓ EN ' + TOPE_HILOS + ' CONVERSACIONES.');
    Logger.log('    Puede haber correos más viejos que NO se miraron.');
    Logger.log('    Baja DIAS_AL_PROBAR, o agrega el remitente que sobra');
    Logger.log('    a CONFIG.NO_MIRAR si es publicidad.');
  }

  if (!encontrados.length) {
    Logger.log('');
    Logger.log('Si esperabas ver algo, revisa:');
    Logger.log(' - que CONFIG.BANCOS tenga el dominio de tu banco');
    Logger.log('   (mira de qué dirección llega el aviso: "de: xxx@banco.cl")');
    Logger.log(' - que tengas avisos de los últimos ' + CONFIG.DIAS_AL_PROBAR + ' días');
    return;
  }

  encontrados.forEach(function (c, i) {
    Logger.log('');
    Logger.log((i + 1) + ') ' + c.asunto);
    Logger.log('   de: ' + c.de + '   fecha: ' + c.fecha);
    if (c.leido && c.leido.traspaso) {
      Logger.log('   TRASPASO ENTRE TUS CUENTAS -> no se anota, a propósito');
    } else if (c.leido) {
      /* El medio de pago se muestra en la prueba porque es lo que hay que
         mirar con los correos de verdad: si sale vacío en una compra, ese
         banco escribe la tarjeta de otra forma y hay que agregarla. */
      const conQue = c.leido.medio ? '   [' + c.leido.medio + ']' : '';
      Logger.log('   ENTENDÍ -> ' + c.leido.tipo + ' de $' +
                 c.leido.monto.toLocaleString('es-CL') + ' en "' + c.leido.comercio + '"' + conQue);
    } else {
      Logger.log('   NO LO ANOTÉ: ' + porQueNo(c.asunto, c.cuerpo || ''));
    }
  });

  const anotables = encontrados.filter(function (c) { return c.leido && !c.leido.traspaso; });
  const traspasos = encontrados.filter(function (c) { return c.leido && c.leido.traspaso; });
  const gastos    = anotables.filter(function (c) { return c.leido.tipo === 'gasto'; }).length;

  Logger.log('');
  Logger.log('RESUMEN');
  Logger.log('  Correos mirados:       ' + encontrados.length);
  Logger.log('  Se anotarían:          ' + anotables.length +
             '  (' + gastos + ' gastos, ' + (anotables.length - gastos) + ' ingresos)');
  Logger.log('  Traspasos tuyos:       ' + traspasos.length + '  (ignorados)');
  Logger.log('  Descartados:           ' + (encontrados.length - anotables.length - traspasos.length) +
             '  (publicidad y avisos sin monto)');
  Logger.log('');
  Logger.log('Revisa sobre todo que los GASTOS digan gasto y los INGRESOS ingreso.');
  Logger.log('Si alguno quedó mal, copia SU LÍNEA de acá (no el correo) y lo corregimos.');
}

/* ================================================================
   ENTREGARLE LOS MOVIMIENTOS A LA APP

   Acá el script deja de ser una herramienta que se ejecuta a mano y pasa
   a ser el servidor de tu app. Cuando abres la app, ella le pide a esta
   dirección lo que haya pendiente.

   Son dos llamadas, las dos por GET a propósito. Apps Script no maneja
   bien el permiso previo que el navegador pide antes de un POST, y da un
   error que parece de otra cosa; con GET no existe ese problema.

     ?k=CLAVE                    -> devuelve los movimientos pendientes
     ?k=CLAVE&llevados=id1,id2   -> marca esos como ya anotados

   Por qué en dos pasos y no en uno: si la misma llamada entregara y
   marcara, un corte de internet justo ahí perdería esos movimientos para
   siempre —el correo quedaría marcado sin que la app alcanzara a
   guardarlo—. Así, la app primero guarda y recién después avisa.

   Los correos que NO se entregan —los traspasos tuyos y los que no se
   entienden— no se marcan nunca. Se vuelven a mirar cada vez, que es
   barato con una ventana de 7 días, y así un error de lectura no los
   esconde para siempre.
   ================================================================ */

function respuesta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (!CONFIG.CLAVE || CONFIG.CLAVE.indexOf('INVENTA') !== -1) {
    return respuesta({ error: 'Falta poner CONFIG.CLAVE arriba en el script.' });
  }
  if (p.k !== CONFIG.CLAVE) {
    return respuesta({ error: 'Clave incorrecta.' });
  }

  if (p.llevados) {
    return respuesta({ ok: true, marcados: marcarLlevados(p.llevados.split(',')) });
  }

  return respuesta({ movimientos: pendientes() });
}

/* Lo que la app todavía no se ha llevado. Los traspasos entre tus cuentas
   y lo que no se entendió se quedan fuera: no son movimientos. */
/* --- Dos correos, un solo movimiento ---

   El Banco de Chile avisa DOS veces la misma transferencia: "Transferencia a
   Terceros" y "Aviso de transferencia de fondos", con el mismo segundo exacto
   (00:54:07 y 18:13:02 en el registro del 27 de agosto de 2026). Son dos
   correos distintos, con id distinto, contando lo mismo.

   La clave es tipo + monto + fecha AL SEGUNDO. Dos movimientos de verdad por
   el mismo monto, en el mismo sentido y en el mismo segundo no existen.

   Lo importante, y lo que hace que esto no sea de una línea: **el id del
   correo repetido NO se tira, se pega al del que se queda separado por coma.**
   La app junta todos los ids con coma para avisar cuáles se llevó, y doGet los
   parte por coma, así que "idA,idB" viaja entero y los DOS correos terminan
   etiquetados. Si el repetido se descartara sin más, nunca se marcaría: la app
   no sabría de él, no lo reportaría, y volvería a ofrecerse en cada consulta
   para siempre.

   Ojo: en los correos reales del 27 de agosto los duplicados eran traspasos
   suyos, que se filtran antes de llegar acá. O sea que esto está probado con
   casos armados a mano, no con un duplicado suyo de verdad. */

// Los nombres que pone el lector cuando no encontró ninguno de verdad.
const NOMBRE_GENERICO = /^(transferencia|abono)$/i;

function juntarRepetidos(movs) {
  const porClave = {};
  const orden = [];

  movs.forEach(function (m) {
    const clave = m.tipo + '|' + m.monto + '|' + m.fecha.slice(0, 19);
    const ya = porClave[clave];

    if (!ya) {
      porClave[clave] = m;
      orden.push(clave);
      return;
    }

    // El id del repetido viaja pegado, para que ese correo también se marque.
    ya.id += ',' + m.id;

    /* Y de los dos avisos se rescata lo mejor de cada uno. Los dos correos del
       Banco de Chile no traen lo mismo: uno puede nombrar a la contraparte y
       el otro dejarla en "Transferencia" a secas. */
    if (m.texto && NOMBRE_GENERICO.test(ya.texto) && !NOMBRE_GENERICO.test(m.texto)) {
      ya.texto = m.texto;
    }
    if (!ya.medio && m.medio) ya.medio = m.medio;
  });

  return orden.map(function (k) { return porClave[k]; });
}

function pendientes() {
  const salida = [];

  recolectar(false).forEach(function (c) {
    if (!c.leido || c.leido.traspaso) return;
    salida.push({
      id: c.id,                       // el id del correo, para marcarlo después
      monto: c.leido.monto,
      tipo: c.leido.tipo,             // 'gasto' o 'ingreso'
      texto: c.leido.comercio,        // va al campo "Tienda" y de ahí lo clasifica
      clase: c.leido.clase,           // 'compra' o 'transferencia'
      medio: c.leido.medio,           // 'credito', 'debito', o '' si no lo dice
      fecha: c.fecha.toISOString()
    });
  });

  return juntarRepetidos(salida);
}

/* Le pone la etiqueta a los correos que la app ya guardó, para que no
   vuelvan a entregarse. Un id que ya no existe —correo borrado— no debe
   botar la llamada entera y dejar sin marcar a los demás. */
function marcarLlevados(ids) {
  const etiqueta = GmailApp.getUserLabelByName(CONFIG.ETIQUETA) ||
                   GmailApp.createLabel(CONFIG.ETIQUETA);
  let marcados = 0;

  ids.forEach(function (id) {
    try {
      const mensaje = GmailApp.getMessageById(id);
      if (mensaje) { mensaje.getThread().addLabel(etiqueta); marcados++; }
    } catch (err) { /* ese correo ya no está: se sigue con el resto */ }
  });

  return marcados;
}
