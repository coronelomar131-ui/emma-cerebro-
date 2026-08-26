/* ============================================================
   Cara OLED — motor de la cara (128x64, 1 bit)
   Mismo dibujo que el firmware de Arduino: si cambias algo aca,
   cambialo tambien en firmware/oled_face/oled_face.ino
   ============================================================ */

const W = 128;
const H = 64;

// Geometria de la cara (en pixeles de la pantalla real)
const EYE_W = 30;
const EYE_CY = 31;
const EYE_CX_L = 40;
const EYE_CX_R = 88;
const MOUTH_Y = 54;

const MOODS = {
  neutral:  { browY:  0, browTilt:  0, eyeH: 24, lidTop: 0.00, lidBot: 0.00, mouthCurve:  2, mouthW: 28, openBias: 0.00 },
  feliz:    { browY: -2, browTilt: -1, eyeH: 24, lidTop: 0.00, lidBot: 0.30, mouthCurve:  9, mouthW: 36, openBias: 0.00 },
  triste:   { browY:  1, browTilt: -6, eyeH: 22, lidTop: 0.20, lidBot: 0.00, mouthCurve: -6, mouthW: 22, openBias: 0.00 },
  enojado:  { browY:  3, browTilt:  8, eyeH: 24, lidTop: 0.24, lidBot: 0.00, mouthCurve:  0, mouthW: 30, openBias: 0.00 },
  sorpresa: { browY: -5, browTilt:  0, eyeH: 30, lidTop: 0.00, lidBot: 0.00, mouthCurve:  0, mouthW: 18, openBias: 0.55 },
  dormido:  { browY:  2, browTilt: -3, eyeH:  3, lidTop: 0.00, lidBot: 0.00, mouthCurve:  1, mouthW: 16, openBias: 0.00 },
};

// Gestos: cosas de una sola vez que se montan encima de la emoción, como
// hace una persona mientras habla. Duran poco y no cambian el humor.
const GESTOS = {
  guino:   1000,
  asiente:  800,
  niega:    800,
  piensa:  1600,
  cejas:    600,
  risa:     900,
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

class Face {
  constructor() {
    this.cur = { ...MOODS.neutral };
    this.tgt = { ...MOODS.neutral };
    this.mood = 'neutral';

    this.blink = 0;          // 0 = ojo abierto, 1 = cerrado
    this.blinkPhase = null;  // null | 'close' | 'open'
    this.nextBlink = 2000;

    this.look = { x: 0, y: 0 };
    this.lookTgt = { x: 0, y: 0 };
    this.nextLook = 1500;

    this.voice = 0;          // 0..1, nivel de voz suavizado

    this.gesto = null;       // el gesto que está haciendo ahora
    this.gestoT = 0;
    this.proximoTic = 9000;  // cada tanto hace uno solo, para no quedar quieta
  }

  /** Arranca un gesto. Si ya había uno, lo reemplaza. */
  setGesto(nombre) {
    if (!GESTOS[nombre]) return;
    this.gesto = nombre;
    this.gestoT = 0;
  }

  /**
   * Qué le hace el gesto a la cara en este instante.
   * dx, dy mueven toda la cabeza; el resto retoca partes.
   */
  gestoAhora() {
    const m = { dx: 0, dy: 0, guinoDer: 0, ceja: 0, mirarX: null, mirarY: null };
    if (!this.gesto) return m;

    const p = Math.min(1, this.gestoT / GESTOS[this.gesto]);
    const sube = Math.sin(p * Math.PI);   // 0 -> 1 -> 0, para entrar y salir suave

    switch (this.gesto) {
      case "guino":
        m.guinoDer = Math.sin(Math.min(1, p * 2.2) * Math.PI);
        break;
      case "asiente":
        m.dy = Math.sin(p * Math.PI * 4) * 2.5 * sube;
        break;
      case "niega":
        m.dx = Math.sin(p * Math.PI * 6) * 3 * sube;
        break;
      case "piensa":
        m.mirarX = -3.5 * sube;
        m.mirarY = -2.8 * sube;
        m.ceja = -2 * sube;
        break;
      case "cejas":
        m.ceja = -4 * sube;
        break;
      case "risa":
        m.dy = -Math.abs(Math.sin(p * Math.PI * 3)) * 3;
        m.ceja = -1.5 * sube;
        break;
    }
    return m;
  }

  setMood(name) {
    if (!MOODS[name]) return;
    this.mood = name;
    Object.assign(this.tgt, MOODS[name]);
  }

  /** dt en milisegundos, level = nivel de voz 0..1 */
  update(dt, level) {
    // suavizado de parametros hacia la emocion objetivo
    const k = 1 - Math.pow(0.001, dt / 1000); // ~independiente del framerate
    for (const key of Object.keys(this.tgt)) {
      this.cur[key] = lerp(this.cur[key], this.tgt[key], k);
    }

    // la boca sube rapido y baja lento: se siente mas "hablado"
    const target = clamp(level, 0, 1);
    this.voice = target > this.voice
      ? lerp(this.voice, target, 1 - Math.pow(0.002, dt / 1000))
      : lerp(this.voice, target, 1 - Math.pow(0.15, dt / 1000));

    // el gesto que esté haciendo
    if (this.gesto) {
      this.gestoT += dt;
      if (this.gestoT >= GESTOS[this.gesto]) { this.gesto = null; this.gestoT = 0; }
    }

    // cada tanto hace uno solo, para que no parezca congelada
    this.proximoTic -= dt;
    if (this.proximoTic <= 0) {
      if (!this.gesto && this.mood !== "dormido") {
        this.setGesto(Math.random() < 0.6 ? "cejas" : "piensa");
      }
      this.proximoTic = 12000 + Math.random() * 18000;
    }

    // parpadeo
    this.nextBlink -= dt;
    if (this.blinkPhase === null && this.nextBlink <= 0 && this.mood !== 'dormido') {
      this.blinkPhase = 'close';
    }
    if (this.blinkPhase === 'close') {
      this.blink += dt / 70;
      if (this.blink >= 1) { this.blink = 1; this.blinkPhase = 'open'; }
    } else if (this.blinkPhase === 'open') {
      this.blink -= dt / 90;
      if (this.blink <= 0) {
        this.blink = 0;
        this.blinkPhase = null;
        this.nextBlink = 1800 + Math.random() * 4000;
      }
    }

    // micro movimientos de la mirada
    this.nextLook -= dt;
    if (this.nextLook <= 0) {
      this.lookTgt.x = (Math.random() * 2 - 1) * 4;
      this.lookTgt.y = (Math.random() * 2 - 1) * 2.5;
      this.nextLook = 1200 + Math.random() * 3000;
    }
    const lk = 1 - Math.pow(0.02, dt / 1000);
    this.look.x = lerp(this.look.x, this.lookTgt.x, lk);
    this.look.y = lerp(this.look.y, this.lookTgt.y, lk);
  }

  /** Dibuja la cara en blanco sobre negro en un contexto de 128x64 */
  draw(c) {
    const p = this.cur;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    const g = this.gestoAhora();
    const mirarX = g.mirarX === null ? this.look.x : g.mirarX;
    const mirarY = g.mirarY === null ? this.look.y : g.mirarY;

    // Mover la cabeza entera: asentir y negar salen de acá.
    c.save();
    c.translate(g.dx, g.dy);

    for (const isLeft of [true, false]) {
      // Un ojo puede cerrarse solo: eso es el guiño.
      const open = 1 - Math.min(1, this.blink + (isLeft ? 0 : g.guinoDer));
      const h = Math.max(3, p.eyeH * open);
      const cx = isLeft ? EYE_CX_L : EYE_CX_R;
      const x = cx - EYE_W / 2 + mirarX;
      const y = EYE_CY - h / 2 + mirarY * 0.6;

      // ojo: rectangulo redondeado con contorno grueso
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      roundRectPath(c, x, y, EYE_W, h, 8);
      c.stroke();

      // pupila
      if (open > 0.55 && h > 12) {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(cx + mirarX * 1.7, EYE_CY + mirarY * 1.3 + 1, 2.6, 0, Math.PI * 2);
        c.fill();
      }

      // parpado superior inclinado (enojado / triste) — se pinta en negro
      if (p.lidTop > 0.01 && open > 0.5) {
        const lh = p.eyeH * p.lidTop;
        const dIn = p.browTilt * 0.7;   // lado interno
        const yIn = y + lh + dIn;
        const yOut = y + lh - dIn;
        c.fillStyle = '#000';
        c.beginPath();
        c.moveTo(x - 4, y - 6);
        c.lineTo(x + EYE_W + 4, y - 6);
        c.lineTo(x + EYE_W + 4, isLeft ? yIn : yOut);
        c.lineTo(x - 4, isLeft ? yOut : yIn);
        c.closePath();
        c.fill();
      }

      // parpado inferior (sonrisa con los ojos)
      if (p.lidBot > 0.01 && open > 0.5) {
        const lh = p.eyeH * p.lidBot;
        c.fillStyle = '#000';
        c.fillRect(x - 4, y + h - lh, EYE_W + 8, lh + 8);
      }

      // ceja
      const by = EYE_CY - p.eyeH / 2 - 8 + p.browY + mirarY * 0.3 + g.ceja;
      const t = p.browTilt * 0.6;
      const xIn = isLeft ? cx + 15 : cx - 15;
      const xOut = isLeft ? cx - 15 : cx + 15;
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(xOut + mirarX * 0.5, by - t);
      c.lineTo(xIn + mirarX * 0.5, by + t);
      c.stroke();
    }

    // boca
    const mouthOpen = clamp(p.openBias + this.voice, 0, 1);
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    if (mouthOpen > 0.07) {
      const mw = 16 + 22 * mouthOpen;
      const mh = 4 + 15 * mouthOpen;
      roundRectPath(c, 64 - mw / 2, MOUTH_Y - mh / 2, mw, mh, Math.min(5, mh / 2));
      c.fill();
    } else {
      const mw = p.mouthW;
      const cv = p.mouthCurve;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(64 - mw / 2, MOUTH_Y - cv * 0.35);
      c.quadraticCurveTo(64, MOUTH_Y + cv * 0.9, 64 + mw / 2, MOUTH_Y - cv * 0.35);
      c.stroke();
    }

    c.restore();
  }
}

// Se expone como global para poder abrir index.html directo desde el disco
if (typeof window !== 'undefined') { window.OledFace = { W, H, MOODS, GESTOS, Face }; }
