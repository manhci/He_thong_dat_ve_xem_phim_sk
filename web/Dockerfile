FROM node:20.18-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy source code and assets
COPY . .

# Ensure upload directory exists
RUN mkdir -p /app/public/uploads

EXPOSE 3000

CMD ["node", "src/server.js"]
