# Nologo variant
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm i --production
RUN npx playwright install chromium
RUN npx playwright install-deps

COPY . .
ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "server.js"]
