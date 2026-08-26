/* ============================================================
 * Qué versión de Emma está viva
 * ------------------------------------------------------------
 * Abrí /api/version en el navegador y te dice qué commit está
 * publicado y si la clave está puesta. Sirve para saber si un
 * despliegue tomó el código nuevo o quedó pegado en uno viejo.
 *
 * No muestra ninguna clave: solo si está o no está.
 * ============================================================ */

export default function handler(req, res) {
  res.status(200).json({
    emma: "viva",
    // Si ves este campo, estás corriendo el código que elige el modelo solo.
    eligeModeloSolo: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "desconocido",
    mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
    rama: process.env.VERCEL_GIT_COMMIT_REF || "",
    proveedor: process.env.CARA_PROVIDER || "claude",
    // Con una clave de Gemini hay oído de respaldo, piense quien piense.
    oyeAudio: Boolean(process.env.GEMINI_API_KEY),
    modeloFijado: process.env.CARA_MODEL || "ninguno, se elige solo",
    claveGemini: process.env.GEMINI_API_KEY ? "puesta (oído de respaldo)" : "no hay (el oído lo pone el teléfono)",
    claveClaude: process.env.ANTHROPIC_API_KEY ? "puesta" : "FALTA",
  });
}
