FROM node:22-alpine

RUN apk add --no-cache mysql-client dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads && chmod +x entrypoint.sh && chown -R node:node /usr/src/app

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "entrypoint.sh"]