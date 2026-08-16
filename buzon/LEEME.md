# El buzón

Es lo único de esta app que vive fuera de tu teléfono. Sirve para dos cosas:

- **Anotar por WhatsApp**: le escribes "almuerzo 8500" al bot y queda anotado.
- **Leer los correos del banco**: los avisos de compra entran solos.

## Qué guarda y qué no

| Sí | No |
|---|---|
| Frases sueltas: `"almuerzo 8500"` | Tu historial de movimientos |
| La hora en que llegaron | Tus categorías y tus totales |
| | Tus ahorros y tus presupuestos |
| | Tu nombre, tu RUT, tu saldo |

La app **le pide** mensajes al buzón y le avisa cuáles ya se llevó. Nunca le manda
datos. El tráfico va en un solo sentido.

Cada mensaje se borra apenas la app se lo lleva, y solo a los 7 días si no la abres.
En el peor caso, alguien que consiguiera la dirección y la clave vería unos pocos
gastos de los últimos días. No tu vida financiera.

Si nunca configuras la dirección en la app, nada de esto se ejecuta y la app sigue
siendo cien por ciento local, igual que antes.

---

## Paso 1: crear el buzón en Cloudflare

1. Crea una cuenta gratis en <https://dash.cloudflare.com/sign-up>.
2. En el menú de la izquierda: **Compute (Workers)** → **Create** → **Start with Hello
   World** → ponle de nombre `buzon` → **Deploy**.
3. Entra al worker recién creado → **Edit code**. Borra todo lo que hay y pega el
   contenido de [`worker.js`](worker.js). Guarda con **Deploy**.

Te queda una dirección tipo `https://buzon.TU-CUENTA.workers.dev`. Anótala.

## Paso 2: darle memoria

El worker por sí solo no recuerda nada. Necesita un KV, que es la memoria de Cloudflare.

1. Menú izquierdo → **Storage & Databases** → **KV** → **Create a namespace**.
   Llámalo `buzon`.
2. Vuelve a tu worker → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - Variable name: `BUZON` ← **tiene que ser exactamente así, en mayúsculas**
   - KV namespace: el `buzon` que acabas de crear.

## Paso 3: la clave secreta

Inventa una clave larga y al azar. Puedes sacarla de <https://www.random.org/strings/>
o simplemente teclear 30 caracteres sin sentido. **No uses una contraseña que ya uses
en otra parte**: esta va a ir escrita en la dirección.

En tu worker → **Settings** → **Variables and Secrets** → **Add**:

| Nombre | Tipo | Valor |
|---|---|---|
| `CLAVE` | Secret | la clave que inventaste |
| `ORIGEN_APP` | Text | `https://p1zarr0.github.io` |

`ORIGEN_APP` es opcional pero conviene: le dice al buzón que solo le conteste a tu app
y no a cualquier página.

## Paso 4: conectarlo con la app

Abre la app → **⚙ Ajustes** → **Anotar por WhatsApp**, y pega:

```
https://buzon.TU-CUENTA.workers.dev?k=TU_CLAVE
```

Toca **Guardar y probar**. Si dice "Conectado", ya está.

> Esa dirección lleva tu clave dentro, así que trátala como una contraseña: no la
> pegues en un chat ni en una captura de pantalla.

---

## Paso 5: el lector de correos del banco

Esto no necesita nada de Meta ni de Cloudflare aparte de lo que ya hiciste. Corre en tu
**propia cuenta de Google**, leyendo un Gmail que Google ya tiene: no aparece ningún
tercero nuevo.

1. Entra a <https://script.google.com> → **Nuevo proyecto**.
2. Borra lo que venga y pega todo [`correos.gs`](correos.gs).
3. Arriba del archivo, en `CONFIG`, pega la dirección de tu buzón con su clave
   (la misma que pusiste en la app). Revisa que `BANCOS` tenga los tuyos.
4. **Antes de soltarlo, pruébalo.** Elige la función `probarLector` y aprieta ▷ Ejecutar.
   Google te va a pedir permiso para leer tu Gmail; es este script, corriendo en tu
   cuenta. En “Registro de ejecución” vas a ver algo así:

   ```
   Correos que calzan: 3
   --- NO SE MANDÓ NADA. Esto es solo una prueba. ---

   1) Notificación de Compra
      ENTENDÍ -> gasto de $12.990 en "JUMBO MAIPU"
   ```

   **No manda nada ni marca ningún correo.** Es para revisar antes.
5. Si se ve bien, ejecuta `instalarDisparador`. Desde ahí revisa solo cada 15 minutos.

Para detenerlo en cualquier momento: ejecuta `desinstalarDisparador`.

### Si algo sale mal interpretado

La salida de `probarLector` es lo que hay que mirar. Cada línea dice qué entendió de cada
correo. **Copia la línea, no el correo**, y con eso se corrige el patrón.

Si no aparece ningún correo, casi siempre es que falta el dominio de tu banco en
`CONFIG.BANCOS`. Abre un aviso de compra y mira de qué dirección llega.

### Qué sabe hacer

Probado contra 17 formatos distintos, incluidos los cuatro bancos, transferencias
recibidas, abonos de sueldo, correos armados como tabla y montos escritos `$7.500.-`.

Descarta solo lo que no corresponde: compras **rechazadas**, el correo de “si no
reconoces esta compra”, estados de cuenta y publicidad.

El detalle que más cuesta: los avisos traen dos o tres cifras —lo que gastaste, el cupo
que te queda, el saldo— y la más grande no es la que interesa. El script mira **todas**
las cifras con lo que viene escrito antes de cada una, y se queda con la que sigue a la
palabra que dice qué pasó. Un correo que empieza con “Cupo disponible: $500.000” y
después dice “compra por $12.990” anota los $12.990.

Lo que no entiende, lo deja pasar y te lo dice. Nunca inventa un monto.

### Lo que llega a tu app

Del correo salen tres cosas: **cuánto, dónde y cuándo**. El texto del correo no se
guarda en ninguna parte. Los movimientos aparecen con 📧 y, como todo lo del buzón,
esperan que los confirmes antes de anotarse.

---

## Paso 6: el bot de WhatsApp

Esta es la única parte con trámite. Si solo querías que entraran los correos del banco,
ya terminaste: lo de abajo es opcional.

El obstáculo acá no es técnico sino de Meta: **el número del bot no puede ser un número
que ya tenga WhatsApp normal instalado**. Por eso se usa el número de prueba que Meta
regala. Tú le escribes desde tu WhatsApp de siempre; el que cambia es el número que te
responde.

1. Entra a <https://developers.facebook.com> con tu cuenta de Facebook.
2. **My Apps** → **Create App** → tipo **Business** → agrégale el producto **WhatsApp**.
3. En **WhatsApp → API Setup** vas a ver:
   - Un **número de prueba** con su **Phone number ID**. Cópialo.
   - Un **token temporal** (dura 24 h). Sirve para probar.
   - Un cuadro **"To"** donde agregas tu número personal como destinatario
     autorizado. Te va a llegar un código por WhatsApp para confirmarlo.

4. Vuelve al worker → **Settings** → **Variables and Secrets** y agrega:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `TELEFONO_ID` | Text | el Phone number ID del paso 3 |
   | `TOKEN_WHATSAPP` | Secret | el token de Meta |
   | `TOKEN_META` | Secret | una palabra que inventes tú (la vuelves a usar abajo) |
   | `SECRETO_META` | Secret | el *App Secret*, en Settings → Basic de tu app de Meta |
   | `MI_NUMERO` | Text | tu número con código de país y sin +, ej. `56912345678` |

5. En Meta: **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://buzon.TU-CUENTA.workers.dev/whatsapp`
   - Verify token: la palabra que pusiste en `TOKEN_META`
   - Guarda, y en **Webhook fields** suscríbete a **messages**.

6. Escríbele "almuerzo 8500" al número de prueba. Debería contestarte "✅ Anotado".
   Abre la app y ahí está, esperando que lo confirmes.

### El token de Meta se vence

El token del paso 3 dura **24 horas**. Para uno permanente: en tu app de Meta,
**Business Settings → Users → System Users** → crea uno con rol de administrador,
asígnale la app de WhatsApp y genera un token **sin fecha de expiración**. Reemplaza
`TOKEN_WHATSAPP` con ese.

Si el bot deja de contestar de un día para otro, es esto.

---

## Cómo escribirle al bot

| Escribes | Queda anotado como |
|---|---|
| `almuerzo 8500` | Gasto de $8.500 en Alimentación / Almuerzo |
| `bencina copec 45500` | Gasto de $45.500 en Auto / Bencina |
| `+1450000 sueldo` | Ingreso de $1.450.000 en Ingresos / Sueldo |
| `ahorro 50000` | Ahorro de $50.000 |
| `2 cafes 3800` | Gasto de $3.800 en Alimentación / Café |

El monto es el número más grande del mensaje; el resto es la descripción. Para que sea
un ingreso, parte con `+` o usa la palabra "sueldo". Para que sea ahorro, usa la palabra
"ahorro".

Busca la palabra entre **tus** categorías y detalles, así que se adapta sola: si creas
el detalle "Sushi", desde ese momento `sushi 12000` cae donde corresponde.

Un mensaje sin ningún número no se anota (te lo dice al abrir la app).

---

## Qué hay dentro del buzón

| Dirección | Para qué |
|---|---|
| `GET /pendientes?k=…` | Lo que la app viene a buscar |
| `POST /listo?k=…` | "Ya los tengo, bórralos" |
| `POST /anotar?k=…` | Dejar un mensaje (lo usa el lector de correos) |
| `/whatsapp` | Donde Meta deja los mensajes. No lleva clave: se protege con la firma |

El borrado lo pide la app y no lo hace el buzón al entregar: si se corta el internet
justo después, los mensajes se habrían perdido sin llegar a ninguna parte.
