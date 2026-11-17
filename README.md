# gfarm-http-gateway

**HTTP gateway / Web UI / CLI** for the [Gfarm File System](https://github.com/oss-tsukuba/gfarm).  
gfarm-http-gateway runs **Gfarm client tools on the server side** and exposes them via a REST API and Web UI.  
Users can access Gfarm from a browser or with the provided CLI **without installing the Gfarm client locally**.  
Authentication is handled via **OpenID Connect (OIDC)** (with optional SASL for controlled environments).

This repository contains two components:
- **server** (`server/`) - FastAPI-based HTTP API gateway with a built-in Web UI; executes Gfarm client commands under the hood
- **client** (`client/`) - command-line tools that call the gfarm-http-gateway API

## Features

- **Web API**
  - **OIDC authentication**: IdP redirect, access token acquisition/verification, refresh token rotation
  - **Gfarm authentication**: authenticate to Gfarm using the access token
  - **`gf*` command execution**: `gfwhoami`, `gfls`, `gfmkdir`, `gfrmdir`, `gfln`, `gfstat`, `gfreg`, `gfmv`, `gfrm`, `gfexport`, `gfgetfacl`, `gfsetfacl`, `gfchmod`, `gfptar`
  - **Web UI hosting**

- **Web UI**
  - **File manager**: browse, rename, move, delete files; browse, create, rename, move, delete directories
  - **Upload/Download**: transfer files and directories
  - **Archive management**: create/extract archives on Gfarm using `gfptar`
  - **Permissions & ACL**: view and edit access control
  - **Details**: inspect metadata and properties

## Related Documents (Component READMEs)

For setup, configuration, and detailed usage, see:

- **Server:** [server/README.md](./server/README.md) - startup, configuration  
- **Client:** [client/README.md](./client/README.md) - usage

## Development tests

Run the Gfarm-independent test suites and coverage reports from the repository root:

```sh
make test-unit-all
```

This runs the server Python tests and coverage, Go client API/unit statement coverage, and CLI/Web UI OpenAPI request coverage. The Web UI tests use API mocks. No live Gfarm is required. OpenAPI coverage reports CLI, Web UI, and combined rates for operations, path/query parameters, and enum/boolean values; it lists missing items and fails below the checked-in baseline. API and code coverage remain separate metrics.

`test-api-coverage` runs one Go OpenAPI request test to record CLI requests, then directly runs the same API-mocked Chromium Playwright suite as `make -C server test-unit-webui-chromium` to record Web UI requests. `test-unit-all` runs `client test-coverage` and then the complete `test-api-coverage` target. The focused Go request test is repeated once to collect CLI request evidence; the Playwright suite runs once.

The Go coverage target selects tests named with the `TestAPI` and `TestUnit` prefixes. Keep new Go tests in one of these categories so `test-unit-all` includes them. To run the complete Go suite without category filtering, use `make -C client test-contract`.

Prerequisites:

- Node.js and project setup:
  - If Node.js 26 is already installed, activate it (for example, `nvm use 26`) and run `make -C server setup-latest`. This target uses `INSTALL_SYS_PACKAGES=0`; it creates the Python environment and runs `npm ci` plus the frontend build, but does not install Node.js.
  - If Node.js 26 and system packages are needed, run `make -C server setup-latest-with-sys-packages`. This sets `INSTALL_SYS_PACKAGES=1`, installs Node.js 26 through nvm, and performs the Python and frontend setup. Activate Node.js 26 in your shell with `nvm use 26` before running `make ci`.
- Install Playwright Chromium with `make -C server setup-playwright`.

GitHub Actions runs `make ci` after installing these prerequisites. Run the same checks locally with `make ci`; Playwright uses CI mode with one worker in both environments. Direct `make test-unit-all` calls preserve the caller's CI setting.

GitHub Actions also runs a real-Gfarm E2E job in parallel with `make ci`:

- Checkout: Gfarm branch `feature/docker-dist-gfarm-http-gateway` under `gfarm/`; this repository under `gfarm/gfarm-http-gateway/`.
- Services: Start the `docker/dist` Gfarm, Keycloak, JWT Server, and `gfarm-http-gateway`.
- Test: Run the same `make -C docker/dist/http-gateway test-e2e` command used locally.
- Failure logs: Upload service logs when the integration job fails.
- After the Gfarm work branch is merged, switch the workflow checkout to the default branch.

Run only the local lint checks with `make lint`: Go formatting and `go vet`, Python `flake8`, React source ESLint, and ESLint/Prettier for JavaScript test files and their Playwright configuration.

### Run one test while developing

| Component | Run from | Command |
| --- | --- | --- |
| Go client | `client/` | `go test ./cmd/gfarm-http -run '^TestAPIChmodUsesPut$' -v` |
| Server Python | `server/` | `./bin/gfarm-http-gateway-test.sh api/test/test_api_route_coverage.py -k test_analyze_coverage_counts_operations_parameters_and_values_per_client` |
| Web UI | `server/frontend/app/react-app/` | `npm run test:unit-webui:chromium -- tests/download.test.js` |

### Test against a real Gfarm

These checks use a real Gfarm. (The Web UI suite in `make test-unit-all` uses API mocks and does not require a live Gfarm.)

Before running the full suite or a single docker/dist Web UI case, build and start the services by following `docker/dist/http-gateway/README.md` in the Gfarm checkout.

> **Important:** Every `make test-e2e` run stops c1's existing `jwt-agent`, obtains a new passphrase from the JWT Server, and starts the agent again with it.

- Gfarm client command (`gfarm-http`) through a configured `gfarm-http-gateway`: Configure `GFARM_HTTP_URL` and authentication, ensure `/tmp` exists in Gfarm, then run `make -C client test`. It removes its unique test directory on exit.
- Full docker/dist suite: Run from this repository root with the Keycloak test user's password:

  ```sh
  GFARM_HTTP_TEST_PASSWORD=... make -C ../docker/dist/http-gateway test-e2e
  ```

- Python version matrix: Run the Web UI and CLI suites through `http-gw-https`, then CLI suites against Python 3.11 and 3.15:

  ```sh
  GFARM_HTTP_TEST_PASSWORD=... make -C ../docker/dist/http-gateway test-e2e-matrix
  ```

  It prints each suite's result and elapsed time and writes detailed output to `test-e2e-matrix.log` in the current directory. It asks before overwriting an existing log.

- One docker/dist Web UI case:
  - List case titles with `make -C ../docker/dist/http-gateway list-webui-cases`. Listing does not require the docker/dist services or a password.
  - Run one listed title with the Keycloak test user's password:

    ```sh
    GFARM_HTTP_TEST_PASSWORD=... \
    GFARM_HTTP_WEBUI_CASE='<exact title from the list>' \
    make -C ../docker/dist/http-gateway test-webui
    ```

    This runs only the selected Web UI case.
- Cache cleanup: Run `make -C ../docker/dist/http-gateway clean-test-cache` to remove the per-user Playwright dependency cache.

A single Web UI case reuses a valid credential or refreshes it if needed. Each test run removes its unique temporary Gfarm directory. Runner implementation and fixture details are in `server/e2e-test/test-http-gateway-docker-dist.sh`; matrix orchestration is in `server/e2e-test/test-http-gateway-docker-dist-matrix.sh`.

### Run a component test suite

- Server Python tests: `make -C server test-unit`.
- Complete Go test suite with OpenAPI request checks: `make -C client test-contract`.
- Go client statement coverage: `make -C client test-coverage`.
- CLI and Web UI API coverage: `make test-api-coverage` from the repository root.
- Go, Python, React source, and JavaScript test lint: `make lint` from the repository root.
