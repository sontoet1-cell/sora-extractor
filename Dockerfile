# Dùng image có sẵn Chromium và Playwright mới nhất
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app
COPY package*.json ./

# Cài dependencies
RUN npm ci --omit=dev || npm i --production

# Cài lại Chromium đúng version cho Playwright
RUN npx playwright install chromium
RUN npx playwright install-deps

# Copy toàn bộ project
COPY . .

ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "server.js"]
