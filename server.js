import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// quick HEAD to get size & type
async function headInfo(url) {
  try {
    const r = await fetch(url, { method:"HEAD" });
    return {
      ok: r.ok,
      type: r.headers.get("content-type") || "",
      size: +(r.headers.get("content-length") || 0),
    };
  } catch {
    return { ok:false, type:"", size:0 };
  }
}

function scoreUrl(u, info) {
  let s = 0;
  const url = u.toLowerCase();
  if (url.includes("videos.openai.com/az/files")) s += 5;
  if (url.includes(".mp4")) s += 5;
  if (url.includes("preview") || url.includes("watermark") || url.includes("wm")) s -= 6;
  if (url.includes("blob:")) s -= 10;
  if (url.includes("m3u8")) s += 1; // fallback
  if (info?.ok) s += 1;
  if ((info?.type||"").includes("video/mp4")) s += 3;
  s += Math.min(10, Math.floor((info?.size||0) / (5*1024*1024))); // +1 per 5MB up to 10
  return s;
}

async function extractNoLogo(targetUrl, maxWaitMs=30000) {
  const browser = await chromium.launch({ headless:true, args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"] });
  let context, page;
  const hits = new Map(); // url -> info
  try {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      viewport: { width: 1360, height: 900 }
    });
    page = await context.newPage();

    page.on("response", async (resp) => {
      try {
        const url = resp.url();
        const ct = (resp.headers()["content-type"] || "").toLowerCase();
        if (/\.(mp4|m3u8)(\?|$)/i.test(url) || /video\/mp4|mpegurl/i.test(ct)) {
          if (!hits.has(url)) hits.set(url, { type: ct, size: 0, ok: true });
        }
      } catch {}
    });

    await page.goto(targetUrl, { waitUntil:"domcontentloaded", timeout:60000 });
    // Ensure video starts so network requests fire
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v) { v.muted = true; v.play().catch(()=>{}); }
    }).catch(()=>{});

    // Try clicking a "Download" button (various selectors)
    const selectors = [
      'button:has-text("Download")',
      '[aria-label*="Download" i]',
      '[data-testid*="download" i]',
      'a:has-text("Download")',
      'a[href*="download"]',
    ];
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) { await btn.click({ timeout: 1000 }); await sleep(1200); }
      } catch {}
    }

    // Poll for a while to collect URLs
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      // DOM sources too
      try {
        const domUrls = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll("video, source").forEach(el => {
            const u = el.currentSrc || el.src || el.getAttribute("src");
            if (u) out.push(u);
          });
          // look for anchors that look like download
          document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute("href") || "";
            if (/(mp4|m3u8)/i.test(href)) out.push(href);
          });
          return out;
        });
        for (const u of domUrls) if (!hits.has(u)) hits.set(u, { type:"", size:0, ok:true });
      } catch {}

      if (hits.size) break;
      await sleep(400);
    }

    // Enrich with HEAD info & rank
    const entries = [];
    for (const [u, meta] of hits) {
      const info = await headInfo(u);
      entries.push({ url: u, info, score: scoreUrl(u, info) });
    }
    entries.sort((a,b) => b.score - a.score);

    return entries.map(e => ({ url: e.url, type: /\.m3u8/i.test(e.url) ? "m3u8" : "direct", size: e.info?.size || 0, score: e.score }));
  } finally {
    try { await page?.close(); } catch {}
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }
}

app.get("/api/sora", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const input = req.query.url;
  if (!input) return res.status(400).json({ ok:false, error:"missing ?url=" });
  try {
    const list = await extractNoLogo(input, 30000);
    if (!list.length) return res.status(404).json({ ok:false, error:"no_media_found" });
    // prefer non-watermark/preview, highest score first already
    return res.json({ ok:true, via:"playwright-nologo", sources:list });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"server_error", message: e?.message || String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("[sora-extractor-nologo] listening on", PORT));
