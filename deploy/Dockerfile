FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY deploy/package.json deploy/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /app/data && chown node:node /app/data
COPY server/ ./server/
COPY prototypes/ ./prototypes/
USER node
EXPOSE 3000
CMD ["node", "server/auth.mjs"]
