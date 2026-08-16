/* ============================================================
   DATOS DE PRUEBA — herramienta de desarrollo, NO es parte de la app
   ============================================================

   Este archivo no lo carga index.html ni lo guarda el service worker,
   asi que nunca llega al telefono. Existe solo para llenar la app y ver
   como se porta con volumen: con cinco movimientos las listas caben
   enteras, la dona tiene tres pedazos y no hay con que comparar el mes.

   COMO SE USA
   1. Abre la app en el computador (Chrome).
   2. F12 para abrir las herramientas, pestana "Console".
   3. Pega TODO este archivo y aprieta Enter.
   4. Ya tienes dos ordenes disponibles:

        datosDePrueba()        // 100 movimientos
        datosDePrueba(1000)    // la cantidad que quieras
        borrarDatosDePrueba()  // los saca todos

   Cada movimiento que crea queda marcado con prueba:true, y las fichas
   de Recordatorios que nacen de ellos tambien. Por eso se pueden sacar
   despues sin tocar los movimientos de verdad: sin la marca habria que
   adivinar cual era cual, y adivinar con la plata de alguien es
   exactamente lo que no hay que hacer.

   OJO: no pide confirmacion. Es una herramienta, no un boton de la app.
   ============================================================ */

(() => {

// Que se gasta, cada cuanto y cuanto. El "peso" es cuantas veces mas
// probable es que salga sorteado: uno come todas las semanas y va al
// dentista una vez al ano. Una lista donde todo pasa igual de seguido no
// se parece en nada a un mes real.
const PATRONES = [
  {cat:'c1', sub:'a1', peso:14, min: 8000,  max: 55000},  // Supermercado
  {cat:'c1', sub:'a4', peso:12, min: 4500,  max: 14000},  // Almuerzo
  {cat:'c1', sub:'a5', peso: 8, min: 1800,  max:  5500},  // Cafe
  {cat:'c1', sub:'a6', peso: 5, min: 7000,  max: 22000},  // Delivery
  {cat:'c4', sub:'l3', peso:10, min:  800,  max:  3000},  // Bip!
  {cat:'c4', sub:'l2', peso: 5, min: 3500,  max: 12000},  // Uber
  {cat:'c10',sub:'t1', peso: 6, min:25000,  max: 55000},  // Bencina
  {cat:'c3', sub:'v1', peso: 4, min:12000,  max: 89000},  // Ropa
  {cat:'c3', sub:'v3', peso: 3, min: 5000,  max: 16000},  // Cine
  {cat:'c11',sub:'sa1',peso: 4, min: 3500,  max: 28000},  // Farmacia
  {cat:'c8', sub:'p1', peso: 4, min: 9000,  max: 32000},  // Comida de gato
  {cat:'c3', sub:'v2', peso: 2, min:10000,  max: 45000}   // Regalo
];

// Los que caen un dia fijo del mes, siempre el mismo monto o casi
const MENSUALES = [
  {cat:'c5', sub:'i1', tipo:'ingreso', dia: 5, monto:1250000, var:0},
  {cat:'c6', sub:'g1', tipo:'ahorro',  dia: 5, monto: 300000, var:0},
  {cat:'c2', sub:'s5', tipo:'gasto',   dia: 5, monto: 420000, var:0},
  {cat:'c2', sub:'f4', tipo:'gasto',   dia:12, monto:  29900, var:0},
  {cat:'c2', sub:'f3', tipo:'gasto',   dia:12, monto:  16990, var:0},
  {cat:'c9', sub:'s1', tipo:'gasto',   dia:20, monto:  48000, var:25000},
  {cat:'c9', sub:'s2', tipo:'gasto',   dia:20, monto:  21000, var: 8000},
  {cat:'c7', sub:'u1', tipo:'gasto',   dia: 8, monto:   9990, var:0},
  {cat:'c7', sub:'u2', tipo:'gasto',   dia: 8, monto:   5100, var:0}
];

const MESES_ATRAS = 4;

const alAzar = (min,max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Nadie gasta $8.347 en el supermercado: los montos de verdad terminan en
// cero y uno los reconoce como plausibles.
const redondear = n => Math.round(n / 100) * 100;

const dosCifras = n => String(n).padStart(2,'0');

window.datosDePrueba = function(cuantos){
  const total = cuantos || 100;
  const hoy = new Date();
  const nuevos = [];

  // Varios meses hacia atras, contando el actual. Se necesita mas de uno
  // para que Analisis tenga con que comparar y la pildora de fechas sirva.
  for(let atras = MESES_ATRAS - 1; atras >= 0; atras--){
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
    const anio = ref.getFullYear(), mesN = ref.getMonth();
    const diasDelMes = new Date(anio, mesN + 1, 0).getDate();
    // El mes en curso va a medias: aun no termina, y llenarlo entero haria
    // que el gasto de este mes se viera enorme al lado de los anteriores.
    const hasta = (atras === 0) ? hoy.getDate() : diasDelMes;

    MENSUALES.forEach(f => {
      if(f.dia > hasta) return;            // todavia no le toca este mes
      const monto = f.var ? redondear(alAzar(f.monto - f.var, f.monto + f.var)) : f.monto;
      nuevos.push({id:nuevoId(), monto, tipo:f.tipo, catId:f.cat, subId:f.sub,
                   fecha:`${anio}-${dosCifras(mesN+1)}-${dosCifras(f.dia)}`,
                   nota:'', prueba:true});
    });
  }

  // El resto se rellena con gastos sueltos. La bolsa repite cada patron
  // segun su peso y despues se saca uno al azar: es la forma mas corta de
  // que lo frecuente salga seguido sin escribir nada raro.
  const bolsa = [];
  PATRONES.forEach(p => { for(let i = 0; i < p.peso; i++) bolsa.push(p); });

  while(nuevos.length < total){
    const p = bolsa[alAzar(0, bolsa.length - 1)];
    const atras = alAzar(0, MESES_ATRAS - 1);
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
    const diasDelMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const hasta = (atras === 0) ? hoy.getDate() : diasDelMes;

    nuevos.push({
      id: nuevoId(), monto: redondear(alAzar(p.min, p.max)), tipo:'gasto',
      catId: p.cat, subId: p.sub,
      fecha: `${ref.getFullYear()}-${dosCifras(ref.getMonth()+1)}-${dosCifras(alAzar(1, hasta))}`,
      nota: '', prueba: true
    });
  }

  estado.movimientos = estado.movimientos.concat(nuevos);

  /* Los gastos de Hogar, Gastos fijos y Suscripciones crean su ficha de
     Recordatorios solos: asi funciona la app. O sea que estos movimientos
     dejan fichas atras, y esas fichas no son de prueba a menos que se diga.
     Sin esto, al borrarlos quedaban fichas huerfanas en Recordatorios
     anotando plata inventada todos los meses. */
  const antes = new Set(estado.fijos.map(f => f.id));
  sincronizarRecordatorios();
  estado.fijos.forEach(f => { if(!antes.has(f.id)) f.prueba = true; });

  guardar(); pintarTodo();
  console.log(`${nuevos.length} movimientos de prueba + ` +
              `${estado.fijos.filter(f=>f.prueba).length} fichas. ` +
              `Total en la app: ${estado.movimientos.length}.`);
};

window.borrarDatosDePrueba = function(){
  const movs  = estado.movimientos.filter(m => m.prueba).length;
  const fijos = estado.fijos.filter(f => f.prueba).length;
  estado.movimientos = estado.movimientos.filter(m => !m.prueba);
  estado.fijos       = estado.fijos.filter(f => !f.prueba);
  guardar(); pintarTodo();
  console.log(`Borrados ${movs} movimientos y ${fijos} fichas de prueba. ` +
              `Quedan ${estado.movimientos.length} movimientos tuyos.`);
};

console.log('Listo. Ordenes: datosDePrueba(n)  /  borrarDatosDePrueba()');

})();
