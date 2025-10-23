import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Kiểm tra hoạt động
app.get("/health", (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

// Route chính
app.get("/api/sora", async (req, res) => {
  const input = req.query.url;
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!input) return res.status(400).json({ ok: false, error: "missing ?url=" });

  try {
    const upstream = process.env.UPSTREAM || "https://savesora.com/api/proxy-download";
    const r = await fetch(`${upstream}?url=${encodeURIComponent(input)}`);
    const ct = r.headers.get("content-type") || "application/json";
    const body = await r.text();
    res.setHeader("Content-Type", ct);
    res.status(r.status).send(body);
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error", message: e?.message || String(e) });
  }
});

// Mặc định
app.get("/", (req, res) => {
  res.type("text/plain").send("Sora Extractor ready!\nGET /api/sora?url=<link>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("[Sora Extractor] listening on", PORT));
