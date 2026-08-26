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

    const open = 1 - this.blink;
    const h = Math.max(3, p.eyeH * open);

    for (const isLeft of [true, false]) {
      const cx = isLeft ? EYE_CX_L : EYE_CX_R;
      const x = cx - EYE_W / 2 + this.look.x;
      const y = EYE_CY - h / 2 + this.look.y * 0.6;

      // ojo: rectangulo redondeado con contorno grueso
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      roundRectPath(c, x, y, EYE_W, h, 8);
      c.stroke();

      // pupila
      if (open > 0.55 && h > 12) {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(cx + this.look.x * 1.7, EYE_CY + this.look.y * 1.3 + 1, 2.6, 0, Math.PI * 2);
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
      const by = EYE_CY - p.eyeH / 2 - 8 + p.browY + this.look.y * 0.3;
      const t = p.browTilt * 0.6;
      const xIn = isLeft ? cx + 15 : cx - 15;
      const xOut = isLeft ? cx - 15 : cx + 15;
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(xOut + this.look.x * 0.5, by - t);
      c.lineTo(xIn + this.look.x * 0.5, by + t);
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
  }
}

// Se expone como global para poder abrir index.html directo desde el disco
if (typeof window !== 'undefined') { window.OledFace = { W, H, MOODS, Face }; }
