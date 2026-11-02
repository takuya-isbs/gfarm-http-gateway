# ========= Build Stage =========
FROM debian:bookworm-slim AS builder

ARG DEBIAN_FRONTEND=noninteractive

# ==== Set ARGs for build-time config ====
ARG GFARM_VER=2.8.8
ARG GFARM_SRC_URL=https://github.com/oss-tsukuba/gfarm/archive/${GFARM_VER}.tar.gz
ARG GFARM_SRC_GIT_URL=https://github.com/oss-tsukuba/gfarm.git
ARG GFARM_SRC_GIT_BRANCH=2.8
ARG GFARM_SRC_LOCAL=vendor

ARG SCITOKENS_CPP_SRC_GIT_URL=https://github.com/scitokens/scitokens-cpp.git
ARG SCITOKENS_CPP_SRC_GIT_BRANCH=master
ARG SASL_XOAUTH2_SRC_GIT_URL=https://github.com/oss-tsukuba/cyrus-sasl-xoauth2-idp.git
ARG SASL_XOAUTH2_SRC_GIT_BRANCH=feature/keycloak

# ==== Install build dependencies ====
RUN apt-get update && apt-get install -y \
    build-essential \
    autoconf automake libtool pkg-config \
    libssl-dev libpq-dev libsasl2-dev sasl2-bin \
    libcurl4-openssl-dev \
    libexpat1-dev \
    uuid-dev libsqlite3-dev \
    git cmake g++ \
    ca-certificates \
    wget \
    python3 python3-docopt python3-schema

# ==== Build scitokens-cpp ====
RUN set -eux && cd /tmp \
    && git clone -b ${SCITOKENS_CPP_SRC_GIT_BRANCH} --depth 1 ${SCITOKENS_CPP_SRC_GIT_URL} scitokens-cpp \
    && cd scitokens-cpp \
    && mkdir build && cd build \
    && cmake -DCMAKE_INSTALL_PREFIX="/usr" .. \
    && make && make install

# ==== Build cyrus-sasl-xoauth2-idp ====
RUN set -eux && cd /tmp \
    && git clone -b ${SASL_XOAUTH2_SRC_GIT_BRANCH} --depth 1 ${SASL_XOAUTH2_SRC_GIT_URL} cyrus-sasl-xoauth2-idp \
    && cd cyrus-sasl-xoauth2-idp \
    && ./autogen.sh \
    && ./configure --libdir=$(pkg-config --variable=libdir libsasl2) \
    && make && make install

# ==== Build Gfarm ====
RUN --mount=type=bind,source=${GFARM_SRC_LOCAL},target=/tmp/gfarm-local,readonly \
    set -eux && cd /tmp \
    && if [ -n "${GFARM_SRC_URL}" ]; then \
    echo ">> Using : ${GFARM_SRC_URL}"; \
    wget -O gfarm.tar.gz "${GFARM_SRC_URL}"; \
    mkdir "gfarm-${GFARM_VER}"; \
    tar xf gfarm.tar.gz --strip-components=1 -C "gfarm-${GFARM_VER}"; \
    elif [ -n "${GFARM_SRC_GIT_URL}" ] && [ -n "${GFARM_SRC_GIT_BRANCH}" ]; then \
    echo ">> Using : ${GFARM_SRC_GIT_URL} (branch ${GFARM_SRC_GIT_BRANCH})"; \
    git clone -b "${GFARM_SRC_GIT_BRANCH}" --depth 1 "${GFARM_SRC_GIT_URL}" "gfarm-${GFARM_VER}"; \
    else \
    echo ">> Using : ${GFARM_SRC_LOCAL}"; \
    mkdir "gfarm-${GFARM_VER}"; \
    cp -a /tmp/gfarm-local/. "gfarm-${GFARM_VER}/"; \
    fi \
    && cd "gfarm-${GFARM_VER}" \
    && ./configure --enable-xmlattr --enable-cyrus-sasl \
    && make -j"$(nproc)" \
    && make install

# ==== Collect SASL plugin and libscitokens ====
RUN LIBDIR=$(pkg-config --variable=libdir libsasl2) \
    && mkdir -p /tmp/libs/sasl2 \
    && cp "$LIBDIR"/libSciTokens* /tmp/libs/ \
    && cp "$LIBDIR"/sasl2/* /tmp/libs/sasl2/ \
    && echo "$(pkg-config --variable=libdir libsasl2)" > /tmp/sasl2-libdir.txt

# ========= Runtime Stage =========
FROM debian:bookworm-slim AS runtime

ARG DEBIAN_FRONTEND=noninteractive

# ==== Set ARGs for runtime ====
ARG NODE_VERSION=26.13.0

# ==== Install runtime dependencies ====
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 libssl3 libexpat1 libgcc-s1 libstdc++6 libuuid1 \
    libsasl2-2 libsasl2-modules sasl2-bin netbase \
    ca-certificates curl xz-utils \
    python3-minimal python3-pip python3-venv python3-docopt python3-schema \
    && case "$(dpkg --print-architecture)" in \
    amd64) NODE_ARCH="x64" ;; \
    arm64) NODE_ARCH="arm64" ;; \
    armhf) NODE_ARCH="armv7l" ;; \
    *) echo "Unsupported architecture" && exit 1 ;; \
    esac \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz \
    && mkdir -p /usr/local/lib/nodejs \
    && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1 \
    && ln -s /usr/local/lib/nodejs/bin/node /usr/local/bin/node \
    && ln -s /usr/local/lib/nodejs/bin/npm /usr/local/bin/npm \
    && ln -s /usr/local/lib/nodejs/bin/npx /usr/local/bin/npx \
    && rm -rf /tmp/node.tar.xz \
    && rm -rf /var/lib/apt/lists/*

# ==== Copy Gfarm client binaries and libraries ====
COPY --from=builder /usr/local/bin/gf* /usr/local/bin/
COPY --from=builder /usr/local/lib/libgf* /usr/local/lib/
RUN mkdir -p /tmp/libs
COPY --from=builder /tmp/libs/ /tmp/libs/
COPY --from=builder /tmp/sasl2-libdir.txt /tmp/
RUN LIBDIR=$(cat /tmp/sasl2-libdir.txt) \
    && cp /tmp/libs/libSciTokens* "$LIBDIR"/ \
    && mkdir -p "$LIBDIR"/sasl2 \
    && cp /tmp/libs/sasl2/* "$LIBDIR"/sasl2/ \
    && ldconfig \
    && rm -rf /tmp/libs /tmp/sasl2-libdir.txt
RUN ldconfig

# ==== Copy gfarm-http-gateway ====
COPY . /app/gfarm-http-gateway

# ==== Build ====
WORKDIR /app/gfarm-http-gateway
RUN ./setup.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
