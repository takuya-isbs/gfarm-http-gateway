ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
API_COVERAGE_FILE ?= /tmp/gfarm-http-api-requests.jsonl
API_COVERAGE_BASELINE ?= $(ROOT_DIR)/client/api-coverage-baseline.json
REACT_APP_DIR ?= $(ROOT_DIR)/server/frontend/app/react-app
NPM ?= npm
SERVER_PYTHON ?= $(ROOT_DIR)/server/venv/bin/python
OPENAPI_FETCHER ?= $(ROOT_DIR)/server/bin/fetch-openapi-json.py
API_COVERAGE_ANALYZER ?= $(ROOT_DIR)/server/api/test/api_route_coverage.py

.PHONY: ci lint test-unit-all test-api-coverage

ci:
	$(MAKE) lint
	CI=true $(MAKE) test-unit-all

lint:
	$(MAKE) -C client lint
	$(MAKE) -C server lint

# Direct calls preserve the caller's CI environment; use `make ci` for Actions-mode checks.
test-unit-all:
	$(MAKE) -C server test-unit
	$(MAKE) -C client test-coverage
	$(MAKE) test-api-coverage

# The API request test also runs in client test-coverage; it runs again here to record CLI requests.
test-api-coverage:
	@set -eu; \
	umask 077; : > "$(API_COVERAGE_FILE)"; \
	spec="$$($(SERVER_PYTHON) $(OPENAPI_FETCHER))"; \
	cd "$(ROOT_DIR)/client"; \
	GFARM_HTTP_OPENAPI_JSON="$$spec" \
	GFARM_HTTP_API_COVERAGE_FILE="$(API_COVERAGE_FILE)" \
		go test ./cmd/gfarm-http -count=1 \
		-run '^TestAPIRequestsMatchServerOpenAPI$$' -v; \
	cd "$(REACT_APP_DIR)"; \
	GFARM_HTTP_API_COVERAGE_FILE="$(API_COVERAGE_FILE)" $(NPM) run test:unit-webui:chromium; \
	cd "$(ROOT_DIR)"; \
	GFARM_HTTP_OPENAPI_JSON="$$spec" "$(SERVER_PYTHON)" \
		"$(API_COVERAGE_ANALYZER)" "$(API_COVERAGE_FILE)" \
		--baseline "$(API_COVERAGE_BASELINE)"
