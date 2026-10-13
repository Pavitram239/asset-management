FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=server --omit=dev --include-workspace-root=false

COPY server/ ./server/
WORKDIR /app/server
EXPOSE 5100
CMD ["node", "src/server.js"]
