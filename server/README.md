# Set up gfarm-http-gateway

## Prerequisites

To run gfarm-http-gateway, you need:
- **Gfarm server** with SASL XOAUTH2 enabled
  - See: <http://oss-tsukuba.org/gfarm/share/doc/gfarm/html/en/user/auth-sasl.html>
- **OpenID Connect provider** (e.g., Keycloak) with client ID, secret, and valid redirect URIs


## Configuration variables

### Gfarm username for OpenID Connect login

On the login page, you can optionally enter the Gfarm account name to use for
Gfarm SASL authentication. This may be a group representative configured with
`xoauth2_group_user`. When specified, this name takes precedence over the
username from the OpenID Connect token claim. If it is left empty, the token
claim is used as before.

When using `xoauth2_group_user`, configure the mapping in the SASL
configuration on the Gfarm servers (`gfmd` and `gfsd`). Restart `gfmd` and
all relevant `gfsd` processes after changing the configuration. See the
[cyrus-sasl-xoauth2-idp configuration guide](https://github.com/oss-tsukuba/cyrus-sasl-xoauth2-idp/blob/feature/keycloak/doc/configuration.md#xoauth2_group_user-optional)
for the server-side setting.

### gfarm-http-gateway
`gfarm-http-gateway.conf` is required to run gfarm-http-gateway.  
Default values are defined in [`gfarm-http-gateway.conf.default`](./gfarm-http-gateway.conf.default).

The configuration file is organized into the following sections:

- **Basic** - Basic settings (Gfarm config, CORS, temp directory)
- **Sessions** - Session management and security
- **Authentication** - TLS and SASL authentication
- **OpenID Connect** - OIDC and Keycloak settings  
- **Tokens** - Token verification and validation
- **Database (Redis)** - Refresh token storage settings
- **Performance** - Performance-related settings
- **Logging** - Local log file output and rotation settings
- **Development & Debug** - Debug settings (keep defaults for production)

#### How to configure

1. Copy the template file

```bash
cp gfarm-http-gateway.conf.default gfarm-http-gateway.conf
```

2. Edit gfarm-http-gateway.conf and update variables for your environment


### Redis

gfarm-http-gateway uses **Redis as a Token Store**.  
Create a working copy and edit as needed:

```bash
cp redis.conf.sample ./redis/redis.conf
```

> NOTE: Keep Redis TLS settings consistent with `gfarm-http-gateway.conf` (Database (Redis) section).


## Quick Start (example using Docker)

Choose one of the following options depending on your environment.

- **Option 1: Run with Docker** - single container, HTTP only.
- **Option 2: Run Behind NGINX (HTTPS)** - recommended for production (TLS at NGINX).
- **Option 3: Run Under a Subpath** - host gfarm-http-gateway at a URL prefix (e.g., `/gfarm`).

> NOTE: If your account is in the `docker` group, run Docker/Compose commands without root; otherwise use `sudo`.  
> With **rootless Docker**, privileged ports (<1024) can't be bound (e.g., `-p 443:443`); use high ports or a reverse proxy instead.


### Requirements

- Docker (23.0 or later)
- Docker Compose (for Option 2 and Option 3)

### Option 1: Run with Docker

> NOTE: This example uses HTTP and is not recommended for production use.  
> For secure deployments, place gfarm-http-gateway behind a reverse proxy with HTTPS enabled.

#### 1. Build the Docker Image

```bash
git clone https://github.com/oss-tsukuba/gfarm-http-gateway.git
cd gfarm-http-gateway/server
docker build -t gfarm-http-gateway .
```

#### 2. Prepare Configuration

Create directories and files in your current working directory:
```
config/
├── gfarm2.conf              # Gfarm client configuration (required)
├── gfarm-http-gateway.conf  # Gateway configuration (required)
├── certs/                   # Gfarm CA certificates (required)
└── dev_ca.crt               # (Optional) Custom CA certificate (for development)

redis/
├── redis.conf               # Redis configuration (required)
└── certs/                   # (Optional) certificates for TLS settings
```

- gfarm-http-gateway.conf
  - Refer to **[Configuration variables > gfarm-http-gateway](#gfarm-http-gateway)** above
- redis.conf
  - Refer to **[Configuration variables > Redis](#redis)** above
- gfarm2.conf
  - Configure the Gfarm client to use SASL only. For example:

    ```text
    auth enable sasl *
    auth disable sasl_auth *
    auth disable gsi *
    auth disable gsi_auth *
    auth disable tls_sharedsecret *
    auth disable tls_client_certificate *
    auth disable kerberos *
    auth disable kerberos_auth *
    auth disable sharedsecret *
    ```

  - Do not set `sasl_mechanisms` or `sasl_user` in `gfarm2.conf`; the gateway
    sets the SASL mechanism and user for each request.

#### 3. Run the Redis container

```bash
docker network create gfarm-net

docker run -d --name gfarm-redis --network gfarm-net \
  -v $(pwd)/redis/redis.conf:/config/redis.conf:ro \
  -v redis-data:/data \
  redis \
  redis-server /config/redis.conf
```
> NOTE: To create the volume, run `docker volume create redis-data` once.
> If you bind-mount a host dir instead, ensure it's writable by the Redis user (`chown` to the Redis UID/GID).

#### 4. Run the gfarm-http-gateway container

```bash
docker run --rm --network gfarm-net \
  -v $(pwd)/config:/config \
  -p 127.0.0.1:8000:8000 \
  gfarm-http-gateway --host 0.0.0.0
```

By default, **gfarm-http-gateway** listens on port 8000 inside the container.  
To change ports:
```bash
docker run --rm --network gfarm-net \
  -v $(pwd)/config:/config \
  -p 127.0.0.1:8080:8080 \
  gfarm-http-gateway --host 0.0.0.0 --port 8080
```

> NOTE:  
> Port binding:  
> - `-p 127.0.0.1:8000:8000` - bind to localhost only
> - `-p 192.168.1.100:8000:8000` - bind to a specific host IP
> - `-p 8000:8000` - bind to all interfaces
>   - Prohibited for production use (exposes unencrypted HTTP to all network clients).
>
> `--host 0.0.0.0`:  
> This makes gfarm-http-gateway listen on all interfaces inside the container. Which interfaces are exposed externally is then controlled by the -p option above.

#### 5. Stop containers

To stop gfarm-http-gateway, press `Ctrl + C` if it's running in the foreground.  
If you ran it in the background (with `-d`), stop it with:

```bash
docker ps            # find the container ID or name
docker stop <id-or-name>
```


### Option 2: Run Behind NGINX (HTTPS)

Use NGINX as a reverse proxy. This example uses Docker Compose.

#### 1. Fetch gfarm-http-gateway

```bash
git clone https://github.com/oss-tsukuba/gfarm-http-gateway.git
cd gfarm-http-gateway/server
```

#### 2. Prepare Configuration

Follow **[Option 1 > 2. Prepare Configuration](#2-prepare-configuration)** for `config/`.  

Place the TLS certificate and key files for NGINX (used for HTTPS termination), e.g.:
```bash
nginx/certs/
├── cert.pem   # your server certificate
└── key.pem    # your private key
```

> NOTE: These are different from the **Gfarm CA certificates** in `config/certs/`.
>
> - `config/certs/` → for gfarm-http-gateway to trust Gfarm
> - `nginx/certs/` → for NGINX to serve HTTPS to clients

Copy samples and edit:
```bash
cp docker-compose.yaml.sample docker-compose.yaml
cp nginx.conf.sample ./nginx/gfarm.conf
```

Edit `docker-compose.yaml`:
- Set `--forwarded-allow-ips` to the gfarm-http-gateway container command, e.g.:
  - `command: --host 0.0.0.0 --port 8000 --forwarded-allow-ips '<REVERSE_PROXY_IP>'`
- Mount Redis files to Redis container, e.g.:
  - `./redis/redis.conf:/config/redis.conf:ro`
- Mount NGINX files to NGINX container, e.g.:
  - `./nginx/gfarm.conf:/etc/nginx/conf.d/gfarm.conf:ro`
  - `./nginx/certs:/etc/nginx/certs:ro`

> NOTE: `<REVERSE_PROXY_IP>`  
> IP address(es) of all proxies that adds `X-Forwarded-*` headers to the request.
> - Single tier: specify that one IP
> - Multiple tiers: list them comma-separated, e.g., `10.0.0.5,172.22.0.10`
> If gfarm-http-gateway is never reachable directly (e.g., docker network only), you may use `'*'` (ensure gfarm-http-gateway port is not exposed).

Edit `nginx/gfarm.conf`:
- Point TLS to your NGINX certificates, e.g.:
  - `ssl_certificate     /etc/nginx/certs/cert.pem;`
  - `ssl_certificate_key /etc/nginx/certs/key.pem;`

> NOTE: This example uses `redis.conf.sample` as a redis configuration file.  
> If you want to customize Redis settings, copy the sample file and mount the copy:
> ```
> cp ./redis.conf.sample ./redis/redis.conf
> # edit ./redis/redis.conf as you like (e.g., AOF settings)
> ```
> Update `docker-compose.yaml` to point at your copy:
> ```diff
>  services:
>  ...
>    redis:
>      volumes:
> -      - ./redis.conf.sample:/config/redis.conf:ro
> +      - ./redis/redis.conf:/config/redis.conf:ro
>        - redis-data:/data
> ```
>
> For detailed options and recommended values, consult the official Redis documentation and adjust settings to your requirements.

#### 3. Launch with Docker Compose

```bash
docker compose up -d
```

#### 4. Stop the Container

```bash
docker compose down
```

### Option 3: Run Under a Subpath

Serve gfarm-http-gateway under a URL prefix (e.g., `/gfarm/`).  
This is useful when you share a domain with other apps behind the same reverse proxy.

#### 1. Set up gfarm-http-gateway

Follow **[Option 1 > 1. Build the Docker Image and 2. Prepare Configuration](#1-build-the-docker-image)**.

(If you're using Docker Compose, instead follow **[Option 2 > 1. Fetch gfarm-http-gateway and 2. Prepare Configuration](#1-fetch-gfarm-http-gateway)**.)

#### 2. Start gfarm-http-gateway with a root path

- **Docker:**

```bash
  docker run --rm \
    -v $(pwd)/config:/config \
    -p 127.0.0.1:8000:8000 \
    gfarm-http-gateway --host 0.0.0.0 --port 8000 --root-path /gfarm
```

- **Docker Compose:** update command

  ```yaml
  services:
    gfarm-http-gateway:
      command: --host 0.0.0.0 --port 8000 --root-path /gfarm
  ```

> NOTE: `--root-path /gfarm` tells Uvicorn/FastAPI that the app lives under `/gfarm`.

If you use NGINX as a reverse proxy, add a `location /gfarm/` block that preserves `/gfarm` when forwarding:
```
...
  location /gfarm/ {
    ...
}
```

#### 3. Stop the container

- **Docker:**
```bash
docker ps            # find the container ID or name
docker stop <id-or-name>
```

- **Docker Compose:**
```bash
docker compose down
```


## HPCI Setup Example: with an alternative system

This example targets HPCI Shared Storage and uses Docker Compose. It runs two gfarm-http-gateway instances on one hostname (main at `/` and alternative at `/sub/`) each using a different IdP.
Adjust IPs/hostnames to your production environment.

This example uses the following files:

- **`docker-compose-for-HPCI-with-sub.yaml`**
- **`nginx-for-HPCI-with-sub.conf`** - referenced by `docker-compose-for-HPCI-with-sub.yaml`
- **`templates/login-idp-switch.html`** - referenced by `docker-compose-for-HPCI-with-sub.yaml`
- **`gfarm-http-gateway-for-HPCI.conf`** - referenced by `docker-compose-for-HPCI-with-sub.yaml`
- **`gfarm-http-gateway-for-HPCI-sub.conf`** - referenced by `docker-compose-for-HPCI-with-sub.yaml`
- **`redis.conf.sample`** - referenced by `docker-compose-for-HPCI-with-sub.yaml`

### Prepare Configuration

Create a working copy and edit as needed:

```bash
cp nginx-for-HPCI-with-sub.conf.sample ./nginx/nginx-for-HPCI-with-sub.conf
cp gfarm-http-gateway-for-HPCI.conf.sample ./config/gfarm-http-gateway-for-HPCI.conf
cp gfarm-http-gateway-for-HPCI-sub.conf.sample ./config/gfarm-http-gateway-for-HPCI-sub.conf
cp templates/login-idp-switch.html.sample ./templates/login-idp-switch.html
```

Run the following script to download HPCI-specific `gfarm2.conf` and CA certificate:
```bash
./download-HPCI-config.sh
```

Place the TLS certificate and key files for NGINX (used for HTTPS termination), e.g.:
```bash
nginx/certs/
├── cert.pem   # your server certificate
└── key.pem    # your private key
```

If you use an existing reverse proxy, remove the bundled `nginx-proxy` service from `docker-compose-for-HPCI-with-sub.yaml` and configure your proxy using `nginx-for-HPCI-with-sub.conf.sample` as a reference.

If you want to customize Redis settings, see the note in **[Option 2 > 2. Prepare Configuration](#2-prepare-configuration-1)**.

#### Production settings (required)

**`docker-compose-for-HPCI-with-sub.yaml`:**

- gfarm-http-gateway:
  - `command: --host 0.0.0.0 --port 8080 --forwarded-allow-ips '<REVERSE_PROXY_IP>'`
- gfarm-http-gateway-sub:
  - `command: --host 0.0.0.0 --port 8080 --root-path /sub --forwarded-allow-ips '<REVERSE_PROXY_IP>'`

> NOTE: `<REVERSE_PROXY_IP>`  
> Add all IP addresses of your reverse proxies, or use '*' (allow all).
> For details, see: [Quick Start > Option 2 > 2. Prepare Configuration](#2-prepare-configuration-1)

**`nginx/nginx-for-HPCI-with-sub.conf`:**

- `server_name`: your public FQDN

> NOTE: For detailed options and recommended values, consult the official NGINX documentation and adjust settings to your requirements.

**`templates/login-idp-switch.html`:**

- Set the login buttons to your real URLs:  
  - Main: `location.href='https://<YOUR_HOST>/login_oidc'`  
  - Alternative: `location.href='https://<YOUR_HOST>/sub/login_oidc'`

**`config/gfarm-http-gateway-for-HPCI*.conf`:**

**Edit `gfarm-http-gateway-for-HPCI.conf`:**

Edit the following two files:  
`gfarm-http-gateway-for-HPCI.conf` (main)  
`gfarm-http-gateway-for-HPCI-sub.conf` (alternative)

- **`GFARM_HTTP_SESSION_SECRET`** - set a strong, random secret.

  Generate a random value (~64 Base64 chars):
  ```bash
  python3 -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(48)).decode())"
  ```

  Then set it in the config (single line, quoted):
  ```conf
  GFARM_HTTP_SESSION_SECRET="PASTE_THE_RANDOM_STRING_HERE"
  ```

- **IdP redirect handling** - register the **gfarm-http-gateway host** at your IdP as an allowed redirect URI, and **leave the override empty** so the app uses the reverse-proxied URL:

  ```conf
  GFARM_HTTP_OIDC_OVERRIDE_REDIRECT_URI=
  ```


### Start gfarm-http-gateway with an alternative system

#### 1. Launch with Docker Compose

```bash
docker compose -f docker-compose-for-HPCI-with-sub.yaml up -d --build
```

#### 2. Stop the containers

```bash
docker compose -f docker-compose-for-HPCI-with-sub.yaml down
```


### For development (HTTP)

This variant is for local development and experiments. It runs two gfarm-http-gateway instances on a single host (main at `/main/`, alternative at `/sub/`) and uses HTTP. **Do not expose this setup to the Internet.**

This example uses the following files:

- **`docker-compose-for-HPCI-dev-with-sub.yaml`**
- **`nginx-for-HPCI-dev-with-sub.conf`** - referenced by `docker-compose-for-HPCI-dev-with-sub.yaml`
- **`templates/login-idp-switch-dev.html`** - referenced by `docker-compose-for-HPCI-dev-with-sub.yaml`
- **`gfarm-http-gateway-for-HPCI-dev.conf`** - referenced by `docker-compose-for-HPCI-dev-with-sub.yaml`
- **`gfarm-http-gateway-for-HPCI-dev-sub.conf`** - referenced by `docker-compose-for-HPCI-dev-with-sub.yaml`
- **`redis.conf.sample`** - referenced by `docker-compose-for-HPCI-dev-with-sub.yaml`

#### Start gfarm-http-gateway with an alternative system

See [Start gfarm-http-gateway with an alternative system](#start-gfarm-http-gateway-with-an-alternative-system) and run Docker Compose with `docker-compose-for-HPCI-dev-with-sub.yaml`.

- **After login:** In this example you **always** access the gateway via a subpath. The IdP redirects to `http://localhost:8080/` with the access token. You must append the required subpath **after** `http://localhost:8080/` (e.g., `http://localhost:8080/main/...`, `http://localhost:8080/sub/...`) so that the subpath instance of gfarm-http-gateway picks up the token. If you land on `/` and see a 404, just add the subpath; you don’t need to sign in again.


## Update gfarm-http-gateway and Gfarm client with Docker

### Update gfarm-http-gateway

#### Git pull then Docker build

```bash
# Update gfarm-http-gateway repository
git pull

# Rebuild 
# (Docker)
docker build -t gfarm-http-gateway:latest .
# or (Docker Compose)
docker compose build
```

> NOTE: If you need a clean rebuild ignoring cache, add `--no-cache`:  
> `docker build --no-cache -t gfarm-http-gateway:latest .` or `docker compose build --no-cache`.

### Update Gfarm client on gfarm-http-gateway

#### Build with a released version

```bash
docker build \
  --build-arg GFARM_VER=2.8.8 \
  -t gfarm-http-gateway:gfarm-2.8.8 .
```

#### Build from Git repository

```bash
docker build \
  --build-arg GFARM_SRC_URL='' \
  --build-arg GFARM_SRC_GIT_URL='https://github.com/oss-tsukuba/gfarm.git' \
  --build-arg GFARM_SRC_GIT_BRANCH='2.8' \
  -t gfarm-http-gateway:gfarm-2.8-src .
```

#### Build from a local source tree

```bash
docker build \
  --build-arg GFARM_SRC_LOCAL='./vendor/gfarm' \
  --build-arg GFARM_SRC_URL='' \
  --build-arg GFARM_SRC_GIT_URL='' \
  -t gfarm-http-gateway:gfarm-local .
```

#### Using Docker Compose

```yaml
services:
  gfarm-http-gateway:
    build:
      context: .
      args:
        # use a released version
        GFARM_VER: "2.8.8"

        # build from Git repository (leave GFARM_SRC_URL empty)
        # GFARM_SRC_URL: ""
        # GFARM_SRC_GIT_URL: "https://github.com/oss-tsukuba/gfarm.git"
        # GFARM_SRC_GIT_BRANCH: "2.8"
        
        # build from a local source tree (leave GFARM_SRC_URL and GFARM_SRC_GIT_URL empty)
        # GFARM_SRC_LOCAL: ./vendor/gfarm
        # GFARM_SRC_URL: ""
        # GFARM_SRC_GIT_URL: ""
```

### Restart the container

Restart after rebuilding:

```bash
# Docker
docker stop <container_id_or_name>
docker run --rm ...   # run again with your original args

# Docker Compose
docker compose down
docker compose up -d
```

## Manual Installation (example without Docker)

### Requirements

- Gfarm (clients) 2.8.8 or later
- Python 3.12 or later
- venv (python3-venv)
- GNU Make
- Node.js v22 or later
- Redis 7 or later

### Set up the environment

- **Gfarm server environment**
  - Configure SASL XOAUTH2 on the gfarm server.
  - In `$(pkg-config --variable=libdir libsasl2)/sasl2/gfarm.conf`:
    - `mech_list: XOAUTH2`  
  - See also: [http://oss-tsukuba.org/gfarm/share/doc/gfarm/html/en/user/auth-sasl.html](http://oss-tsukuba.org/gfarm/share/doc/gfarm/html/en/user/auth-sasl.html)

- **Gfarm client environment on gfarm-http-gateway**
  - Prepare the Gfarm environment **on the same host where gfarm-http-gateway runs**.
  - Ensure `gf*` commands and a valid `gfarm2.conf` are available.
  - Create and use a dedicated user for gfarm-http-gateway (e.g., `gfhg`), and configure that user's Gfarm configuration file (e.g., `/home/gfhg/.gfarm2rc`).
    - Follow [Option 1 > Prepare Configuration](#2-prepare-configuration) for the Gfarm authentication configuration.

- **gfarm-http-gateway requirements**
  - To install Python and Node.js packages and build the Web UI, run:
    ```bash
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt

    npm --prefix frontend/app/react-app ci
    npm --prefix frontend/app/react-app run build
    ```

  - When using **Pyenv** instead of the system Python:
    - Install and configure Pyenv ([https://github.com/pyenv/pyenv](https://github.com/pyenv/pyenv))
    - Example:
      ```bash
      pyenv install -v 3.12
      cd gfarm-http-gateway
      make clear-venv # this runs `rm -rf ./venv`
      pyenv local 3.12
      ...
      (install Python and Node.js packages)
      ```

- **OpenID Connect provider**
  - Prepare the following values from your IdP (e.g., Keycloak):
    - Client ID and client secret
    - Valid redirect URI
    - Logout redirect URI (optional)

### Prepare Configuration

See **Configuration variables** above.

### Start Redis

#### Replace the system default config
- Ubuntu/Debian:

  ```bash
  sudo apt-get update
  sudo apt-get install -y redis-server
  sudo cp ./redis/redis.conf /etc/redis/redis.conf
  sudo chown root:root /etc/redis/redis.conf
  sudo chmod 644 /etc/redis/redis.conf
  sudo systemctl restart redis-server
  ```

- RHEL family:

  ```bash
  sudo dnf install -y redis
  sudo mkdir -p /etc/redis
  sudo cp ./redis/redis.conf /etc/redis/redis.conf
  sudo chown root:root /etc/redis/redis.conf
  sudo chmod 644 /etc/redis/redis.conf
  sudo systemctl enable --now redis
  ```

### Start gfarm-http-gateway

#### Localhost only (127.0.0.1)

```bash
./bin/gfarm-http-gateway.sh --port 8000
```

- Accessible only from `localhost`.
- For production, run behind a reverse proxy (e.g., NGINX) with HTTPS.

> NOTE: `gfarm-http-gateway.sh` is a wrapper around **Uvicorn** to launch the FastAPI app (`gfarm_http_gateway:app`).  
> This script:  
> - Loads common paths from `gfarm-http-gateway-common.sh` (virtual environment, Uvicorn binary, app entrypoint).
> - Checks if gf* commands exist.
> - Cleans up temporary files in `$GFARM_HTTP_TMPDIR` before starting.
> - Changes to the project root directory.
> - Runs Uvicorn with `--proxy-headers` and forwards any extra arguments.

#### Accessible from any host (0.0.0.0)

Expose gfarm-http-gateway to all network interfaces:

```bash
./bin/gfarm-http-gateway.sh --host 0.0.0.0 --port 8000
```

- Useful for quick experiments or testing across machines.
- **Prohibited in production** (unencrypted HTTP access to everyone).

#### Developer mode

Run gfarm-http-gateway with developer settings:

```bash
make test             # run automated tests
./bin/gfarm-http-gateway-dev.sh --port 8000
```

- Debug logging, auto-reload, binds `0.0.0.0:8000`.
- Intended for development only.

> NOTE: `gfarm-http-gateway-dev.sh` is a wrapper around **Uvicorn** to launch the FastAPI app (`gfarm_http_gateway:app`) in **developer mode**.  
> This script:  
> - Loads common paths from `gfarm-http-gateway-common.sh` (virtual environment, Uvicorn binary, app entrypoint).
> - Runs with `--reload` enabled for automatic code reloading.
> - Sets log level to **debug** for detailed output.
> - Binds to all interfaces (`--host 0.0.0.0`).
> - Uses `--proxy-headers` and forwards any extra arguments.

### Reverse Proxy (required for production)

Run gfarm-http-gateway behind a reverse proxy with HTTPS termination.  
This section shows an **example configuration** for NGINX.

1. Install NGINX
   - RHEL family:
     ```bash
     sudo dnf install nginx
     ```

   - Ubuntu/Debian:
     ```bash
     sudo apt-get install nginx
     sudo rm -f /etc/nginx/sites-enabled/default
     ```

2. Prepare Configuration

   - Create `/etc/nginx/conf.d/gfarm.conf`
   - Use the provided sample [`nginx.conf.sample`](./nginx.conf.sample) as a reference.
     - Modify the `proxy_set_header X-Forwarded-For` line based on your environment.
     - Also, update other settings according to your environment.
   - If serving under a path prefix, see **[Option 3: Run Under a Subpath](#option-3-run-under-a-subpath)** for configuration.

3. Restart NGINX

   ```bash
   sudo systemctl restart nginx
   ```

4. Restart gfarm-http-gateway

   - Restart gfarm-http-gateway with the `--forwarded-allow-ips` option:
     ```
     ./bin/gfarm-http-gateway.sh --host 0.0.0.0 --forwarded-allow-ips '<REVERSE_PROXY_IP>'
     ```

    > NOTE: `<REVERSE_PROXY_IP>`  
    > Add all IP addresses of your reverse proxies, or use '*' (allow all).
    > For details, see: [Quick Start > Option 2 > 2. Prepare Configuration](#2-prepare-configuration-1)

### Systemd

You can run gfarm-http-gateway as a **systemd service** for automatic startup and easier management.

1. Copy the source tree to a suitable location (e.g., `/opt`):

   ```bash
   cp -r gfarm-http-gateway/server /opt/gfarm-http-gateway
   ```

2. Copy the provided example service file:

   ```bash
   sudo cp gfarm-http.service /etc/systemd/system/
   ```

3. Edit `/etc/systemd/system/gfarm-http.service` to match your environment.

4. Reload systemd so it recognizes the new service:

   ```bash
   sudo systemctl daemon-reload
   ```

5. Enable the service to start automatically on boot:

   ```bash
   sudo systemctl enable gfarm-http
   ```

6. Start the service now:

   ```bash
   sudo systemctl start gfarm-http
   ```

7. Check the status and logs:

   ```bash
   sudo systemctl status gfarm-http
   ```


## Custom File Icons

gfarm-http-gateway reads `file_icons.json` to decide which icon to display for each file type.

- **How to set this file**:  
  - **Docker**: mount your `file_icons.json` into the container at `/config/file_icons.json`.
  - **Manual installation**: edit or replace `frontend/app/react-app/dist/assets/file_icons.json` after `npm --prefix frontend/app/react-app run build`.

- **Default file in the source tree**:
  - `frontend/app/react-app/public/assets/file_icons.json`

### Structure

- **category**: maps file extensions to categories
  - Example: `"image": ["jpg", "jpeg", "png", "gif"]`
  - Extensions should be lowercase and written without the dot.
- **icons**: maps categories to CSS classes for the icon to display
  - Example: `"image": "bi bi-file-earmark-image"`
- **css**: the URL of the stylesheet required to load the icons
  - Example: `"https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"`

### Display Rules

- **Folders** always use the icon defined in `icons.folder`.
- **Symlinks** (if present) use the icon defined in `icons.symlink`.
- **Files** are matched by extension against the categories in `category`.
   - If a match is found, the corresponding icon from `icons[category]` is used.
   - If no match is found, the `icons.default` class is used.

### Example

```json
{
  "category": {
    "image": ["jpg", "jpeg", "png", "gif", "svg"],
    "video": ["mp4", "mov", "avi", "mkv"],
    "audio": ["mp3", "wav", "flac"],
    "document": ["doc", "docx", "txt"],
    "pdf": ["pdf"],
    "archive": ["zip", "rar", "tar", "gz"],
    "code": ["js", "ts", "py", "html", "css", "c", "cpp"]
  },
  "icons": {
    "folder": "bi bi-folder-fill",
    "symlink": "bi bi-link-45deg",
    "image": "bi bi-file-earmark-image",
    "video": "bi bi-file-earmark-play",
    "audio": "bi bi-file-earmark-music",
    "document": "bi bi-file-earmark-text",
    "pdf": "bi bi-file-earmark-pdf",
    "archive": "bi bi-file-earmark-zip",
    "code": "bi bi-file-earmark-code",
    "default": "bi bi-file-earmark"
  },
  "css": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
}
```

## Custom Login Page

The login page is provided as a Jinja2 template (`templates/login.html`).  
You can replace this file to customize the login screen.

- **How to set this file**:  
  - **Docker**: mount your custom template into the container at `/config/templates/login.html`
  - **Manual installation**: edit or replace `templates/login.html`

### OIDC Login Button

If you override the login page, make sure the login button redirects to the OIDC endpoint, e.g.:
```html
<button onclick="location.href='./login_oidc'">
  Login with OpenID provider
</button>
```

Without this redirect, OIDC login will not start.

### SASL/PLAIN (Username/Password) Login Form

To support Gfarm SASL/PLAIN authentication (only available if it is enabled on the Gfarm server), provide a form that posts to `./login_passwd` with fields named `username` and `password`, e.g.:

```html
<form action="./login_passwd" method="post">
  <input type="text" name="username" placeholder="Username" required />
  <input type="password" name="password" placeholder="Password" required />
  <button type="submit">Login with Username/Password</button>
</form>
```

Both OIDC and SASL forms can coexist on the same login page.

### Error Notice

gfarm-http-gateway passes error messages to the login template as the Jinja2 variable `{{ error }}`.  
You can display this message anywhere in your custom template, e.g.:

```html
<div class="alert alert-danger">
  {{ error }}
</div>
```

## Logging

### Change log level
  Use the `--log-level` option when starting gfarm-http-gateway:

  ```bash
  ./bin/gfarm-http-gateway.sh --log-level info
  ```

  Available levels: `critical`, `error`, `warning`, `info`, `debug`, `trace`

  - See `venv/bin/uvicorn --help`
  - See: [https://www.uvicorn.org/settings/#logging](https://www.uvicorn.org/settings/#logging)

### Change log format
  Set the `LOGURU_FORMAT` environment variable before starting gfarm-http-gateway.

  ```bash
  LOGURU_FORMAT="<level>{level}</level>: <level>{message}</level>" ./bin/gfarm-http-gateway.sh
  ```

  - Cannot be specified in the configuration file.
  - Defaults are defined in [loguru/\_defaults.py](https://github.com/Delgan/loguru/blob/master/loguru/_defaults.py).


## API Documentation

gfarm-http-gateway provides interactive API documentation via **Swagger UI**, auto-generated by FastAPI.

- Open in a browser at:

  ```
  http://<hostname>:<port>/docs
  ```


## Development

### Development environment in gfarm/docker/dist

You can build and test gfarm-http-gateway inside the **gfarm/docker/dist** developer environment.

1. **Set up gfarm/docker/dist**
   Follow `(gfarm source)/docker/dist/README.md` and configure:

   - `Explore on virtual clusters`
   - `For OAuth authentication`
     - `Use http proxy instead of remote desktop` (squid container)

2. **Clone this repository into the gfarm source tree**

   ```bash
   cd (gfarm source)
   git clone https://github.com/oss-tsukuba/gfarm-http-gateway.git
   ```

3. **Log in to the cluster**

   ```bash
   make     # log in to the c1 container
   ssh c2   # move into the c2 container
   ```

4. **Install dependencies in c2**

   ```bash
   cd ~/gfarm/gfarm-http-gateway/server
   make setup-latest-with-sys-packages
   ```
   > NOTE: `make setup-latest-with-sys-packages` installs Python 3.12+, Node.js v22 (via nvm), and Redis (server package).

5. **Set up the Redis in c2**

   ```bash
   # start
   redis-server ./redis-for-docker-dist.conf
 
   # check
   redis-cli -h 127.0.0.1 -p 6379 ping  # → PONG
   ```

   > NOTE: stop redis-server with `redis-cli -h 127.0.0.1 -p 6379 shutdown`

6. **Launch gfarm-http-gateway in c2**

   Use the repository-provided gfarm-http-gateway-specific Gfarm client configuration by following the
   `gfarm2.conf` authentication guidance in
   [Option 1 > Prepare Configuration](#2-prepare-configuration).

   > **Important:** In this `docker/dist` environment, specify
   > `GFARM_HTTP_GFARM_CONFIG_FILE` explicitly. The setting is not currently
   > required by the gateway configuration, but omitting it may cause Gfarm
   > commands to use the runtime user's `~/.gfarm2rc` and behave with that
   > user's permissions and configuration.

   ```bash
   GFARM_HTTP_GFARM_CONFIG_FILE=/home/ubuntu/gfarm/gfarm-http-gateway/server/gfarm2.conf-for-gfarm-http-gateway \
     bin/gfarm-http-gateway-dev-for-docker-dist.sh --port 8000
   ```

   - Running this command starts gfarm-http-gateway in **developer mode** (debug logging, auto reload).
   - Optionally, repeat steps 4-5 in **c3** if you want another gateway instance.

7. **Configure authentication**

   - Open the Keycloak admin console: `https://keycloak:8443/auth/admin/master/console/#/HPCI/`
     (login with `admin/admin`).
   - In the **HPCI** realm, edit the example client `hpci-pub`.
   - Add redirect URIs:
       - `http://c2:8000/*`
       - `http://c2/*`
   - Add post logout redirect URIs:
       - `http://c2:8000/*`
       - `http://c2/*`
   - Save the changes.

8. **Access the Web UI**
   
   - Open [http://c2:8000/](http://c2:8000/) in a browser.
   - Click the **Login** button, and you will be redirected to [http://keycloak](http://keycloak).
   - Example login: `user1 / PASSWORD`.
   - The landing page includes API usage examples.

### Run tests

- `make test-all` - run all available tests (server + client).
  -  Requires the client to be built first (`cd ../client && make`).
- `make test` - run the following tests:
  - `make test-unit` - run API unit tests with pytest and display coverage.
  - `make test-coverage` - run API unit tests and display uncovered lines.
  - `make test-flake8` - run style checks with flake8.
  - `make test-playwright` - run Web UI end-to-end tests with Playwright (must be installed).

### To pin Python package versions

> **Note:** As a general rule, keep the implementation aligned with the latest stable and compatible library versions; do not use freezing to avoid necessary updates. If an update must be deferred, record the compatibility reason and a plan to resume updating.

Install the dependencies defined in `requirements_dev.txt`, then record the
versions actually used in `requirements.txt`.

- Edit requirements_dev.txt
  - Ex.: `uvicorn>=0.34`
- DO NOT edit requirements.txt
- `make setup-latest`

### To update requirements.txt for latest

GitHub Actions automatically runs the tests and updates `requirements.txt` when
the installed Python packages differ from the committed file. However, the
recommended procedure is to update and test the file locally before pushing:

```
make setup-latest
make test
make freeze
git diff -- requirements.txt
git add requirements.txt
git commit -m "build(python): update frozen requirements"
git push
```

When the locally generated `requirements.txt` is pushed with the changes, the
GitHub Actions update step should find no further changes to commit.

### To update frontend/app/react-app/package.json for latest

GitHub Actions does not automatically update `package.json` or
`package-lock.json`. During development and operation, maintain the frontend
dependencies by following the update procedure in the frontend README.

See `Update packages` in [frontend/app/react-app/README.md](./frontend/app/react-app/README.md)

### GitHub Actions

- See: `../.github/workflows/`
- See: <https://github.com/ad-m/github-push-action?tab=readme-ov-file#requirements-and-prerequisites>
  - (Requirements and Prerequisites)
  - `Read and write permissions` for Actions is required
- After the tests, Actions runs `make freeze` and automatically commits and pushes `requirements.txt` when it has changed.
- If `requirements.txt` was updated and pushed locally first, the Actions update step should make no additional change.
- `requirements.txt` may be updated, committed, and pushed automatically on GitHub, so `git pull` on your working directory may be required after `git push`.
