import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

// Health check để khỏi "Cannot GET /"
app.get("/", (_, res) =>
  res.type("text").send("OK - Sora Extractor running. Use /api/extract?url=...")
);

// Flags tiết kiệm RAM cho Render Free
const LAUNCH_OPTIONS = {
  headless: process.env.PW_HEADLESS !== "0",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--single-process",
    "--no-zygote",
    "--disable-features=VizDisplayCompositor"
  ]
};

async function findVideoFromPage(page, pageUrl) {
  const hits = [];
  page.on("requestfinished", req => {
    const u = req.url();
    if (/\.(mp4|m3u8)(\?|$)/i.test(u)) hits.push(u);
  });

  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 45000 });

  const dom = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("video,source")) {
      const s = el.src || el.getAttribute("src") || el.getAttribute("data-src");
      if (s) out.push(s);
    }
    for (const m of document.querySelectorAll("meta[property],meta[name],link[itemprop]")) {
      const k = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop");
      const v = m.content || m.getAttribute("href");
      if (v && /(og:video|twitter:player|contentUrl|video|player)/i.test(k)) out.push(v);
    }
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.innerText);
        const txt = JSON.stringify(j);
        const m = txt.match(/https?:\/\/[^"]+\.(mp4|m3u8)[^"]*/i);
        if (m) out.push(m[0]);
      } catch {}
    }
    return Array.from(new Set(out));
  });

  const all = Array.from(new Set([...hits, ...dom]));
  return all.map(u => ({ url: u, type: /\.mp4(\?|$)/i.test(u) ? "mp4" : (/\.m3u8(\?|$)/i.test(u) ? "m3u8" : "unknown") }));
}

app.get("/api/extract", async (req, res) => {
  const pageUrl = (req.query.url || "").trim();
  if (!pageUrl) return res.status(400).json({ ok: false, error: "Missing url" });
  if (/(chatgpt\.com|openai\.com)/i.test(pageUrl))
    return res.status(400).json({ ok: false, error: "Links from chatgpt.com/openai.com are not supported." });

  let browser;
  try {
    browser = await chromium.launch(LAUNCH_OPTIONS);
    const ctx = await browser.newContext();
    if (process.env.EXTRACTOR_COOKIES) {
      try { await ctx.addCookies(JSON.parse(process.env.EXTRACTOR_COOKIES)); } catch {}
    }
    const page = await ctx.newPage();
    const results = await findVideoFromPage(page, pageUrl);
    await page.close(); await ctx.close(); await browser.close();

    if (!results.length) return res.status(404).json({ ok:false, error:"No video found", links:[] });
    const mp4 = results.find(r=>r.type==="mp4");
    const m3u8 = results.find(r=>r.type==="m3u8");
    const direct = (mp4?.url) || (m3u8?.url) || results[0].url;

    res.json({ ok:true, normalized:{ page_url: pageUrl, direct_video: direct, mp4: mp4?.url||null, m3u8: m3u8?.url||null, all: results } });
  } catch (e) {
    try { if (browser) await browser.close(); } catch {}
    res.status(500).json({ ok:false, error:String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));
