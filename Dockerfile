# 🧱 Dùng image Playwright mới nhất tương thích 1.56.1
FROM mcr.microsoft.com/playwright:v1.56.1-focal

# Tạo thư mục làm việc
WORKDIR /app

# Copy package trước để cache npm install
COPY package.json package-lock.json* ./

# Cài dependencies
RUN npm install --production

# Copy toàn bộ source code
COPY . .

# Thiết lập biến môi trường
ENV PW_HEADLESS=1
ENV PORT=3000

# Mở cổng 3000
EXPOSE 3000

# Chạy server
CMD ["node", "server.js"]
