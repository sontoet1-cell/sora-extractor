# Sora Extractor - No Logo (v3)
- Clicks Download, filters out preview/watermark URLs, ranks by type/domain/size.
- Returns highest-score candidates first.

Return JSON:
{
  ok: true,
  via: "playwright-nologo",
  sources: [{ url, type: "direct"|"m3u8", size, score }]
}
