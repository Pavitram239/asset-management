FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . ./
COPY --from=client-build /app/client/dist ./public

EXPOSE 5100

CMD ["node", "server.js"]