/* ================================================================
   EL LECTOR DE CORREOS DEL BANCO — PASO 1: PROBARLO
   Se pega en Google Apps Script (script.google.com), en la cuenta a la
   que llegan los avisos.

   Este archivo todavía NO le manda nada a la app. Solo tiene la parte
   que lee y entiende los correos, y una función para mirar qué entendió.
   Es a propósito: primero se comprueba que lee bien TUS avisos, y recién
   después se conecta con la app. Si los parsers fallan, conectarlos sería
   llenar la app de datos malos.

   CÓMO PROBARLO
   1. Pega TODO este archivo en el proyecto (borrando lo que haya).
   2. Arriba, en la lista de funciones, elige  probarLector
   3. Aprieta ▷ Ejecutar.
      La primera vez Google pide permiso para leer tu Gmail: es este
      script, corriendo en tu cuenta, y no le manda nada a nadie.
   4. Abre "Registro de ejecución" abajo y mira lo que entendió.

   NO manda nada a ninguna parte y NO marca ni mueve ningún correo.
   Se puede ejecutar las veces que quieras sin consecuencias.
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

  // Cuántos días hacia atrás mirar en la corrida de verdad.
  DIAS: 7,

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
const YO_ENVIE = /(acabas de realizar|acabas de hacer|realizaste una|se ha realizado una compra|realizaste una compra|enviaste|pagaste|compra por|giro por|a terceros|a medio de pago)/i;

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
   escribes tú. En los correos de él aparecían así:

     BancoEstado     "Miguel Munoz"             sin segundo nombre, sin ñ
     Banco de Chile  "*Miguel Ignacio Muñoz*"   sin apellido, con asteriscos
     CONFIG.YO       "Miguel Ignacio Muñoz Pizarro"

   Buscar la frase completa adentro no calzaba con ninguno. Por eso se
   compara por PARTES: se parten los dos nombres en palabras y basta con
   que coincidan dos —un nombre y un apellido— para darlo por tuyo.

   Dos y no una a propósito: con una sola, cualquier "Miguel" o cualquier
   "Pizarro" del mundo sería tuyo, y en estos mismos correos hay una
   transferencia real a "Ema Pizarro" que NO hay que ignorar. */
function sinTildes(t) {
  return (t || '').toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n');
}

// Deja solo letras y números, para que "*Miguel*" y "Miguel" sean iguales
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
     esTraspasoMio va a buscar. El nombre estaba bien sacado —salía "Miguel
     Muñoz"— pero nadie lo comparaba, y esa transferencia se colaba como
     gasto.

     La segunda sigue estando para los correos donde no se logra extraer un
     nombre pero el asunto o la tabla igual te delatan. */
  if (contieneMiNombre(comercio) || esTraspasoMio(asunto, texto, entra)) {
    return { traspaso: true };
  }

  const monto = montoDelCorreo(texto);
  if (!monto) return null;

  return {
    monto: monto,
    tipo: entra ? 'ingreso' : 'gasto',
    /* Compra con tarjeta o transferencia a una persona. La app las trata
       distinto: las transferencias van a su propia categoría en vez de
       mezclarse con Alimentación o Gastos varios, porque pasarle plata a
       alguien no es lo mismo que comprar algo, aunque las dos resten.

       La distingue la palabra "compra", que es la que usan los bancos en
       el aviso de tarjeta y no aparece en un comprobante de transferencia. */
    clase: /\bcompra\b/i.test(texto) ? 'compra' : 'transferencia',
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

/* Al probar se miran más días y NO se excluye lo ya etiquetado: si no,
   la segunda vez que ejecutas la prueba no te muestra nada, porque la
   corrida de verdad ya se llevó todo, y parece que dejó de funcionar. */
function busquedaGmail(esPrueba) {
  const de = CONFIG.BANCOS.map(function (d) { return 'from:' + d; }).join(' OR ');
  const dias = esPrueba ? CONFIG.DIAS_AL_PROBAR : CONFIG.DIAS;

  /* OJO con los espacios de la etiqueta. Gmail busca las etiquetas con
     GUIONES donde el nombre tiene espacios: -label:Anotado-en-Finanzas
     funciona, y -label:"Anotado en Finanzas" no excluye nada.

     Con la forma entre comillas los correos se etiquetaban bien pero la
     exclusión no los reconocía, así que la app volvía a ofrecer los mismos
     movimientos cada vez que la abrías. */
  const etiqueta = CONFIG.ETIQUETA.replace(/\s+/g, '-');

  return '(' + de + ') newer_than:' + dias + 'd' +
         (esPrueba ? '' : ' -label:' + etiqueta);
}

// Recorre los correos y devuelve lo entendido. No manda ni marca nada:
// eso lo deciden quienes la llaman, que son el lector y la prueba.
function recolectar(esPrueba) {
  const hilos = GmailApp.search(busquedaGmail(esPrueba), 0, 50);
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
      Logger.log('   ENTENDÍ -> ' + c.leido.tipo + ' de $' +
                 c.leido.monto.toLocaleString('es-CL') + ' en "' + c.leido.comercio + '"');
    } else {
      Logger.log('   NO LO ANOTÉ (no parece un aviso de compra, o no le encontré el monto)');
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
      fecha: c.fecha.toISOString()
    });
  });

  return salida;
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
