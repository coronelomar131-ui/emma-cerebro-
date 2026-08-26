# Emma

Una asistente con cara. Vive en una pantalla de 128×64 en blanco y negro —
dos ojos, dos cejas y una boca — escucha por el micrófono del teléfono,
entiende lo que le decís y contesta en voz alta, cambiando de expresión
según lo que responde.

Es un asistente personal, no una herramienta de trabajo. Lo que sabe de vos
está en un solo archivo que vos controlás.

![Emma con tres expresiones](web/preview.png)

## Cómo se usa

Se abre en el navegador del celular. Mantenés apretado el micrófono, hablás,
soltás. También podés escribirle, que funciona en cualquier teléfono sin pedir
permisos.

Funciona igual en iPhone, Android, Mac y PC: el navegador graba el audio y se lo
manda al modelo, que entiende **y** contesta en la misma consulta. Por eso no
depende del reconocimiento de voz del navegador, que en iOS es poco confiable.

## Publicarla

```
1. Sacá una clave gratis en aistudio.google.com/apikey
2. Entrá a vercel.com con tu cuenta de GitHub
3. Add New → Project → emma-cerebro- → Import
4. Environment Variables → GEMINI_API_KEY = tu clave
5. Deploy
```

Listo. El link que te da es Emma.

| Variable | Para qué |
|---|---|
| `GEMINI_API_KEY` | La clave de Gemini, del tier gratis |
| `ANTHROPIC_API_KEY` | La clave de Claude, si preferís pagar por uso |
| `CARA_PROVIDER` | `gemini` (por defecto) o `claude` |
| `CARA_MODEL` | Para fijar otro modelo del mismo proveedor |

## Correrla en tu computadora

```bash
npm install
cp brain/.env.example brain/.env    # y pegás la clave adentro
node brain/server.js --provider gemini
```

Con `--provider ollama --model llama3.2` corre con un modelo de tu propia
máquina, sin clave y sin internet. Ese solo anda en la computadora.

## Qué hay adentro

| Carpeta | Qué es |
|---|---|
| `web/` | La cara y la página. `face.js` dibuja, `index.html` escucha y habla |
| `brain/cerebro.js` | La personalidad de Emma y los tres proveedores |
| `brain/proyectos.js` | **Lo que Emma sabe de vos.** Es lo único que hay que mantener |
| `brain/server.js` | Servidor local, para desarrollar |
| `api/chat.js` | El mismo cerebro como función serverless, para Vercel |
| `firmware/` | Los sketches de Arduino para la OLED física |

## Cómo mantenerla al día

Todo lo que Emma sabe está en **un solo archivo**: `brain/proyectos.js`.
Es texto común. Lo editás, y en el próximo despliegue ya está actualizada.

## La cara

Se dibuja de cero en cada cuadro, en un lienzo de 128×64 que después se pasa
por un umbral: cada pixel queda prendido o apagado, como en la pantalla real.
Por eso los bordes se ven escalonados.

Cada emoción es una fila de siete números en la constante `MOODS`:

| Parámetro | Qué controla |
|---|---|
| `browY` | Altura de las cejas |
| `browTilt` | Inclinación: positivo enoja, negativo entristece |
| `eyeH` | Alto del ojo |
| `lidTop` / `lidBot` | Cuánto tapa cada párpado |
| `mouthCurve` | Curva de la boca cerrada: positivo sonríe |
| `mouthW` | Ancho de la boca |
| `openBias` | Cuánto abre la boca antes de sumarle la voz |

Los mismos números están en el firmware de Arduino, así que la pantalla de
verdad se ve idéntica al simulador.

## Darle un cuerpo

Emma también puede vivir en una pantalla de verdad. Unos 13 dólares y sin soldar:

| Pieza | Qué mirar al comprarla | Aprox. |
|---|---|---|
| OLED 0.96" | Que sea **I2C** (4 pines) y **128×64**. No SPI, no 128×32 | 3 USD |
| ESP32 | Cualquier DevKit v1 | 5 USD |
| Micrófono analógico | MAX9814 o KY-038 (solo para `oled_face`) | 3 USD |
| Cables dupont | Macho-hembra | 2 USD |

| Del ESP32 | A la pantalla |
|---|---|
| `3V3` | `VDD` |
| `GND` | `GND` |
| `GPIO22` | `SCK` (a veces dice `SCL`) |
| `GPIO21` | `SDA` |

Hay dos sketches:

- **`firmware/oled_face/`** — Emma sola, sin computadora. Abre la boca según el
  volumen del micrófono y el botón BOOT le cambia la expresión.
- **`firmware/oled_face_ai/`** — Emma conectada. Obedece órdenes `MOOD:feliz` y
  `LEVEL:0.62` que le manda el servidor por el mismo cable USB con el que la
  programaste, así que la pantalla acompaña la conversación real.

Para la segunda, arrancá el servidor con el puerto:

```bash
stty -F /dev/ttyUSB0 115200 raw     # en macOS: stty -f /dev/cu.usbserial-... 115200 raw
node brain/server.js --provider gemini --serial /dev/ttyUSB0
```

El puente serie es para Linux y macOS. En Windows todo lo demás funciona igual,
pero para mover la pantalla física hace falta el paquete `serialport`.

Se cargan desde el IDE de Arduino con la placa *ESP32 Dev Module* y las librerías
**Adafruit SSD1306** y **Adafruit GFX**. Si la pantalla queda negra, casi siempre
es la dirección I2C: cambiá `0x3C` por `0x3D`.

## Lo que viene

- **Memoria propia.** Que se acuerde de las charlas anteriores, en Supabase.
- **Vivir en un aparato fijo.** Un Samsung S20 Exynos en el escritorio, siempre
  prendido, con ROM limpia.
- **Un modelo local para lo rápido.** Que conteste al instante lo simple y mande
  a la nube solo lo que necesita cabeza.
