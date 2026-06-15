FROM node:20-alpine AS deps

WORKDIR /app

COPY services/identity-service/package*.json ./
RUN npm ci

FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY services/identity-service ./
COPY proto ../../proto

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /proto ../../proto

EXPOSE 50051

CMD ["npm", "start"]
