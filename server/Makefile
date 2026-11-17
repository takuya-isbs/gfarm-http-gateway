test: test-unit test-flake8 test-unit-webui-chromium

test-all: test-unit test-flake8 test-unit-webui-chromium test-client

.PHONY: test test-all test-unit-webui-chromium test-unit-webui-all lint lint-python lint-frontend test-flake8

lint: lint-python lint-frontend

lint-python: test-flake8

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

test-flake8:
	./venv/bin/flake8 api

test-unit-webui-chromium:
	npm --prefix frontend/app/react-app run test:unit-webui:chromium

test-unit-webui-all:
	npm --prefix frontend/app/react-app run test:unit-webui:all

setup setup-freezed:
	INSTALL_SYS_PACKAGES=0 ./setup.sh

setup-with-sys-packages:
	INSTALL_SYS_PACKAGES=1 ./setup.sh

setup-latest:
	INSTALL_SYS_PACKAGES=0 ./setup.sh requirements_dev.txt

setup-latest-with-sys-packages:
	INSTALL_SYS_PACKAGES=1 ./setup.sh requirements_dev.txt

setup-playwright:
	npx --prefix frontend/app/react-app playwright install --with-deps chromium

setup-playwright-all:
	npx --prefix frontend/app/react-app playwright install --with-deps

freeze:
	./venv/bin/pip3 freeze > requirements.txt

clear-venv:
	rm -rf ./venv
