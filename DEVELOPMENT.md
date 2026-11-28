# Development

## Run a source development server on docker/dist c2

Use this setup to run the checkout directly on c2 with debug logging and automatic reload, without building the Docker image.

- Gfarm cluster and JWT Server setup: Follow `docker/dist/README.md` in the Gfarm checkout.
- Web UI login on c2: See [Configure authentication and access the Web UI](#configure-authentication-and-access-the-web-ui).
- Clone this repository into the Gfarm source checkout if needed:

  ```sh
  cd (Gfarm source checkout)
  git clone https://github.com/oss-tsukuba/gfarm-http-gateway.git
  ```

- From the Docker host, run `make` in `docker/dist` to enter c1, then run `ssh c2` there.
- Install development dependencies on c2:

  ```sh
  cd ~/gfarm/gfarm-http-gateway/server
  make setup-latest-with-sys-packages
  make setup-dev
  ```

  This installs Python 3.12+, Node.js 26 via nvm, and the Redis server package.
- Start Redis and confirm it is ready:

  ```sh
  redis-server ./redis-for-docker-dist.conf
  redis-cli -h 127.0.0.1 -p 6379 ping  # PONG
  ```

  Stop Redis with `redis-cli -h 127.0.0.1 -p 6379 shutdown`.
- Start the development server from `server/`:

  ```sh
  bin/gfarm-http-gateway-dev-for-docker-dist.sh --port 8000
  ```

  The script selects `server/gfarm2.conf-for-docker-dist` relative to itself and exits if the file is missing, so it cannot fall back to the runtime user's `~/.gfarm2rc`.
- To use c3, repeat the dependency and Redis setup there before starting the server.

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
  - If Node.js 26 is already installed, activate it (for example, `nvm use 26`) and run `make -C server setup-latest` followed by `make -C server setup-dev`. This target uses `INSTALL_SYS_PACKAGES=0`; it creates the Python environment, installs runtime and dev/test tools, and runs `npm ci` plus the frontend build, but does not install Node.js.
  - If Node.js 26 and system packages are needed, run `make -C server setup-latest-with-sys-packages` followed by `make -C server setup-dev`. This sets `INSTALL_SYS_PACKAGES=1`, installs Node.js 26 through nvm, and performs the Python and frontend setup. Activate Node.js 26 in your shell with `nvm use 26` before running `make ci`.
- Install Playwright Chromium with `make -C server setup-playwright`.

GitHub Actions runs `make ci` after installing these prerequisites. Run the same checks locally with `make ci`; Playwright uses CI mode with one worker in both environments. Direct `make test-unit-all` calls preserve the caller's CI setting.

GitHub Actions also runs a real-Gfarm E2E job in parallel with `make ci`:

- Checkout: Gfarm branch `feature/docker-dist-gfarm-http-gateway` under `gfarm/`; this repository under `gfarm/gfarm-http-gateway/`.
- Services: Start the `docker/dist` Gfarm, Keycloak, JWT Server, and `gfarm-http-gateway`.
- Test: Run the same `make -C docker/dist/http-gateway test-e2e` command used locally.
- Failure logs: Upload service logs when the integration job fails.
- After the Gfarm work branch is merged, switch the workflow checkout to the default branch.

Run only the local lint checks with `make lint`: Go formatting and `go vet`, Python `ruff` and `mypy`, React source ESLint, and ESLint/Prettier for JavaScript test files and their Playwright configuration.

### Run one test while developing

| Component | Run from | Command |
| --- | --- | --- |
| Go client | `client/` | `go test ./cmd/gfarm-http -run '^TestAPIChmodUsesPut$' -v` |
| Server Python | `server/` | `./bin/gfarm-http-gateway-test.sh api/test/test_api_route_coverage.py -k test_analyze_coverage_counts_operations_parameters_and_values_per_client` |
| Web UI | `server/frontend/app/react-app/` | `npm run test:unit-webui:chromium -- tests/download.test.js` |

### Test against a real Gfarm

These checks use a real Gfarm. (The Web UI suite in `make test-unit-all` uses API mocks and does not require a live Gfarm.)

For React app npm package updates and their verification steps, see the
[dependency update procedure in `server/README.md`](server/README.md#to-update-react-app-dependencies).

> **Important:** Every `make test-e2e` run stops c1's existing `jwt-agent`, obtains a new passphrase from the JWT Server, and starts the agent again with it.

Before running the full suite, the matrix, or a single Web UI case:

1. Initialize the Gfarm cluster and start Keycloak and the JWT Server. Follow “Explore on virtual clusters” and “For OAuth authentication” in the Gfarm checkout's `docker/dist/README.md`.
2. From this repository root on the Docker host, prepare the Gfarm CA certificates and start the Compose services:

   ```sh
   make -C ../docker/dist/http-gateway setup
   make -C ../docker/dist/http-gateway up
   ```

   If the services are already configured and running, reuse them. For Redis configuration, certificate setup, or restarting the stack, see “Run with Docker Compose” in the Gfarm checkout's `docker/dist/http-gateway/README.md`.
3. Choose a test command below.

- Gfarm client command (`gfarm-http`) through a configured `gfarm-http-gateway`: Configure `GFARM_HTTP_URL` and authentication, ensure `/tmp` exists in Gfarm, then run `make -C client test`. It removes its unique test directory on exit.
- Full docker/dist suite: Run from this repository root with the Keycloak test user's password:

  ```sh
  GFARM_HTTP_TEST_PASSWORD=... make -C ../docker/dist/http-gateway test-e2e
  ```

- Python version matrix: Run the Web UI and CLI suites through `http-gw-https`, then CLI suites against Python 3.11 and 3.15:

  ```sh
  GFARM_HTTP_TEST_PASSWORD=... make -C ../docker/dist/http-gateway test-e2e-matrix
  ```

  Python versions and source checksums are managed in `server/python-versions.env` and shared by the Dockerfile, Compose, and Bake definitions.

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

## docker/dist test settings

These settings adapt the test runner to the docker/dist layout. Defaults for the docker/dist layout are in `docker/dist/http-gateway/Makefile` in the Gfarm checkout.

| Variable | Purpose |
|---|---|
| `GFARM_HTTP_TEST_PASSWORD` | Keycloak `user1` password required by the E2E suite. See “For OAuth authentication” in the Gfarm checkout’s `docker/dist/README.md` and `docker/dist/init-jwt.sh`. |
| `DOCKER_DIST_USER` | c1 user that runs `jwt-agent` (same as the `login` target) |
| `DOCKER_DIST_CLIENT` | Container that runs the Gfarm client and `jwt-agent` |
| `DOCKER_DIST_NETWORK` | Compose network used by the test containers |
| `DOCKER_DIST_CHECKOUT_ROOT` | docker/dist checkout path inside the client container |
| `DOCKER_DIST_WORKDIR` | docker/dist working directory inside the client container |
| `GFARM_HTTP_GATEWAY_DIR` | Path to the `gfarm-http-gateway` checkout |
| `GFARM_HTTP_GATEWAY_URL` | `http-gw` URL reachable from docker/dist and test containers |
| `JWT_SERVER_URL` | JWT Server URL used by the test login and `jwt-agent` |

## Common procedures

### Configure authentication and access the Web UI

The Compose `http-gw` HTTP and HTTPS redirect patterns are applied to the `hpci-pub` client by `make init`; their values are in `docker/dist/jwt-server/setup-keycloak/keycloak-config.yaml`. The login callback uses the `http-gw` `/` endpoint by default. After OIDC logout, the identity provider returns the browser to the `http-gw` `/logout` endpoint; `http-gw` adds a changing `state` query parameter and then clears its local session.

For a browser outside the Docker environment, configure its HTTP proxy by following “Use http proxy instead of remote desktop” in the Gfarm checkout’s `docker/dist/README.md`. A browser in the remote desktop environment does not need this proxy setting.

1. For a non-Compose URL such as c2, open the Keycloak admin console at `https://keycloak:8443/auth/admin/master/console/#/HPCI/` and log in (`admin/admin` in the docker/dist example).
2. Select the **HPCI** realm, open **Clients**, and edit **`hpci-pub`**.
3. Add the URL's Redirect URI pattern to both **Valid Redirect URIs** and **Valid Post Logout Redirect URIs**, then save.
4. Open the corresponding URL in a browser, click **Login**, then sign in as `user1` with the password described in “For OAuth authentication” in the Gfarm checkout’s `docker/dist/README.md` when redirected to Keycloak. The landing page includes API usage examples.

For the c2 source development server, use `http://c2:8000/` and register `http://c2:8000/*` in both Keycloak URI fields.

The login flow is the same for Compose `http-gw` and the c2 development server; use the URL and matching Redirect URI pattern for your endpoint. The `/*` suffix permits paths below that host and port, including the login callback and `/logout`. These wildcard entries are for this isolated `docker/dist` test setup. For production, register the specific public callback and post-logout URIs instead of broad wildcard patterns.

### Use the command-line client from c1

1. Prepare OAuth authentication in c1 by following “For OAuth authentication” in the Gfarm checkout’s `docker/dist/README.md`. Run `jwt-agent` and `sh edconf.sh oauth2` as the same user that will run the client. The client reads the token saved for that user.
2. Build and install the client into the user's home directory:

   ```sh
   cd ~/gfarm/gfarm-http-gateway/client
   make
   make PREFIX="$HOME/.local" install
   export PATH="$HOME/.local/bin:$PATH"
   ```

3. Set `GFARM_HTTP_URL` to the `http-gw` instance you want to use, then run read-only commands:

   ```sh
   # Docker Compose http-gw
   export GFARM_HTTP_URL=http://http-gw:8000
   # Or, development server on c2
   # export GFARM_HTTP_URL=http://c2:8000

   gfarm-http whoami
   gfarm-http ls -la /
   ```

   The Compose hostname is available to c1 on `gfarm_net`. Uncomment the c2 URL instead when using the development server.

4. To use the built client without installing it, run it from the checkout:

   ```sh
   cd ~/gfarm/gfarm-http-gateway/client
   make
   export GFARM_HTTP_URL=http://http-gw:8000
   # Or, for the development server on c2:
   # export GFARM_HTTP_URL=http://c2:8000
   ./gfarm-http whoami
   ./gfarm-http ls -la /
   ```

The installed and checkout-based commands were tested in c1 against Compose `http-gw`; `whoami` returned `user1` and the root listing succeeded. The c2 URL is the alternative when using the development server.
