import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { chromium } from "playwright";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

async function extractWithPlaywright(targetUrl) {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
  let context, page;
  try {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    });
    page = await context.newPage();

    const hits = new Set();
    page.on("response", async (resp) => {
      try {
        const url = resp.url();
        if (/\.(mp4|m3u8)(\?|$)/i.test(url)) hits.add(url);
        // some backends stream without extension; detect by content-type
        const ct = resp.headers()["content-type"] || "";
        if (/video\/mp4|application\/vnd\.apple\.mpegurl|application\/x-mpegURL/i.test(ct)) {
          hits.add(url);
        }
      } catch {}
    });

    await page.route("**/*", async (route) => {
      const req = route.request();
      const headers = { ...req.headers(), "sec-fetch-site": "same-origin" };
      await route.continue({ headers });
    });

    await page.goto(targetUrl, { timeout: 60000, waitUntil: "networkidle" });
    // give the page a moment to lazy-load
    await page.waitForTimeout(4000);

    // Also scan DOM (some sites embed <video src>)
    const domUrls = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("video, source").forEach(el => {
        const u = (el.currentSrc || el.src || el.getAttribute("src") || "").trim();
        if (u) out.push(u);
      });
      return out;
    });
    domUrls.forEach(u => hits.add(u));

    // return uniq list
    return Array.from(hits);
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
    // 1) Playwright first
    let sources = [];
    try {
      sources = await extractWithPlaywright(input);
    } catch (e) {
      console.warn("[extract] playwright failed:", e?.message || e);
    }

    if (sources?.length) {
      const uniq = Array.from(new Set(sources));
      return res.json({
        ok: true,
        via: "playwright",
        sources: uniq.map(u => ({ url: u, type: /\.m3u8/i.test(u) ? "m3u8" : "direct" })),
      });
    }

    // 2) Fallback SaveSora
    const upstream = process.env.UPSTREAM || "https://savesora.com/api/proxy-download";
    const r = await fetch(`${upstream}?url=${encodeURIComponent(input)}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json,text/plain,*/*" }
    });
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ ok:false, error:"upstream_error", status:r.status, body: body.slice(0,200) });
    }
    if (ct.includes("application/json")) {
      res.setHeader("Content-Type", ct);
      return res.status(200).send(body);
    }
    // last resort: parse text for links
    const links = Array.from(body.matchAll(/https?:\/\/\S+\.(?:mp4|m3u8)(?:\?\S*)?/ig)).map(m=>m[0]);
    return res.json({ ok: !!links.length, via:"savesora_text", sources: links.map(u => ({ url:u })) });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"server_error", message: e?.message || String(e) });
  }
});

app.get("/", (_, res) => res.type("text/plain").send("Sora Extractor (Playwright)\nGET /api/sora?url=<Sora link>\nGET /health\n"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("[sora-extractor] listening on", PORT));
