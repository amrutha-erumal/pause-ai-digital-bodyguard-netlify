FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .
RUN npm run check && npm test
EXPOSE 8080
CMD ["node", "server.mjs"]
