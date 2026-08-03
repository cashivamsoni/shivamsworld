// /api/chat.js
// Vercel serverless function — proxies chat messages to the Gemini API.
// The API key never reaches the browser: it's read server-side from the
// GEMINI_API_KEY environment variable configured in the Vercel dashboard.

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are the friendly AI assistant embedded on "Shivam's World"
(https://shivams-world.vercel.app), a YouTube channel and creative brand run by
Shivam Soni based in Kanpur, India.

The site/channel features: DIY crafts, calligraphy, sketches/drawings, handcrafted
cards, and other creative content. Visitors can browse videos, view Shivam's work,
download QR codes, and place custom orders.

Key facts to use when relevant:
- Custom orders: direct people to the WhatsApp order link: https://wa.link/zvaoa9
- Contact email: babitavrm60@gmail.com
- Phone / WhatsApp: +91 9005325544
- YouTube: youtube.com/c/ShivamsWorld
- Instagram: instagram.com/shivams.world
- Facebook: facebook.com/shivamscreativeworld

Tone: warm, concise, helpful — like a knowledgeable friend, not a corporate bot.
Keep replies short (2-4 sentences unless the visitor asks for detail). If asked
about pricing or order specifics you don't know, point them to WhatsApp to chat
directly with Shivam. If a question is unrelated to Shivam's World, answer briefly
and helpfully anyway, then gently steer back. Never invent order status, prices,
or personal details you weren't given above.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
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
    console.error("Chat handler error:", err);
    return res.status(500).json({
      error: "Something went wrong while contacting the assistant.",
    });
  }
};
