GFARM_HTTP      ?= gfarm-http
CMD_DIR         ?= ./cmd/gfarm-http

JWT_CURL        ?= jwt-curl
JWT_CURL_UPLOAD ?= jwt-curl-upload

TEST_SCRIPT     ?= ./test/gfarm-http-test.sh
API_COVERAGE_PROFILE ?= /tmp/gfarm-http-api.cover
UNIT_COVERAGE_PROFILE ?= /tmp/gfarm-http-unit.cover

PREFIX  ?= /usr/local
BINDIR  ?= $(PREFIX)/bin
DESTDIR ?=

INSTALL          ?= install
INSTALL_PROGRAM  ?= $(INSTALL) -m 0755

TAG := $(shell git describe --tags --match 'client/*' --dirty --always 2>/dev/null || git rev-parse --short HEAD)

.PHONY: all build clean install uninstall test test-contract test-coverage lint

all: build

build:
	go build -ldflags "-X 'main.Version=${TAG}'" -o $(GFARM_HTTP) $(CMD_DIR)

install:
	$(INSTALL) -d $(DESTDIR)$(BINDIR)
	$(INSTALL_PROGRAM) $(GFARM_HTTP)      $(DESTDIR)$(BINDIR)/$(GFARM_HTTP)
	$(INSTALL_PROGRAM) $(JWT_CURL)        $(DESTDIR)$(BINDIR)/$(JWT_CURL)
	$(INSTALL_PROGRAM) $(JWT_CURL_UPLOAD) $(DESTDIR)$(BINDIR)/$(JWT_CURL_UPLOAD)

uninstall:
	rm -f $(DESTDIR)$(BINDIR)/$(GFARM_HTTP)
	rm -f $(DESTDIR)$(BINDIR)/$(JWT_CURL)
	rm -f $(DESTDIR)$(BINDIR)/$(JWT_CURL_UPLOAD)

clean:
	rm -f $(GFARM_HTTP)

test: build
	$(TEST_SCRIPT) /tmp

test-contract:
	spec="$$($(CURDIR)/../server/venv/bin/python $(CURDIR)/../server/bin/fetch-openapi-json.py)" && \
	GFARM_HTTP_OPENAPI_JSON="$$spec" go test -v -cover ./...

test-coverage:
	spec="$$($(CURDIR)/../server/venv/bin/python $(CURDIR)/../server/bin/fetch-openapi-json.py)" && \
	GFARM_HTTP_OPENAPI_JSON="$$spec" go test ./... -count=1 -run '^TestAPI' -v -coverprofile=$(API_COVERAGE_PROFILE)
	go test ./... -run '^TestUnit' -coverprofile=$(UNIT_COVERAGE_PROFILE)

lint:
	@unformatted="$$(find . -type f -name '*.go' -not -path './vendor/*' -print0 | xargs -0 gofmt -l)"; \
	if [ -n "$$unformatted" ]; then \
		printf 'Run gofmt on these files:\n%s\n' "$$unformatted"; \
		exit 1; \
	fi
	go vet ./...
