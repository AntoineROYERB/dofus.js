# Single-image build: the Go binary serves both the WebSocket API and the built
# frontend, so a deployment is one container. docker-compose.yml keeps the
# nginx + backend split for local work.

FROM node:22-alpine AS web
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /out/server /usr/local/bin/server
COPY --from=web /app/dist /srv/web
# Game content and balance (balance.json, spells.json, classes.json): plain
# JSON files, editable without a rebuild — but they still have to exist
# inside the image, since nothing else from the source tree is copied here.
# The server refuses to start if spells.json or classes.json is missing.
COPY backend/config/*.json /config/

USER app
ENV PORT=8080 STATIC_DIR=/srv/web
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/server"]
