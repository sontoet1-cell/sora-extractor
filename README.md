# 🧩 Sora Extractor - Full Standalone (Playwright + Express)

### 🚀 Features
- Completely independent (no reliance on soravideodownloader.net)
- Uses Playwright Chromium to open any webpage and find video links (.mp4/.m3u8)
- Works on Render, Railway, or Cloud Run (not ideal for Vercel)

### 🧱 Installation (Local)
```bash
npm install
npx playwright install --with-deps
PW_HEADLESS=0 node server.js
```
Then visit: http://localhost:3000/api/extract?url=https://example.com/video-page

### ☁️ Deploy (Docker)
```bash
docker build -t sora-extractor .
docker run -p 3000:3000 sora-extractor
```
Deploy to Render/Cloud Run easily.

### ⚙️ Environment Variables
| Variable | Description |
|-----------|--------------|
| `PW_HEADLESS` | `1` = headless mode, `0` = visible browser |
| `PORT` | Server port (default 3000) |
| `EXTRACTOR_COOKIES` | JSON string of cookies if you need to access private videos |

### 🧠 Example Usage
```bash
curl "http://localhost:3000/api/extract?url=https://www.w3schools.com/html/mov_bbb.mp4"
```

Expected Output:
```json
{
  "ok": true,
  "normalized": {
    "page_url": "https://www.w3schools.com/html/mov_bbb.mp4",
    "direct_video": "https://www.w3schools.com/html/mov_bbb.mp4",
    "mp4": "https://www.w3schools.com/html/mov_bbb.mp4",
    "m3u8": null,
    "all": [ { "url": "...", "type": "mp4" } ]
  }
}
```
