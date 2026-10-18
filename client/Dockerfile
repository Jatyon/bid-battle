# Stage 1: Build Angular SSR application
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration=production

# Stage 2: Production runner
FROM node:22-alpine

WORKDIR /usr/src/app
ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/client/server/server.mjs"]
