FROM node:20.18-alpine

WORKDIR /app

# Hardening: Cap nhat cac goi he dieu hanh Alpine de va lo hong bao mat
RUN apk update && apk upgrade --no-cache

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy source code and assets
COPY . .

# Ensure upload directory exists and assign ownership to node user
RUN mkdir -p /app/public/uploads && chown -R node:node /app

# Switch to unprivileged non-root user
USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
