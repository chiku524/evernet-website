FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript tsx --no-save && npx tsc -p tsconfig.json
ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data
ENV BLOB_DIR=/data/blobs
RUN mkdir -p /data/blobs
EXPOSE 8787
CMD ["node", "dist/index.js"]
