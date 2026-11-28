test: test-unit lint-python test-unit-webui-chromium test-unit-webui-firefox

test-all: test-unit lint-python test-unit-webui-chromium test-unit-webui-firefox test-client

.PHONY: test test-all test-unit-webui-chromium test-unit-webui-firefox test-unit-webui-webkit test-unit-webui-all lint lint-python lint-frontend test-ruff test-mypy

lint: lint-python lint-frontend

lint-python: test-ruff test-mypy

lint-frontend:
	npm --prefix frontend/app/react-app run lint

PYTEST_COV = --cov=api --cov-branch --cov-report=term

test-unit:
	./bin/gfarm-http-gateway-test.sh $(PYTEST_COV)

test-coverage:
	./bin/gfarm-http-gateway-test.sh \
		--cov=api --cov-branch --cov-report=term-missing

test-unit-verbose test-unit-v:
	./bin/gfarm-http-gateway-test.sh -s $(PYTEST_COV)

test-client:
	../client/test/gfarm-http-test.sh /tmp

test-ruff:
	./venv/bin/ruff check api

test-mypy:
	./venv/bin/mypy api

test-unit-webui-chromium:
	npm --prefix frontend/app/react-app run test:unit-webui:chromium

test-unit-webui-firefox:
	npm --prefix frontend/app/react-app run test:unit-webui:firefox

test-unit-webui-webkit:
	npm --prefix frontend/app/react-app run test:unit-webui:webkit

test-unit-webui-all:
	npm --prefix frontend/app/react-app run test:unit-webui:all

setup setup-freezed:
	INSTALL_SYS_PACKAGES=0 ./setup.sh

setup-with-sys-packages:
	INSTALL_SYS_PACKAGES=1 ./setup.sh

setup-latest:
	INSTALL_SYS_PACKAGES=0 ./setup.sh requirements-latest.txt

setup-latest-with-sys-packages:
	INSTALL_SYS_PACKAGES=1 ./setup.sh requirements-latest.txt

setup-dev:
	./venv/bin/pip3 install --upgrade -r requirements-dev.txt

setup-playwright:
	npx --prefix frontend/app/react-app playwright install --with-deps chromium

setup-playwright-all:
	npx --prefix frontend/app/react-app playwright install --with-deps

setup-latest-freeze:
	$(MAKE) clear-venv
	$(MAKE) setup-latest
	./venv/bin/pip3 freeze > requirements.txt

clear-venv:
	rm -rf ./venv
