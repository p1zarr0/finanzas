# Mis Finanzas

App de finanzas personales. Registro de gastos, ahorro, suscripciones con recordatorio
de cobro, análisis por categoría, deudas pendientes y escáner de boletas.

Los datos se guardan **solo en el dispositivo**, en la memoria del navegador.
No hay servidor, no hay cuenta, nada sale de tu teléfono.

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

---

## Cómo probarla en el computador antes de publicar

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/servidor.ps1
```

Después abre <http://localhost:5173> en el navegador.

**Importante:** el escáner de boletas **no funciona** si abres `index.html` con doble
clic. Necesita venir de un servidor. Por eso está este comando.

---

## Respaldo de los datos

Desde la app: **⚙ → Exportar a Excel (CSV)**.

Conviene hacerlo de vez en cuando. Si borras los datos del navegador o cambias de
teléfono, lo registrado se pierde: no está en ninguna nube.
