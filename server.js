import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

const LAUNCH_OPTIONS = {
  headless: process.env.PW_HEADLESS === "1" ? true : false,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
};

async function findVideoFromPage(page, pageUrl) {
  const hits = [];
  page.on("requestfinished", async req => {
    try {
      const url = req.url();
      if (/\.(mp4|m3u8)(\?|$)/i.test(url)) {
        hits.push({ url, type: /\.mp4(\?|$)/i.test(url) ? "mp4" : "m3u8" });
      }
    } catch {}
  });

  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });

  const domHits = await page.evaluate(() => {
    const out = [];
    for (const v of document.querySelectorAll("video, source")) {
      const src = v.src || v.getAttribute("src") || v.getAttribute("data-src");
      if (src) out.push(src);
    }
    for (const m of document.querySelectorAll("meta[property], meta[name], link[itemprop]")) {
      const name = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop");
      const c = m.content || m.getAttribute("href");
      if (c && /(og:video|twitter:player|contentUrl|video|player)/i.test(name)) out.push(c);
    }
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.innerText);
        const check = JSON.stringify(j);
        const m = check.match(/https?:\/\/[^"]+\.(mp4|m3u8)[^"]*/i);
        if (m) out.push(m[0]);
      } catch(e){}
    }
    return Array.from(new Set(out));
  });

  const all = [];
  hits.forEach(h => all.push(h.url));
  domHits.forEach(d => all.push(d));
  const uniq = Array.from(new Set(all));
  const results = uniq.map(u => {
    if (!u) return null;
    const t = /\.mp4(\?|$)/i.test(u) ? "mp4" : /\.m3u8(\?|$)/i.test(u) ? "m3u8" : "unknown";
    return { url: u, type: t };
  }).filter(Boolean);
  return results;
}

app.get("/api/extract", async (req, res) => {
  const pageUrl = (req.query.url || "").trim();
  if (!pageUrl) return res.status(400).json({ ok: false, error: "Missing url" });
  if (/(chatgpt\.com|openai\.com)/i.test(pageUrl)) {
    return res.status(400).json({ ok: false, error: "Links from chatgpt.com/openai.com are not supported." });
  }

  let browser;
  try {
    browser = await chromium.launch(LAUNCH_OPTIONS);
    const context = await browser.newContext();
    if (process.env.EXTRACTOR_COOKIES) {
      try {
        const cookies = JSON.parse(process.env.EXTRACTOR_COOKIES);
        await context.addCookies(cookies);
      } catch {}
    }
    const page = await context.newPage();
    const results = await findVideoFromPage(page, pageUrl);
    await page.close();
    await context.close();
    await browser.close();

    if (!results.length) return res.status(404).json({ ok: false, error: "No video found", links: [] });

    const mp4 = results.find(r => r.type === "mp4");
    const m3u8 = results.find(r => r.type === "m3u8");
    const direct = (mp4 && mp4.url) || (m3u8 && m3u8.url) || results[0].url;

    res.json({ ok: true, normalized: { page_url: pageUrl, direct_video: direct, mp4: mp4?.url || null, m3u8: m3u8?.url || null, all: results } });
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));
