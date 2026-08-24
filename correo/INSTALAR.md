# Conectar los correos del banco

Esta guía es para instalar el lector de correos en **tu** cuenta. No hay que
saber programar: es copiar un archivo, cambiar cuatro líneas y apretar
algunos botones.

Toma unos 15 minutos.

---

## Qué hace esto

Cuando compras algo, el banco te manda un correo. El lector revisa esos
correos, entiende cuánto gastaste y dónde, y se lo pasa a la app para que no
tengas que anotarlo a mano.

**Nada entra solo.** Lo que llega se muestra en una lista para que lo
confirmes, y solo se anota lo que dejes marcado. Si algún día el banco cambia
la redacción de sus correos y el lector entiende mal, vas a ver el disparate
antes de que toque tus finanzas.

## Por qué cada persona necesita el suyo

El lector no es un servicio al que te conectas: es un programa que corre
**dentro de tu cuenta de Google**, con permiso para leer **tu** Gmail.

Por eso la dirección que sale al final no se comparte con nadie. Quien la
tenga no ve sus propios movimientos: ve los de quien la creó.

---

# PASO 1 — Copiar el programa

Entra a **[script.google.com](https://script.google.com)**.

> ⚠️ **Con la cuenta a la que llegan los correos del banco.** Si tus avisos
> llegan a otro Gmail, tiene que ser ese. Es el error más común.

1. **Proyecto nuevo**
2. Borra todo lo que aparezca en el editor
3. Pega el contenido completo de `lector.gs`
4. Ponle nombre al proyecto arriba: `Lector de correos`

---

# PASO 2 — Cambiar cuatro cosas

Están todas juntas al principio del archivo, en el bloque `CONFIG`.

## `BANCOS` — de quién son los correos

```js
BANCOS: [
  'bancochile.cl',
  'bancoestado.cl',
  'somosmach.com',
  'santander.cl',
  'bci.cl'
],
```

Deja los tuyos y borra el resto. Para saber qué escribir, abre un aviso de tu
banco en Gmail y mira la dirección del remitente: lo que va **después del `@`**
es lo que se pone acá.

Si llega de algo como `avisos@e.tubanco.cl`, prueba primero con `tubanco.cl`.
Si más adelante no aparece nada, vuelve y pon la dirección completa.

## `YO` — tu nombre, como lo escriben los bancos

```js
YO: [
  'Nombre Apellido'
],
```

Sirve para reconocer los traspasos entre **tus propias** cuentas y no
anotarlos: pasar plata de una cuenta tuya a otra no es un gasto ni un ingreso,
es la misma plata cambiada de bolsillo.

Pon tu nombre completo. Da lo mismo mayúsculas o tildes: se comparan sin
distinguir. Si tus bancos te escriben de formas muy distintas, puedes poner
varias variantes separadas por comas.

> **Si te saltas esto**, los traspasos entre tus cuentas se cuentan como
> ingresos y tus totales del mes quedan inflados.

## `CLAVE` — la contraseña de tu buzón

```js
CLAVE: 'perro-azul-4471-mesa-verde',
```

Inventa una larga y rara. No tienes que memorizarla: se pega una vez en la app
y nunca más.

> ⚠️ **Solo letras, números y guiones.** Nada de espacios, `&`, `#`, `+`, `?`
> ni `=`. La clave viaja dentro de una dirección web y esos caracteres
> significan otra cosa ahí: la dirección se corta o se parte, y la app dice
> "Clave incorrecta" sin que se vea nada raro.

## `DESDE` — desde qué día mirar

```js
DESDE: '2026/08/24',
```

Pon **el día en que estás haciendo esto**, en ese formato. Todo lo anterior se
ignora para siempre.

Sirve para partir con la cuenta limpia. Sin esto te llega de golpe el
historial de la semana —compras que ya tenías anotadas a mano— y hay que
descartarlas una por una.

Después no hay que tocarlo nunca más.

---

# PASO 3 — Probarlo antes de conectar nada

**Este paso no es opcional.** Es el que decide si lo que sigue tiene sentido.

1. En la lista de funciones de arriba, elige **`probarLector`**
2. Aprieta **▷ Ejecutar**
3. La primera vez Google va a pedir permiso para leer tu Gmail. Es tu propio
   programa, corriendo en tu cuenta. Acepta.
4. Abre **Registro de ejecución**, abajo, y lee lo que entendió

Vas a ver algo así:

```
1) Compra por $12.990 en PANADERIA SAN JOSE
   ENTENDÍ -> gasto de $12.990 en "PANADERIA SAN JOSE"
```

**No manda nada ni marca ningún correo.** Puedes ejecutarlo las veces que
quieras.

## Qué revisar

Sobre todo una cosa: **que los gastos digan gasto y los ingresos digan
ingreso**. Un gasto anotado como ingreso no solo queda mal — te deja los
totales del mes al revés.

Después mira que los montos sean los de las compras y no el cupo disponible,
y que los nombres de los comercios se vean razonables.

## Si algo sale mal

Es normal la primera vez, sobre todo con un banco que no estaba en la lista
original. Cada síntoma tiene su lugar en el archivo:

| Lo que ves | Dónde se arregla |
|---|---|
| No aparece ningún correo | El dominio en `BANCOS`, o `ES_MOVIMIENTO` |
| El monto está mal (agarró el cupo o el saldo) | `NO_ES_EL_MONTO` |
| Un gasto salió como ingreso, o al revés | `YO_ENVIE` / `YO_RECIBI` |
| El nombre del comercio sale raro | `comercioDelCorreo` |
| Un traspaso entre tus cuentas se anotó | `YO` |

Si no te la puedes, copia **la línea del registro** donde salió mal —no el
correo entero, que trae datos de gente— y pide ayuda con eso.

**No sigas al paso 4 hasta que la prueba se vea bien.** Conectar un lector que
entiende mal es llenar la app de datos falsos.

---

# PASO 4 — Publicarlo

1. Arriba a la derecha: **Implementar → Nueva implementación**
2. El engranaje ⚙ → **Aplicación web**
3. Llena así:

| Campo | Valor |
|---|---|
| Descripción | `Lector de correos — EN USO` |
| Ejecutar como | **Yo** |
| Quién tiene acceso | **Cualquier persona** |

4. **Implementar**
5. Copia la **URL de la aplicación web**. Termina en **`/exec`**

> "Cualquier persona" suena peor de lo que es: sin la clave, esa dirección no
> entrega nada. La protección real es la `CLAVE`, y por eso tiene que ser
> larga.

> Hay otra dirección que termina en `/dev`. Esa es solo para pruebas del
> editor y no sirve acá.

---

# PASO 5 — Conectarlo con la app

En la app: **⚙ Configuración → Movimientos del banco**.

Pega la dirección y **agrégale tu clave al final**:

```
https://script.google.com/…/exec?k=perro-azul-4471-mesa-verde
```

Apriete **Guardar y probar**.

| Lo que ves | Qué significa |
|---|---|
| Aparecen movimientos, o dice que no hay pendientes | Listo ✓ |
| "Clave incorrecta" | La clave del final no coincide con la del script |
| "contestó 404" | La dirección no apunta a una implementación viva |

> 🔒 **Esa dirección completa es la llave de tus movimientos del banco.** No se
> pega en un chat, no se comparte, no se le muestra a nadie.

---

# Cómo actualizarlo después

El día que cambies algo del script —agregar un banco, ajustar la clave—:

**Implementar → Administrar implementaciones → el lápiz ✏️ → Versión: Nueva
versión → Implementar**

Eso actualiza **la misma** implementación: la dirección y la clave no cambian,
y no tienes que tocar nada en la app.

> ⚠️ **No uses "Nueva implementación" para esto.** Crea otra dirección distinta
> y deja la anterior sin servicio. Si la app apuntaba a esa, deja de recibir
> movimientos y empieza a contestar 404 — en silencio, porque la app no avisa
> cuando la consulta automática falla.
>
> Ya pasó: seis implementaciones acumuladas y la app apuntando a una muerta.
> "Nueva implementación" es para la primera vez, y para nada más.

Si te quedaron implementaciones viejas, se limpian en **Administrar
implementaciones**, con el menú **⋮ → Archivar** de cada una. Apps Script no
las borra de verdad desde esa pantalla, solo las archiva, pero el efecto es el
que buscas: la dirección deja de responder.

**Archiva solo después** de tener una funcionando y probada.
