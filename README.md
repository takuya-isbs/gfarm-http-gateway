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

## Related Documents

For setup, configuration, and detailed usage, see:

- **Server:** [server/README.md](./server/README.md) - startup, configuration  
- **Client:** [client/README.md](./client/README.md) - usage
- **Development:** [DEVELOPMENT.md](./DEVELOPMENT.md) - development setup, tests, and lint
