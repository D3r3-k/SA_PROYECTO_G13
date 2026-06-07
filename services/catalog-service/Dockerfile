FROM  golang:1.25.1-alpine

WORKDIR /app

COPY src/go.mod src/go.sum ./

RUN go mod download

COPY src/ .

EXPOSE 50052

CMD ["go", "run", "cmd/main.go"]



