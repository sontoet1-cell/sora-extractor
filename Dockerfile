# Dùng image Playwright đúng phiên bản (Ubuntu jammy)
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

# copy trước để cache npm
COPY package.json package-lock.json* ./
RUN npm install

# đảm bảo chromium có sẵn (safe cho Render Free)
RUN npx playwright install --with-deps chromium

# copy source
COPY . .

ENV PW_HEADLESS=1
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
