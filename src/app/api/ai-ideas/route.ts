import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiting (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(ip: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const ipLimit = rateLimitMap.get(ip);
  if (!ipLimit || now > ipLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (ipLimit.count >= limit) {
    return false;
  }
  ipLimit.count++;
  return true;
}

function sanitizeInput(input: string): string {
  // Remove script tags and limit length
  let sanitized = input.replace(/<script.*?>.*?<\/script>/gi, "");
  sanitized = sanitized.replace(/[^\w\s.,-]/gi, ""); // Only allow safe chars
  return sanitized.slice(0, 100);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIp, 10, 60000)) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again in 1 minute." }, { status: 429 });
    }
    const { topic } = await req.json();
    const safeTopic = topic ? sanitizeInput(topic) : "";
    const prompt = `Buatkan 5-10 ide judul artikel yang menarik dan unik, dan 10-20 keyword SEO yang relevan untuk topik berikut (atau random jika kosong): ${safeTopic || "bebas"}. Jawab dengan format JSON:\n{\n  "titles": ["judul 1", ...],\n  "keywords": ["keyword 1", ...]\n}`;

    // Panggil OpenRouter API
    // Model untuk AI ideas (bisa berbeda dengan model untuk generate article)
    const aiIdeasModel = process.env.OPENROUTER_AI_IDEAS_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-3.5-turbo";
    
    const openrouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: aiIdeasModel,
        messages: [
          { role: "system", content: "Kamu adalah asisten AI kreatif untuk ide artikel." },
          { role: "user", content: prompt },
        ],
        max_tokens: 256,
        temperature: 0.9,
      }),
    });

    if (!openrouterRes.ok) {
      return NextResponse.json({ error: "Failed to get ideas from AI" }, { status: 500 });
    }
    const data = await openrouterRes.json();
    // Ambil hasil dan parse array JSON dari response AI
    let titles: string[] = [];
    let keywords: string[] = [];
    try {
      const text = data.choices?.[0]?.message?.content || "";
      // Cari JSON object di dalam text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        titles = Array.isArray(parsed.titles) ? parsed.titles.slice(0, 10) : [];
        keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : [];
      }
    } catch {}
    return NextResponse.json({ titles, keywords });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
} 