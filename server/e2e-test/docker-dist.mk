# Include-only targets for the docker/dist integration tests.
# docker/dist service settings are supplied by the Gfarm Makefile.
GFARM_HTTP_PLAYWRIGHT_CACHE_HOME ?= $(if $(XDG_CACHE_HOME),$(XDG_CACHE_HOME),$(HOME)/.cache)

.PHONY: help-integration-test test-e2e list-webui-cases test-webui clean-test-cache

export GFARM_HTTP_WEBUI_CASE
export GFARM_HTTP_PLAYWRIGHT_CACHE_HOME

help-integration-test:
	@echo "make test-e2e - run the docker/dist real-Gfarm E2E test suite"
	@echo "make list-webui-cases - list real-Gfarm Playwright case titles"
	@echo "make test-webui GFARM_HTTP_WEBUI_CASE='title' - run one Web UI case"
	@echo "make clean-test-cache - remove cached Playwright dependencies"

test-e2e:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh"

list-webui-cases:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --list-webui-cases

test-webui:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --webui-case

clean-test-cache:
	GFARM_HTTP_PLAYWRIGHT_CACHE_HOME="$(GFARM_HTTP_PLAYWRIGHT_CACHE_HOME)" "$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --clean-cache
