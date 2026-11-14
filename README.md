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

`test-api-coverage` runs one Go OpenAPI request test to record CLI requests, then directly runs the same `npm run e2e:chromium` suite as `make -C server test-playwright` to record Web UI requests. `test-unit-all` runs `client test-coverage` and then the complete `test-api-coverage` target. The focused Go request test is repeated once to collect CLI request evidence; the Playwright suite runs once.

The Go coverage target selects tests named with the `TestAPI` and `TestUnit` prefixes. Keep new Go tests in one of these categories so `test-unit-all` includes them. To run the complete Go suite without category filtering, use `make -C client test-contract`.

Prerequisites:

- Node.js and project setup:
  - If Node.js 26 is already installed, activate it (for example, `nvm use 26`) and run `make -C server setup-latest`. This target uses `INSTALL_SYS_PACKAGES=0`; it creates the Python environment and runs `npm ci` plus the frontend build, but does not install Node.js.
  - If Node.js 26 and system packages are needed, run `make -C server setup-latest-with-sys-packages`. This sets `INSTALL_SYS_PACKAGES=1`, installs Node.js 26 through nvm, and performs the Python and frontend setup. Activate Node.js 26 in your shell with `nvm use 26` before running `make ci`.
- Install Playwright Chromium with `make -C server setup-playwright`.

GitHub Actions runs `make ci` after installing these prerequisites. Run the same checks locally with `make ci`; Playwright uses CI mode with one worker in both environments. Direct `make test-unit-all` calls preserve the caller's CI setting.

GitHub Actions also runs a real-Gfarm integration job in parallel with `make ci`:

- Checkout: Gfarm branch `feature/docker-dist-gfarm-http-gateway` under `gfarm/`; this repository under `gfarm/gfarm-http-gateway/`.
- Services: Start the `docker/dist` Gfarm, Keycloak, JWT Server, and Gateway.
- Test: Run the same `make -C docker/dist/http-gateway test` command used locally.
- Failure logs: Upload service logs when the integration job fails.
- After the Gfarm work branch is merged, switch the workflow checkout to the default branch.

Run only the local lint checks with `make lint`: Go formatting and `go vet`, Python `flake8`, and React source ESLint.

### Run one test while developing

| Component | Run from | Command |
| --- | --- | --- |
| Go client | `client/` | `go test ./cmd/gfarm-http -run '^TestAPIChmodUsesPut$' -v` |
| Server Python | `server/` | `./bin/gfarm-http-gateway-test.sh api/test/test_api_route_coverage.py -k test_analyze_coverage_counts_operations_parameters_and_values_per_client` |
| Web UI | `server/frontend/app/react-app/` | `npm run e2e:chromium -- tests/download.test.js` |

### Test against a real Gfarm

The real Gfarm tests are separate from `test-unit-all`:

- CLI through a configured Gateway: Run `make -C client test`. Configure `GFARM_HTTP_URL` and authentication, and ensure `/tmp` exists in Gfarm.
- CLI and Web UI through the docker/dist Gateway: Set `GFARM_HTTP_TEST_PASSWORD` for the Keycloak test user, then run `make -C ../docker/dist/http-gateway test` from this repository root.
- One docker/dist Web UI case: list titles with `make -C ../docker/dist/http-gateway list-webui-cases`, then set `GFARM_HTTP_WEBUI_CASE` to one exact title and run `make -C ../docker/dist/http-gateway test-webui`.

The docker/dist stack must already be prepared. The full test creates and removes temporary Gfarm test data and refreshes c1's `jwt-agent`; a selected Web UI test reuses a valid agent credential when possible. See `docker/dist/http-gateway/README.md` in the Gfarm checkout for setup and operational details.

### Run a component test suite

- Server Python tests: `make -C server test-unit`.
- Complete Go test suite with OpenAPI request checks: `make -C client test-contract`.
- Go client statement coverage: `make -C client test-coverage`.
- CLI and Web UI API coverage: `make test-api-coverage` from the repository root.
- Go, Python, and React source lint: `make lint` from the repository root.
