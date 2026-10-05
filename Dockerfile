FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY config ./config
RUN mkdir -p data && chown node:node data
USER node
ENV HOTE=0.0.0.0 PORT=8090 NODE_ENV=production
EXPOSE 8090
HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:8090/sante || exit 1
CMD ["node", "src/index.js"]
