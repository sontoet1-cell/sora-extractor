FROM mcr.microsoft.com/playwright:focal
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
ENV PW_HEADLESS=1
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
