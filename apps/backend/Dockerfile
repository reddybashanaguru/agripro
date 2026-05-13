# ── Build stage ────────────────────────────────────────────────
# Build context is the repo root (Railway default).
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY apps/backend/go.mod apps/backend/go.sum ./
RUN go mod download

COPY apps/backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o finagra-api ./main.go

# ── Runtime stage ───────────────────────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/finagra-api .

EXPOSE 8888

CMD ["./finagra-api"]
