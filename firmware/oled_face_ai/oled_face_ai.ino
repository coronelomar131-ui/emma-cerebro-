/* ============================================================
 * La cara de Emma, controlada por su cerebro
 * ------------------------------------------------------------
 * Esta versión no escucha por micrófono: recibe órdenes por el
 * puerto serie desde brain/server.js, que es quien habla con
 * Claude y con el sintetizador de voz de la computadora.
 *
 * Protocolo (una orden por línea, a 115200 baudios):
 *   MOOD:feliz      -> cambia la emoción
 *   LEVEL:0.62      -> abre la boca ese tanto, de 0.00 a 1.00
 *
 * Si no llega ningún LEVEL durante 400 ms, la boca se cierra sola.
 *
 * Hardware:
 *   - ESP32 (o Arduino Nano/UNO)
 *   - OLED 0.96" SSD1306 128x64 I2C
 *
 * Conexiones (ESP32):
 *   OLED VDD -> 3V3     OLED SCK -> GPIO22
 *   OLED GND -> GND     OLED SDA -> GPIO21
 *
 * El USB que usás para programarlo es el mismo por el que recibe
 * las órdenes: no hace falta ningún cable extra.
 *
 * Librerías: "Adafruit SSD1306" y "Adafruit GFX Library"
 * ============================================================ */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- PINES ----------------
#if defined(ESP32)
  #define BUTTON_PIN   0     // el botón BOOT cambia de emoción a mano
#else
  #define BUTTON_PIN   2     // Arduino UNO/Nano: I2C va en A4 (SDA) y A5 (SCL)
#endif

#define SCREEN_W     128
#define SCREEN_H     64
#define OLED_ADDR    0x3C

Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);

// ---------------- GEOMETRIA DE LA CARA ----------------
// (los mismos numeros que web/face.js, para que se vea igual)
static const int EYE_W    = 30;
static const int EYE_CY   = 31;
static const int EYE_CX_L = 40;
static const int EYE_CX_R = 88;
static const int MOUTH_Y  = 54;

struct Mood {
  float browY, browTilt, eyeH, lidTop, lidBot, mouthCurve, mouthW, openBias;
};

// neutral, feliz, triste, enojado, sorpresa, dormido
static const Mood MOODS[] = {
  {  0,  0, 24, 0.00f, 0.00f,  2, 28, 0.00f },
  { -2, -1, 24, 0.00f, 0.30f,  9, 36, 0.00f },
  {  1, -6, 22, 0.20f, 0.00f, -6, 22, 0.00f },
  {  3,  8, 24, 0.24f, 0.00f,  0, 30, 0.00f },
  { -5,  0, 30, 0.00f, 0.00f,  0, 18, 0.55f },
  {  2, -3,  3, 0.00f, 0.00f,  1, 16, 0.00f },
};
static const int MOOD_COUNT = sizeof(MOODS) / sizeof(MOODS[0]);

// ---------------- ESTADO ANIMADO ----------------
Mood  cur     = MOODS[0];
Mood  tgt     = MOODS[0];
int   moodIdx = 0;

float blinkV     = 0.0f;   // 0 = ojo abierto, 1 = cerrado
int   blinkPhase = 0;      // 0 = quieto, 1 = cerrando, 2 = abriendo
long  nextBlink  = 2500;

float lookX = 0, lookY = 0, lookTX = 0, lookTY = 0;
long  nextLook = 1500;

float voice     = 0.0f;    // apertura de la boca, 0..1
float voiceTgt  = 0.0f;    // último LEVEL recibido
unsigned long lastLevel = 0;   // cuándo llegó, para cerrar la boca si el cerebro se calla

unsigned long lastFrame = 0;

// ---------------- UTILIDADES ----------------
static float lerpf(float a, float b, float t) { return a + (b - a) * t; }
static float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }

static void thickLine(int x0, int y0, int x1, int y1, int t, uint16_t col) {
  for (int i = 0; i < t; i++) display.drawLine(x0, y0 + i, x1, y1 + i, col);
}

static void thickRoundRect(int x, int y, int w, int h, int r, int t, uint16_t col) {
  for (int i = 0; i < t; i++) {
    int rr = r - i; if (rr < 0) rr = 0;
    display.drawRoundRect(x + i, y + i, w - 2 * i, h - 2 * i, rr, col);
  }
}

// cuadrilatero relleno (para los parpados, que se pintan en negro)
static void fillQuad(int x0, int y0, int x1, int y1, int x2, int y2, int x3, int y3, uint16_t col) {
  display.fillTriangle(x0, y0, x1, y1, x2, y2, col);
  display.fillTriangle(x0, y0, x2, y2, x3, y3, col);
}

// curva de la boca: bezier cuadratica dibujada por tramos
static void mouthCurve(int x0, int y0, int cx, int cy, int x1, int y1, int thick, uint16_t col) {
  int px = x0, py = y0;
  for (int i = 1; i <= 10; i++) {
    float t = i / 10.0f, u = 1 - t;
    int nx = (int)(u * u * x0 + 2 * u * t * cx + t * t * x1);
    int ny = (int)(u * u * y0 + 2 * u * t * cy + t * t * y1);
    thickLine(px, py, nx, ny, thick, col);
    px = nx; py = ny;
  }
}

// ---------------- ÓRDENES POR EL PUERTO SERIE ----------------
static const char* MOOD_NAMES[] = { "neutral", "feliz", "triste", "enojado", "sorpresa", "dormido" };

static void aplicarMood(const char* nombre) {
  for (int i = 0; i < MOOD_COUNT; i++) {
    if (strcmp(nombre, MOOD_NAMES[i]) == 0) {
      moodIdx = i;
      tgt = MOODS[i];
      return;
    }
  }
}

// Lee una línea completa sin bloquear: va juntando caracteres hasta el salto.
static void leerSerie() {
  static char linea[32];
  static uint8_t largo = 0;

  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (largo == 0) continue;
      linea[largo] = '\0';
      largo = 0;

      if (strncmp(linea, "MOOD:", 5) == 0) {
        aplicarMood(linea + 5);
      } else if (strncmp(linea, "LEVEL:", 6) == 0) {
        voiceTgt = clampf(atof(linea + 6), 0.0f, 1.0f);
        lastLevel = millis();
      }
    } else if (largo < sizeof(linea) - 1) {
      linea[largo++] = c;
    } else {
      largo = 0;  // línea demasiado larga: la descartamos entera
    }
  }

  // si el cerebro dejó de hablar, la boca se cierra sola
  if (millis() - lastLevel > 400) voiceTgt = 0.0f;
}

// ---------------- DIBUJO ----------------
static void drawFace() {
  display.clearDisplay();

  float openF = 1.0f - blinkV;
  float h = cur.eyeH * openF;
  if (h < 3) h = 3;

  for (int i = 0; i < 2; i++) {
    bool isLeft = (i == 0);
    int  cx = isLeft ? EYE_CX_L : EYE_CX_R;
    int  x  = (int)(cx - EYE_W / 2.0f + lookX);
    int  y  = (int)(EYE_CY - h / 2.0f + lookY * 0.6f);
    int  hh = (int)h;

    thickRoundRect(x, y, EYE_W, hh, 8, 3, SSD1306_WHITE);

    if (openF > 0.55f && hh > 12) {
      display.fillCircle((int)(cx + lookX * 1.7f), (int)(EYE_CY + lookY * 1.3f + 1), 2, SSD1306_WHITE);
    }

    // parpado superior inclinado (enojado / triste)
    if (cur.lidTop > 0.01f && openF > 0.5f) {
      float lh  = cur.eyeH * cur.lidTop;
      float dIn = cur.browTilt * 0.7f;
      int yIn  = (int)(y + lh + dIn);
      int yOut = (int)(y + lh - dIn);
      fillQuad(x - 4, y - 6, x + EYE_W + 4, y - 6,
               x + EYE_W + 4, isLeft ? yIn : yOut,
               x - 4,         isLeft ? yOut : yIn, SSD1306_BLACK);
    }

    // parpado inferior (sonreir con los ojos)
    if (cur.lidBot > 0.01f && openF > 0.5f) {
      int lh = (int)(cur.eyeH * cur.lidBot);
      display.fillRect(x - 4, y + hh - lh, EYE_W + 8, lh + 8, SSD1306_BLACK);
    }

    // ceja
    int by = (int)(EYE_CY - cur.eyeH / 2.0f - 8 + cur.browY + lookY * 0.3f);
    int t  = (int)(cur.browTilt * 0.6f);
    int xIn  = isLeft ? cx + 15 : cx - 15;
    int xOut = isLeft ? cx - 15 : cx + 15;
    thickLine(xOut + (int)(lookX * 0.5f), by - t,
              xIn  + (int)(lookX * 0.5f), by + t, 3, SSD1306_WHITE);
  }

  // boca
  float mouthOpen = clampf(cur.openBias + voice, 0.0f, 1.0f);
  if (mouthOpen > 0.07f) {
    int mw = (int)(16 + 22 * mouthOpen);
    int mh = (int)(4 + 15 * mouthOpen);
    int r  = mh / 2; if (r > 5) r = 5;
    display.fillRoundRect(64 - mw / 2, MOUTH_Y - mh / 2, mw, mh, r, SSD1306_WHITE);
  } else {
    int mw = (int)cur.mouthW;
    int cv = (int)cur.mouthCurve;
    mouthCurve(64 - mw / 2, (int)(MOUTH_Y - cv * 0.35f),
               64,          (int)(MOUTH_Y + cv * 0.9f),
               64 + mw / 2, (int)(MOUTH_Y - cv * 0.35f), 2, SSD1306_WHITE);
  }

  display.display();
}

// ---------------- ANIMACION ----------------
static void updateFace(float dtMs) {
  float k = 1.0f - powf(0.001f, dtMs / 1000.0f);
  cur.browY      = lerpf(cur.browY,      tgt.browY,      k);
  cur.browTilt   = lerpf(cur.browTilt,   tgt.browTilt,   k);
  cur.eyeH       = lerpf(cur.eyeH,       tgt.eyeH,       k);
  cur.lidTop     = lerpf(cur.lidTop,     tgt.lidTop,     k);
  cur.lidBot     = lerpf(cur.lidBot,     tgt.lidBot,     k);
  cur.mouthCurve = lerpf(cur.mouthCurve, tgt.mouthCurve, k);
  cur.mouthW     = lerpf(cur.mouthW,     tgt.mouthW,     k);
  cur.openBias   = lerpf(cur.openBias,   tgt.openBias,   k);

  // parpadeo
  nextBlink -= (long)dtMs;
  if (blinkPhase == 0 && nextBlink <= 0 && moodIdx != 5) blinkPhase = 1;
  if (blinkPhase == 1) {
    blinkV += dtMs / 70.0f;
    if (blinkV >= 1.0f) { blinkV = 1.0f; blinkPhase = 2; }
  } else if (blinkPhase == 2) {
    blinkV -= dtMs / 90.0f;
    if (blinkV <= 0.0f) {
      blinkV = 0.0f; blinkPhase = 0;
      nextBlink = 1800 + random(4000);
    }
  }

  // micro movimientos de la mirada
  nextLook -= (long)dtMs;
  if (nextLook <= 0) {
    lookTX = (random(200) - 100) / 25.0f;
    lookTY = (random(200) - 100) / 40.0f;
    nextLook = 1200 + random(3000);
  }
  float lk = 1.0f - powf(0.02f, dtMs / 1000.0f);
  lookX = lerpf(lookX, lookTX, lk);
  lookY = lerpf(lookY, lookTY, lk);
}

// ---------------- SETUP / LOOP ----------------
void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
#if defined(ESP32)
  Wire.begin(21, 22);
#else
  Wire.begin();
#endif

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println(F("No se encontro la OLED en 0x3C. Proba con 0x3D."));
    for (;;) delay(1000);
  }
  display.clearDisplay();
  display.display();
  randomSeed(micros());
  lastFrame = millis();
  Serial.println(F("listo"));
}

void loop() {
  leerSerie();

  // el botón sigue sirviendo para probar sin la computadora
  static bool prevBtn = HIGH;
  bool btn = digitalRead(BUTTON_PIN);
  if (prevBtn == HIGH && btn == LOW) {
    moodIdx = (moodIdx + 1) % MOOD_COUNT;
    tgt = MOODS[moodIdx];
    delay(20);
  }
  prevBtn = btn;

  // la boca abre rapido y cierra despacio
  voice = (voiceTgt > voice) ? lerpf(voice, voiceTgt, 0.65f) : lerpf(voice, voiceTgt, 0.18f);

  unsigned long now = millis();
  float dt = (float)(now - lastFrame);
  if (dt > 64) dt = 64;
  lastFrame = now;

  updateFace(dt);
  drawFace();
}
