# gfarm-http Client

Command-line tools for interacting with [gfarm-http-gateway](../server).

This directory provides:

- **gfarm-http** 
  - Unified CLI for Gfarm over HTTP
- **jwt-curl**
  - Wrapper for `curl` with JWT/OIDC support

For instructions on using this client from c1 in the Gfarm `docker/dist` development and test environment, see the **Use the command-line client from c1** section in `docker/dist/http-gateway/README.md` in the separate Gfarm repository. This path is available when `gfarm-http-gateway` is cloned under the Gfarm source checkout.

## Prerequisites

To use the client, you need:

### Infrastructure (must be running)

- **gfarm-http-gateway**
  - [server](../server) 
- **JWT server**
  - issues access tokens ([jwt-server](https://github.com/oss-tsukuba/jwt-server))  

### Client Tools (install locally)

- **jwt-agent**
  - manages and refreshes tokens ([jwt-agent](https://github.com/oss-tsukuba/jwt-agent))  


## Installation

### Requirements
- **Go 1.18+**
- **make**

### Build & Install

```bash
git clone https://github.com/oss-tsukuba/gfarm-http-gateway.git
cd gfarm-http-gateway/client

# build
make

# install
sudo make install

# uninstall
sudo make uninstall
```

By default, the following binaries will be installed into `/usr/local/bin/`:
- `gfarm-http`
- `jwt-curl`
- `jwt-curl-upload`

### Custom install path

You can change the installation path by specifying `PREFIX` or `DESTDIR`:

```bash
# Install into /opt/bin
make PREFIX=/opt install

# Use DESTDIR for packaging
make DESTDIR=/tmp/pkgroot install
```


## gfarm-http

Main entry point:  
```bash
gfarm-http [global-options] <command> [command-options] [args]
```

### Supported commands

- `ls [options] <Gfarm-path>`
  - `-a` - do not hide entries starting with '.'
  - `-e` - display effective permissions  
  - `-l` - list in long format
  - `-T` - with -l option, show complete date format
  - `-R` - recursively list subdirectories
  - `-j` - output with json format
- `download <Gfarm-path> <Local-path>`
- `zipdownload [-o output] <Gfarm-paths>...`
  - `-o output` - output zip file ("-" for stdout, default: "-")
- `upload <Local-path> <Gfarm-path>`
- `rm [options] <Gfarm-path>`
  - `-f` - ignore nonexistent files, never prompt
  - `-r` - remove directories and contents recursively
- `mkdir [options] <Gfarm-path>`
  - `-p` - create parent directories if needed
- `rmdir <Gfarm-path>`
- `mv <src> <dest>`
- `stat [options] <Gfarm-path>`
  - `-C` - show checksum
  - `-l` - show symlink info, don't follow links
- `chmod <mode> <Gfarm-path>`
- `copy <src-Gfarm-path> <dest-Gfarm-path>`
- `ln [options] <target-Gfarm-path> <linkname-Gfarm-path>`
  - `-s` - create symbolic link
- `tar <command> [options] [args]`
  > Note: This command is supported only for Gfarm paths (gfarm:/ to gfarm:/); local paths are not supported.
  - `-c OUTDIR -C DIR MEMBER...` - create tar files in OUTDIR from DIR/MEMBERs
  - `-r OUTDIR -C DIR MEMBER...` - append files to new tar files  
  - `-u OUTDIR -C DIR MEMBER...` - append only newer files to new tar files
  - `-x OUTDIR INDIR MEMBER...` - extract entries from INDIR to OUTDIR
  - `-t DIR` - list members of DIR
- `getfacl <Gfarm-path>`
- `setfacl [options] <Gfarm-path>`
  - `-M FILE` - read ACL entries from FILE ("-" for stdin)
- `gfuser [options]`
  - `-l` - long format
- `gfgroup [options]`  
  - `-l` - long format
- `whoami`
- `userinfo`

### Examples

#### Setup

```bash
# (Option A) Using OIDC Access Token
# Start jwt-agent after retrieving passphrase from JWT Server
export GFARM_HTTP_URL=http://localhost:8000

# (Option B) Using SASL Username/Password
export GFARM_HTTP_URL=http://localhost:8000
export GFARM_SASL_USER=user1
export GFARM_SASL_PASSWORD=PASSWORD
```

#### File Operations

```bash
# List files and directories
gfarm-http ls -la /tmp

# Upload and download files
gfarm-http upload ./local.txt /tmp/remote.txt
gfarm-http download /tmp/remote.txt ./local.txt

# File management
gfarm-http mkdir /tmp/newdir
gfarm-http mv /tmp/old.txt /tmp/new.txt
gfarm-http rm /tmp/unwanted.txt
```

#### System Information

```bash
# Check current user
gfarm-http whoami

# Get file attributes
gfarm-http stat /tmp/file.txt

# Change permissions
gfarm-http chmod 644 /tmp/file.txt
```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
# Add -v flag for verbose output
gfarm-http -v ls /tmp
```

### Test

Ensure a temporary directory exists in Gfarm (required).  
If it does not exist, create it:
```bash
gfmkdir -m 1777 /tmp
```

Run the tests:

```bash
make test
```

## jwt-curl

Wrapper around `curl` that automatically attaches an access token from `jwt-agent`.

### Commands

- `jwt-curl [curl options]`

  - Adds `Authorization: Bearer <token>` header automatically
  - Environment variables (optional):

    - `JWT_USER_PATH` - Path to JWT file
    - `GFARM_SASL_USER` - Username (`anonymous` disables Authorization header)
    - `GFARM_SASL_PASSWORD` - Password (for SASL PLAIN/LOGIN)
- `jwt-curl-upload local_file URL [curl options]`

  - Convenience wrapper for file uploads

### Examples

#### Basic Requests

```bash
# Get username
jwt-curl -s http://localhost:8000/conf/me

# Get file list
jwt-curl -s "http://localhost:8000/dir/?show_hidden=on&long_format=on"
```

#### File Transfer

```bash
# Upload large file
jwt-curl-upload /tmp/10GiB http://localhost:8000/file/tmp/10GiB

# Download file
jwt-curl -o /tmp/10GiB-2 http://localhost:8000/file/tmp/10GiB
```

#### Authentication Variants

```bash
# Anonymous access
GFARM_SASL_USER=anonymous jwt-curl http://localhost:8000/conf/me

# SASL user/pass
GFARM_SASL_USER=user1 GFARM_SASL_PASSWORD=PASSWORD jwt-curl http://localhost:8000/conf/me
```

