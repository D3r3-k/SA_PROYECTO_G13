FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY services/catalog-service/go.mod ./go.mod
RUN go mod download

COPY services/catalog-service/ ./
RUN go build -o /catalog-service ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /catalog-service /usr/local/bin/catalog-service
COPY services/catalog-service/migrations ./migrations
EXPOSE 50055
CMD ["catalog-service"]
