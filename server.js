import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(express.json());
app.use(cors());

// ⚡ Base health route
app.get("/", (_, res) =>
  res
    .status(200)
    .type("text")
    .send("OK - Sora Extractor running. Use /api/extract?url=...")
);

// ⚙️ Launch options
const LAUNCH_OPTIONS = {
  headless: process.env.PW_HEADLESS !== "0",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--single-process",
    "--no-zygote",
    "--disable-features=VizDisplayCompositor",
  ],
};

// 🧠 Helper timeout
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);

// 🎯 API endpoint
app.get("/api/extract", async (req, res) => {
  const pageUrl = (req.query.url || "").trim();
  console.log("[extract] ->", pageUrl);

  if (!pageUrl)
    return res.status(400).json({ ok: false, error: "Missing url" });

  if (/(chatgpt\.com|openai\.com)/i.test(pageUrl))
    return res
      .status(400)
      .json({ ok: false, error: "chatgpt.com / openai.com not supported" });

  // ✅ Nếu link là file video trực tiếp thì trả luôn
  if (/\.(mp4|m3u8)(\?|$)/i.test(pageUrl)) {
    return res.json({
      ok: true,
      normalized: {
        page_url: pageUrl,
        direct_video: pageUrl,
        mp4: /\.mp4/i.test(pageUrl) ? pageUrl : null,
        m3u8: /\.m3u8/i.test(pageUrl) ? pageUrl : null,
        all: [pageUrl],
      },
    });
  }

  let browser, context, page;
  try {
    browser = await chromium.launch(LAUNCH_OPTIONS);
    context = await browser.newContext();
    page = await context.newPage();

    const hits = [];
    page.on("requestfinished", (req) => {
      const u = req.url();
      if (/\.(mp4|m3u8)(\?|$)/i.test(u)) hits.push(u);
    });

    console.log("[goto] visiting:", pageUrl);

    // Không dùng networkidle vì dễ treo, chỉ chờ load
    await withTimeout(page.goto(pageUrl, { waitUntil: "load", timeout: 25000 }), 30000);

    const dom = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("video,source")) {
        const s = el.src || el.getAttribute("src") || el.getAttribute("data-src");
        if (s) out.push(s);
      }
      return Array.from(new Set(out));
    });

    const all = Array.from(new Set([...hits, ...dom]));
    if (!all.length)
      return res.status(404).json({ ok: false, error: "No video found", links: [] });

    const mp4 = all.find((u) => /\.mp4(\?|$)/i.test(u)) || null;
    const m3u8 = all.find((u) => /\.m3u8(\?|$)/i.test(u)) || null;

    res.json({
      ok: true,
      normalized: {
        page_url: pageUrl,
        direct_video: mp4 || m3u8 || all[0],
        mp4,
        m3u8,
        all,
      },
    });
  } catch (e) {
    console.error("[extract][error]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  } finally {
    try {
      await page?.close();
      await context?.close();
      await browser?.close();
    } catch {}
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Server running on port", port));
