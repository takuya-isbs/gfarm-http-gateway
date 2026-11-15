#!/bin/bash
set -eu

echo "=== Starting gfarm-http-gateway container ==="

# Setup gfarm2.conf
if [ -f /config/gfarm2.conf ]; then
    echo "[INFO] Linking /config/gfarm2.conf to /usr/local/etc/gfarm2.conf"
    ln -sf /config/gfarm2.conf /usr/local/etc/gfarm2.conf
else
    echo "[WARN] /config/gfarm2.conf not found"
fi

# Copy certificate files
if [ -d /config/certs ] && compgen -G "/config/certs/*" > /dev/null; then
    echo "[INFO] Copying certs from /config/certs to /etc/pki/tls/certs/gfarm/"
    mkdir -p /etc/pki/tls/certs/gfarm
    cp -u /config/certs/* /etc/pki/tls/certs/gfarm/
elif [ -d /config/certs ]; then
    echo "[ERROR] No Gfarm CA certificates found in /config/certs; populate this mounted directory before starting the Gateway" >&2
    exit 1
else
    echo "[WARN] /config/certs not found"
fi

# Setup gfarm-http-gateway.conf
if [ -f /config/gfarm-http-gateway.conf ]; then
    echo "[INFO] Linking /config/gfarm-http-gateway.conf to /app/gfarm-http-gateway/gfarm-http-gateway.conf"
    ln -sf /config/gfarm-http-gateway.conf /app/gfarm-http-gateway/gfarm-http-gateway.conf
else
    echo "[WARN] /config/gfarm-http-gateway.conf not found"
fi

# Custom File Icons
if [ -f /config/file_icons.json ]; then
  echo "[INFO] /config/file_icons.json found — Copying to Web UI assets"
    cp /config/file_icons.json /app/gfarm-http-gateway/frontend/app/react-app/dist/assets/file_icons.json
fi

# Custom Login Page
if [ -f /config/templates/login.html ]; then
  echo "[INFO] /config/templates/login.html found — Copying to templates"
    cp /config/templates/login.html /app/gfarm-http-gateway/templates/login.html
fi

# Trust custom CA
if [ -f /config/dev_ca.crt ]; then
    echo "[INFO] Custom CA found at /config/dev_ca.crt — installing"
    cp /config/dev_ca.crt /usr/local/share/ca-certificates/dev_ca.crt
    update-ca-certificates
    export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
fi

# Launch gateway
echo "[INFO] Launching gfarm-http-gateway..."
if [ -n "${REQUESTS_CA_BUNDLE:-}" ]; then
    exec env REQUESTS_CA_BUNDLE="$REQUESTS_CA_BUNDLE" \
         /app/gfarm-http-gateway/bin/gfarm-http-gateway.sh --proxy-headers "$@"
else
    exec /app/gfarm-http-gateway/bin/gfarm-http-gateway.sh --proxy-headers "$@"
fi
