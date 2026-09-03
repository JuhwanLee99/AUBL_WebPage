FROM mcr.microsoft.com/playwright:v1.62.0-noble

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
USER pwuser
EXPOSE 8080

CMD ["node", "src/server.mjs"]
