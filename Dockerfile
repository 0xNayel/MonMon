# Build the React frontend (run `make web` locally first, or this stage handles it)
FROM node:22-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY web/ ./
RUN npm run build

# Build the Go binary with the embedded frontend
FROM golang:1.25-alpine AS go-build
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download && \
    GOPATH=/go go install github.com/sw33tLie/bbscope@latest || echo "bbscope install skipped" && \
    GOPATH=/go go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest || echo "subfinder install skipped" && \
    GOPATH=/go go install github.com/projectdiscovery/httpx/cmd/httpx@latest || echo "httpx install skipped"
COPY . .
# Overlay the freshly built frontend into the embed location
COPY --from=web-build /web/dist ./internal/webui/dist
RUN CGO_ENABLED=1 go build -ldflags "-s -w" -o /monmon ./cmd/monmon/

# Runtime image — minimal Alpine
FROM alpine:3.19
RUN apk add --no-cache ca-certificates bash

COPY --from=go-build /monmon /usr/local/bin/monmon
COPY --from=go-build /go/bin/bbscope   /usr/local/bin/bbscope
COPY --from=go-build /go/bin/subfinder /usr/local/bin/subfinder
COPY --from=go-build /go/bin/httpx     /usr/local/bin/httpx
COPY configs/monmon.yaml /etc/monmon/monmon.yaml
COPY configs/credentials.yaml /etc/monmon/credentials.yaml
RUN mkdir -p /var/lib/monmon/data

WORKDIR /var/lib/monmon
EXPOSE 8080

ENTRYPOINT ["monmon"]
CMD ["server", "-c", "/etc/monmon/monmon.yaml"]
