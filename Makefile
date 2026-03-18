.PHONY: build web run dev test clean

VERSION := 0.1.0
BINARY  := monmon
LDFLAGS := -ldflags "-s -w -X main.version=$(VERSION)"

# Build React frontend and copy dist to embed location
web:
	cd web && npm ci && npm run build
	rm -rf internal/webui/dist
	cp -r web/dist internal/webui/dist

# Build the Go binary (requires `make web` first for embedded UI)
build: web
	CGO_ENABLED=0 go build $(LDFLAGS) -o $(BINARY) ./cmd/monmon/

# Build without rebuilding the frontend
build-go:
	CGO_ENABLED=0 go build $(LDFLAGS) -o $(BINARY) ./cmd/monmon/

run: build
	./$(BINARY) server

# Dev: run backend only, use `cd web && npm run dev` separately
dev:
	go run ./cmd/monmon/ server

test:
	go test ./... -v

clean:
	rm -f $(BINARY) $(BINARY).exe
	rm -rf data/ internal/webui/dist web/dist
