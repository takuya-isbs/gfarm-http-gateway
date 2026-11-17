#!/bin/bash
set -eu
set -x

DIR=$(dirname -- "$(realpath -- "$0")")

LOAD_FROM_ENV=1

Load_Env () {
    local CONF="$1"
    [ -f "$CONF" ] || { echo "Config not found: $CONF" >&2; return 1; }

    if [ $LOAD_FROM_ENV -eq 1 ]; then
        source "$CONF"
        # get keys
        while IFS= read -r line; do
            if echo "$line" | grep -qv '^\s*#\|^\s*$'; then
                key=$(echo "$line" | cut -d '=' -f 1)
                eval "export $key"
            fi
        done < "$CONF"
    else
        GFARM_HTTP_CONFIG_FILE="$CONF"
        export GFARM_HTTP_CONFIG_FILE
    fi
}

Load_Env ./gfarm-http-gateway-for-docker-dist.conf

GFARM_HTTP_GFARM_CONFIG_FILE="${DIR}/../gfarm2.conf-for-docker-dist"
[ -f "$GFARM_HTTP_GFARM_CONFIG_FILE" ] || {
    echo "Gfarm client config not found: $GFARM_HTTP_GFARM_CONFIG_FILE" >&2
    exit 1
}
GFARM_HTTP_GFARM_CONFIG_FILE=$(realpath -- "$GFARM_HTTP_GFARM_CONFIG_FILE")
export GFARM_HTTP_GFARM_CONFIG_FILE

exec bash -x "${DIR}/gfarm-http-gateway-dev.sh" "$@"
