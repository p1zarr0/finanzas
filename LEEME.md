# Mis Finanzas

App de finanzas personales. Registro de gastos, ahorro, ingresos y pagos de cada mes
que se anotan solos (arriendo, internet, Netflix), análisis por categoría, deudas
pendientes y escáner de boletas.

Las categorías separan lo que se comporta distinto: **Gastos fijos** (contractual) de
**Hogar** (luz, agua, gas), y **Auto** (bencina, mantención, permiso) de **Locomoción**
(micro, metro, taxi). Así se ve cuánto cuesta cada cosa de verdad.

Los datos se guardan **solo en el dispositivo**, en la memoria del navegador.
No hay servidor, no hay cuenta, nada sale de tu teléfono.

La dirección es <https://p1zarr0.github.io/finanzas/>.

---

## Cómo pasársela a alguien

Compartirla es mandar el link. No hay nada que instalar ni cuenta que crear:
cada persona abre esa misma dirección y sus datos quedan en **su** teléfono,
separados de los tuyos. Nadie ve los movimientos de nadie, tú incluido.

El lector de correos es aparte y **no se comparte nunca**: cada persona
necesita instalar el suyo en su cuenta de Google, con `correo/INSTALAR.md`.
La dirección del `/exec` entrega los movimientos de quien la creó, así que
pasarla es entregar los tuyos.

Este mensaje se puede copiar tal cual:

> Te paso la app de finanzas que uso:
> https://p1zarr0.github.io/finanzas/
>
> Ábrela en el celular y agrégala a la pantalla de inicio para que quede como
> una app: en Android, el menú de los tres puntos de Chrome → "Agregar a
> pantalla de inicio". En iPhone, el botón de compartir de Safari → "Agregar a
> inicio".
>
> Dos cosas importantes:
>
> 1. Tus datos se guardan **solo en tu teléfono**. No hay cuenta ni nube: nadie
>    los ve, y yo tampoco.
> 2. Por lo mismo, **no la uses en modo incógnito** — ahí el navegador borra
>    todo al cerrar la pestaña.
>
> De vez en cuando entra a ⚙ → "Guardar una copia de seguridad". Si cambias de
> teléfono o borras los datos del navegador, es lo único que los recupera.

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
| `iconos/` | El ícono en la pantalla de inicio. El `maskable` es el mismo con más aire alrededor, para Android. |
| `lib/` | La librería que lee las boletas. Son 10 MB y no hay que tocarla. |
| `correo/` | El lector de los avisos del banco: `lector.gs` es el programa e `INSTALAR.md` la guía para conectarlo. Se instala en Google Apps Script y no viaja al teléfono. |
| `herramientas/` | Cosas para desarrollar, no para el teléfono. Hoy solo `datos-de-prueba.js`. |
| `.claude/servidor.ps1` | Servidor para probar en el computador antes de publicar. |

**Los tres primeros y `sw.js` tienen que quedarse en la raíz.** `index.html` es
lo que se entrega al abrir la dirección; y un service worker solo controla la
carpeta donde vive y lo que cuelga de ella, así que `sw.js` metido en una
subcarpeta dejaría de controlar la app —y sin avisar, porque no da error.

### Los tres celestes

Son parecidos pero distintos, y cada uno hace juego con lo que tiene al lado:

- **`background_color` es `#C9DFFA`** (manifiesto) — el fondo de la pantalla de
  arranque, la que aparece un segundo con el ícono en el medio. Es el celeste exacto
  del ícono, para que el ícono no se vea como un recuadro pegado encima.
- **`theme_color` es `#EAF1FB`** (manifiesto **y** el `<meta name="theme-color">` del
  `<head>`) — la franja de estado del teléfono, arriba del todo. Va del color de la
  app, que es lo que tiene pegado abajo. **Los dos tienen que decir lo mismo**: si
  cambias uno sin el otro, queda una banda de otro color en el borde.
- **`--fondo` es `#EAF1FB`** (los tokens de `index.html`) — el fondo de la app.

La app era crema `#FAF7F5` hasta el 19 de agosto de 2026. Al pasarla a celeste hubo
que mover también `--hundido`, `--linea`, `--borde` y los grises del texto: eran
cálidos, salían del crema, y sobre un fondo frío se veían embarrados.

Como `manifest.json` es JSON puro y no admite comentarios, la explicación vive aquí.



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

Nunca rellena meses hacia atrás: si no abres la app en dos meses, solo anota el mes en
curso. Y si borras uno a mano, no vuelve a aparecer.

---

## Respaldo de los datos

Desde la app: **⚙ → Exportar a Excel (CSV)**.

Conviene hacerlo de vez en cuando. Si borras los datos del navegador o cambias de
teléfono, lo registrado se pierde: no está en ninguna nube.
