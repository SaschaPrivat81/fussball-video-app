FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data /app/storage/videos /app/storage/thumbnails

EXPOSE 3001

CMD ["node", "server.js"]
