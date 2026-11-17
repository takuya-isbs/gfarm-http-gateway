# Include-only targets for the docker/dist integration tests.
# docker/dist service settings are supplied by the Gfarm Makefile.
GFARM_HTTP_PLAYWRIGHT_CACHE_HOME ?= $(if $(XDG_CACHE_HOME),$(XDG_CACHE_HOME),$(HOME)/.cache)
DOCKER_DIST_COMPOSE_FILE ?= $(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/docker-dist/docker-compose.yaml
DOCKER_DIST_PROJECT_DIR ?= $(abspath ../../..)
DOCKER_DIST_COMPOSE_ENV_FILES ?= --env-file .env
COMPOSE = docker compose $(DOCKER_DIST_COMPOSE_ENV_FILES) -f $(abspath $(DOCKER_DIST_COMPOSE_FILE)) --project-directory $(DOCKER_DIST_PROJECT_DIR)

.PHONY: help-integration-test compose-config compose-up compose-up-nobuild compose-up-python3.11-nobuild compose-up-python3.15-nobuild pull test-e2e test-e2e-matrix list-webui-cases test-webui clean-test-cache

export GFARM_HTTP_WEBUI_CASE
export GFARM_HTTP_PLAYWRIGHT_CACHE_HOME

help-integration-test:
	@echo "make test-e2e - run the docker/dist real-Gfarm E2E test suite"
	@echo "make test-e2e-matrix - run Web UI and CLI on http-gw-https, then CLI on Python 3.11/3.15"
	@echo "make list-webui-cases - list real-Gfarm Playwright case titles"
	@echo "make test-webui GFARM_HTTP_WEBUI_CASE='title' - run one Web UI case"
	@echo "make clean-test-cache - remove cached Playwright dependencies"

compose-up:
	$(COMPOSE) up -d --build --force-recreate http-gw http-gw-python3.11 nginx

compose-config:
	$(COMPOSE) config --quiet

compose-up-nobuild:
	$(COMPOSE) up -d --no-build --force-recreate http-gw http-gw-python3.11 nginx

compose-up-python3.11-nobuild:
	$(COMPOSE) up -d --no-build --force-recreate http-gw-python3.11

compose-up-python3.15-nobuild:
	$(COMPOSE) up -d --no-build --force-recreate http-gw nginx

pull:
	$(COMPOSE) pull --ignore-buildable --ignore-pull-failures --quiet

test-e2e:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh"

test-e2e-matrix:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist-matrix.sh"

list-webui-cases:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --list-webui-cases

test-webui:
	"$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --webui-case

clean-test-cache:
	GFARM_HTTP_PLAYWRIGHT_CACHE_HOME="$(GFARM_HTTP_PLAYWRIGHT_CACHE_HOME)" "$(GFARM_HTTP_GATEWAY_DIR)/server/e2e-test/test-http-gateway-docker-dist.sh" --clean-cache
