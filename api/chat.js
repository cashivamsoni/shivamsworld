// /api/chat.js
// Vercel serverless function — proxies chat messages to the Gemini API.
// The API key never reaches the browser: it's read server-side from the
// GEMINI_API_KEY environment variable configured in the Vercel dashboard.
//
// This is the "smart" tier of a two-tier assistant: the widget on the
// frontend pattern-matches simple questions locally for free, and only
// calls here for real conversational replies. If this endpoint errors,
// times out, or rate-limits a caller, the frontend silently falls back
// to its local answers — so the assistant is never fully dependent on
// this (or any) external service.

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are the friendly AI assistant embedded on "Shivam's World"
(https://shivams-world.vercel.app), a YouTube channel and creative brand run by
Shivam Soni based in Kanpur, India.

WHAT THE SITE/CHANNEL IS ABOUT:
DIY crafts, calligraphy, sketches/drawings, handcrafted cards, and other
creative content. Visitors can browse videos, view Shivam's work, download QR
codes, and place custom orders.

WEBSITE FEATURES (for "how do I..." questions, not just data lookups):
- Search: there's a search bar that filters the visible content live as you type.
- Dark mode: a theme toggle button in the menu switches the whole site between
  light and dark mode.
- Share: a Share button (fixed near the bottom-right of the page) opens the
  device's native share sheet, or copies the page link if sharing isn't
  supported.
- Custom orders: a WhatsApp link/button lets visitors message Shivam directly
  to request a custom piece (calligraphy, sketch, DIY item, card, etc.).
- Call button: a tap-to-call button for quickly phoning Shivam.

KEY FACTS:
- Custom orders / WhatsApp: https://wa.link/zvaoa9
- Contact email: babitavrm60@gmail.com
- Phone / WhatsApp: +91 9005325544
- YouTube: youtube.com/c/ShivamsWorld
- Instagram: instagram.com/shivams.world
- Facebook: facebook.com/shivamscreativeworld

TONE: warm, concise, helpful — like a knowledgeable friend, not a corporate
bot. Keep replies short (2-4 sentences unless the visitor asks for detail).
FORMATTING: use **bold** (double asterisks) around the 1-3 most important
words or phrases in every reply — e.g. a product/service name, a key action
("**WhatsApp**"), a number, or a deadline. Use *single asterisks* only for
light emphasis on a secondary word, and only when it adds real clarity. Do
not skip bold entirely — a reply with zero formatting reads flat; a reply
that's all bold is noisy. Aim for one clear highlight per sentence at most.

IMPORTANT — when you're not sure: if a question is about pricing, order
status, availability, or any specific detail you don't actually have, don't
guess. Say so plainly and point the visitor to WhatsApp (https://wa.link/zvaoa9)
to get an accurate answer directly from Shivam, rather than answering
something that might be wrong. If a question is unrelated to Shivam's World,
answer briefly and helpfully anyway, then gently steer back.`;

// ---------------------------------------------------------------------
// Basic per-IP rate limit: 10 requests / minute. This is an in-memory,
// best-effort limiter — serverless instances are ephemeral and may not
// share state, but it catches bursts within a warm instance without
// needing an external store.
// ---------------------------------------------------------------------
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const requestLog = new Map(); // ip -> timestamps[]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);

  // Keep the map from growing unbounded across a long-lived warm instance.
  if (requestLog.size > 500) {
    for (const [key, arr] of requestLog) {
      if (arr.every((t) => now - t >= RATE_WINDOW_MS)) requestLog.delete(key);
    }
  }

  return timestamps.length > RATE_LIMIT;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please slow down a little." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error:
        "The AI assistant isn't fully set up yet — Shivam is finishing the configuration. In the meantime, feel free to reach out on WhatsApp!",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const incomingHistory = Array.isArray(body.history) ? body.history : [];

  if (!message && incomingHistory.length === 0) {
    return res.status(400).json({ error: "Empty message." });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "Message is too long." });
  }

  // Gemini uses "user" / "model" roles (not "assistant") inside `contents`.
  const contents = incomingHistory
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text.trim() }],
    }));

  // Make sure the conversation ends with the latest user turn.
  const last = contents[contents.length - 1];
  if (!last || last.role !== "user" || last.parts[0].text !== message) {
    if (message) contents.push({ role: "user", parts: [{ text: message }] });
  }

  if (contents.length === 0) {
    return res.status(400).json({ error: "Empty message." });
  }

  // Abort well before Vercel's own default function timeout kicks in
  // (no maxDuration override, matching MediHome) so we can return a
  // proper JSON error instead of the platform silently dropping the
  // connection with an empty response. The frontend treats any non-ok
  // response here as a cue to fall back to its local answers.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 400 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Gemini API error:", response.status, errText);
      return res.status(502).json({
        error:
          "The assistant is having trouble responding right now. Please try again in a moment.",
      });
    }

    const data = await response.json();
    const candidate = (data.candidates || [])[0];
    const reply = candidate
      ? (candidate.content?.parts || [])
          .map((p) => p.text || "")
          .join("\n")
          .trim()
      : "";

    if (!reply) {
      // Gemini can return an empty candidate list if safety filters block
      // the response (finishReason: SAFETY, RECITATION, etc.).
      const blocked = candidate && candidate.finishReason && candidate.finishReason !== "STOP";
      return res.status(502).json({
        error: blocked
          ? "I can't help with that particular request — feel free to ask something else!"
          : "The assistant didn't return a response. Please try again.",
      });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.error("Gemini API timed out after 8s");
      return res.status(504).json({
        error:
          "The assistant is taking longer than usual to respond. Please try again in a moment.",
      });
    }
    console.error("Chat handler error:", err);
    return res.status(500).json({
      error: "Something went wrong while contacting the assistant.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
