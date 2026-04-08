FROM node:22-alpine

RUN apk add --no-cache mysql-client

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod +x entrypoint.sh

CMD ["sh", "entrypoint.sh"]