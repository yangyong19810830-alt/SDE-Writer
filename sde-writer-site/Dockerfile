FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY prompts ./prompts
COPY public ./public

ENV PORT=5173
EXPOSE 5173

CMD ["node", "server.js"]
