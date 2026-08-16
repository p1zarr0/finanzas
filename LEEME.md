# Mis Finanzas

App de finanzas personales. Registro de gastos, ahorro, ingresos y pagos de cada mes
que se anotan solos (arriendo, internet, Netflix), análisis por categoría, deudas
pendientes y escáner de boletas.

Las categorías separan lo que se comporta distinto: **Gastos fijos** (contractual) de
**Hogar** (luz, agua, gas), y **Auto** (bencina, mantención, permiso) de **Locomoción**
(micro, metro, taxi). Así se ve cuánto cuesta cada cosa de verdad.

Los datos se guardan **solo en el dispositivo**, en la memoria del navegador.
No hay cuenta y tu historial no sale de tu teléfono.

La única excepción, y solo si la activas: el **buzón** de WhatsApp y de los correos del
banco, que guarda en la nube frases sueltas por unos días hasta que la app se las lleva.
Nunca tu historial. Ver más abajo.

---

## Cómo publicar un cambio

Después de modificar la app, corre esto en Git Bash, dentro de la carpeta del proyecto:

```bash
git add -A && git commit -m "describe aquí qué cambiaste" && git push
```

En menos de un minuto la dirección web tiene la versión nueva.
La app del celular se actualiza sola la próxima vez que la abras.

**Tus datos no se pierden al actualizar.** Están guardados en el teléfono asociados a la
dirección web, no dentro del archivo.

### Si cambiaste algo de `lib/`, los íconos o `sw.js`

Súbele el número a `CACHE` en `sw.js` (de `finanzas-v1` a `finanzas-v2`, y así).
Eso obliga al teléfono a botar lo guardado y bajar lo nuevo. Si no lo haces, puede
seguir usando la versión vieja de esos archivos.

---

## Qué es cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | **La app entera**: diseño, estilos y lógica. Es el único que se toca normalmente. |
| `manifest.json` | Su ficha de identidad: nombre e íconos. Es lo que permite instalarla. |
| `sw.js` | Lo que hace que abra sin internet. |
| `icono-192.png`, `icono-512.png` | El ícono en la pantalla de inicio. |
| `lib/` | La librería que lee las boletas. Son 10 MB y no hay que tocarla. |
| `.claude/servidor.ps1` | Servidor para probar en el computador antes de publicar. |
| `buzon/` | El buzón de WhatsApp y de los correos del banco. **No se publica con la app**: va a Cloudflare aparte. Ver `buzon/LEEME.md`. |

---

## Cómo probarla en el computador antes de publicar

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/servidor.ps1
```

Después abre <http://localhost:5173> en el navegador.

**Importante:** el escáner de boletas **no funciona** si abres `index.html` con doble
clic. Necesita venir de un servidor. Por eso está este comando.

---

## Por qué aparecen movimientos que no anotaste

**Ingresos y ahorros** y **Mis pagos de cada mes** (⚙ → Automático) se anotan solos.
Las suscripciones viven ahí: son gastos fijos con otro nombre, así que Netflix se
anota igual que el arriendo. Una app web no puede
ejecutar nada mientras está cerrada, así que no hay nadie que despierte el día 5 a
medianoche: lo que hace es revisar **al abrirla**. Si el día ya pasó y no está anotado,
lo anota en ese momento y te avisa arriba, con un botón para deshacerlo.

Si pasaste meses sin abrirla, rellena los que faltan, no solo el mes en curso: al volver
en marzo después de no entrar desde diciembre, quedan anotados enero, febrero y marzo.
Así ningún mes aparece con menos gasto del que de verdad hubo. El tope son los **12
meses** más recientes: si vuelves después de dos años no te inventa veinticuatro
arriendos de golpe, anota el último año y lo anterior lo da por perdido. Los anuales (la
patente, el permiso de circulación) se anotan solo en el mes que les toca, aunque se
rellenen varios meses de una vez.

Y si borras uno a mano, no vuelve a aparecer.

---

## Importar la cartola del banco

**⚙ → Importar cartola del banco.**

Baja la cartola desde el sitio de tu banco en **CSV** y elígela ahí. Si tu banco solo la
entrega en Excel, ábrela y usa *Guardar como → CSV*. También puedes copiar la tabla
desde la página del banco y pegarla en el recuadro.

No importa qué banco sea: en vez de conocer el formato de cada uno, la app busca una
columna que se lea como fecha, otra como monto, y la más larga de texto como
descripción. Entiende cargos y abonos separados, montos con signo, y cartolas de
tarjeta de crédito (donde todo viene positivo y todo es gasto).

Antes de guardar nada te muestra la lista para que la revises. **Toca una fila para
dejarla fuera.** Los movimientos que ya importaste antes no vuelven a aparecer, y los
que se parecen a algo que escribiste a mano vienen apagados con el aviso
"ya lo anotaste".

Lo que no reconoce cae en **Gastos varios** o **Ingresos**, y se corrige tocándolo como
cualquier otro movimiento. Nada de esto sale del teléfono: el archivo se lee acá mismo.

Un gasto importado **no** crea un recordatorio automático, aunque caiga en Gastos fijos:
una cartola es historia, no un compromiso. Si de verdad se repite todos los meses, lo
enciendes tocando el movimiento.

---

## Anotar por WhatsApp

**⚙ → Anotar por WhatsApp.** Le escribes “almuerzo 8500” a un bot y queda anotado la
próxima vez que abras la app.

Esto necesita un **buzón** en la nube, que es lo único de la app que vive fuera del
teléfono. Cómo montarlo está en [`buzon/LEEME.md`](buzon/LEEME.md), paso a paso.

El buzón guarda **solo frases sueltas sin procesar** y las borra apenas la app se las
lleva (y solas a los 7 días si no la abres). Tu historial, tus categorías, tus totales
y tus ahorros nunca salen del teléfono: la app le *pide* mensajes al buzón, nunca le
*manda* datos.

**Si no configuras la dirección del buzón, nada de esto se ejecuta** y la app sigue
siendo cien por ciento local.

---

## De dónde salió cada movimiento

Al final de cada fila hay un emoji que dice de dónde salió:

| | Qué significa |
|---|---|
| *(nada)* | Lo escribiste tú a mano |
| 💬 | Se lo dictaste al bot de WhatsApp |
| 📧 | Llegó de un correo de aviso de compra |
| 📄 | Entró al importar la cartola |
| 📷 | El monto lo leyó el escáner de la boleta |
| 🔁 | Es de un pago que se repite (arriendo, Netflix, sueldo) |
| 🤝 | Salió de saldar una deuda en Transferencias |

**No hay que aprendérselos de memoria: toca el movimiento y te lo dice en palabras.**

**Lo manual no lleva nada a propósito.** Si llevara, el noventa por ciento de la lista
diría lo mismo y no distinguirías nada: la marca está para lo que llegó sin que lo
teclearas. Es el mismo criterio de “Programado”.

Dos detalles:

- Si el escáner leyó mal y **corregiste el monto a mano**, el movimiento deja de contar
  como escaneado. Lo que marca el 📷 es que ese número lo puso la máquina.
- Editar un movimiento **no le cambia el origen**. Un gasto que llegó por WhatsApp sigue
  diciendo WhatsApp aunque después le cambies la categoría o el monto.

El 🔁 funciona hacia atrás con todo lo que ya tenías, porque sale de la ficha de
Recordatorios. Los demás solo desde que existen: lo que escaneaste o saldaste antes
aparece sin marca.

En las compras en cuotas la etiqueta dice **`2/12`** para no ocupar media fila. La frase
completa —“Cuota 2 de 12 de un pago de $2.998.800”— aparece al tocar el movimiento.

---

## Respaldo de los datos

Desde la app: **⚙ → Exportar a Excel (CSV)**.

Conviene hacerlo de vez en cuando. Si borras los datos del navegador o cambias de
teléfono, lo registrado se pierde: no está en ninguna nube.
