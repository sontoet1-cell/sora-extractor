FROM mcr.microsoft.com/playwright:v1.56.1-focal

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# đảm bảo Chromium có sẵn (an toàn cho Render Free)
RUN npx playwright install --with-deps chromium

COPY . .
ENV PW_HEADLESS=1
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
