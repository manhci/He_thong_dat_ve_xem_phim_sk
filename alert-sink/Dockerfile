FROM node:20.18-alpine

WORKDIR /app

# Hardening: Cap nhat cac goi he dieu hanh Alpine de va lo hong bao mat
RUN apk update && apk upgrade --no-cache

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN chown -R node:node /app

# Switch to unprivileged non-root user
USER node

EXPOSE 5001

CMD ["node", "server.js"]
