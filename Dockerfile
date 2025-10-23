FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm i --production
RUN npx playwright install --with-deps chromium

COPY . .
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0
EXPOSE 10000

CMD ["node", "server.js"]
