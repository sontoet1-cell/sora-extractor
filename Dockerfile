# Use the Playwright 1.56.1 base image
FROM mcr.microsoft.com/playwright:v1.56.1-focal

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Run the app
CMD ["node", "server.js"]
