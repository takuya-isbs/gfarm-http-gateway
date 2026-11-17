ARG UBUNTU_BASE_IMAGE=ubuntu:26.04

# ========= Python Build Stage =========
FROM ${UBUNTU_BASE_IMAGE} AS python-builder

ARG DEBIAN_FRONTEND=noninteractive
ARG PYTHON_VERSION=3.15.2
ARG PYTHON_SHA256=8b5536d280142ecf6cdfe15d12a21ba1c65e300bbf7b28a8d0cdb849575797de

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl \
    libbz2-dev libffi-dev libgdbm-dev liblzma-dev libncurses-dev \
    libreadline-dev libsqlite3-dev libssl-dev uuid-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    curl -fsSLO "https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tar.xz"; \
    echo "${PYTHON_SHA256}  Python-${PYTHON_VERSION}.tar.xz" | sha256sum -c -; \
    tar -xJf "Python-${PYTHON_VERSION}.tar.xz"; \
    cd "Python-${PYTHON_VERSION}"; \
    ./configure --prefix=/opt/cpython --with-ensurepip=install; \
    make -j"$(nproc)"; \
    make install; \
    /opt/cpython/bin/python3 --version

# ========= Gfarm Build Stage =========
FROM ${UBUNTU_BASE_IMAGE} AS builder

ARG DEBIAN_FRONTEND=noninteractive

ARG GFARM_VER=2.8.12
ARG GFARM_SRC_URL=https://github.com/oss-tsukuba/gfarm/archive/${GFARM_VER}.tar.gz
ARG GFARM_SRC_GIT_URL=https://github.com/oss-tsukuba/gfarm.git
ARG GFARM_SRC_GIT_BRANCH=2.8
ARG GFARM_SRC_LOCAL=vendor

ARG SCITOKENS_CPP_SRC_GIT_URL=https://github.com/scitokens/scitokens-cpp.git
ARG SCITOKENS_CPP_SRC_GIT_BRANCH=master
ARG SASL_XOAUTH2_SRC_GIT_URL=https://github.com/oss-tsukuba/cyrus-sasl-xoauth2-idp.git
ARG SASL_XOAUTH2_SRC_GIT_BRANCH=feature/keycloak

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libtool pkg-config \
    libssl-dev libpq-dev libsasl2-dev sasl2-bin \
    libcurl4-openssl-dev libexpat1-dev uuid-dev libsqlite3-dev \
    git cmake g++ ca-certificates wget \
    python3 python3-docopt python3-schema \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux && cd /tmp \
    && git clone -b "${SCITOKENS_CPP_SRC_GIT_BRANCH}" --depth 1 "${SCITOKENS_CPP_SRC_GIT_URL}" scitokens-cpp \
    && cd scitokens-cpp \
    && mkdir build && cd build \
    && cmake -DCMAKE_INSTALL_PREFIX="/usr" .. \
    && make -j"$(nproc)" && make install

RUN set -eux && cd /tmp \
    && git clone -b "${SASL_XOAUTH2_SRC_GIT_BRANCH}" --depth 1 "${SASL_XOAUTH2_SRC_GIT_URL}" cyrus-sasl-xoauth2-idp \
    && cd cyrus-sasl-xoauth2-idp \
    && ./autogen.sh \
    && ./configure --libdir="$(pkg-config --variable=libdir libsasl2)" \
    && make -j"$(nproc)" && make install

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

RUN LIBDIR="$(pkg-config --variable=libdir libsasl2)" \
    && mkdir -p /tmp/libs/sasl2 \
    && cp "$LIBDIR"/libSciTokens* /tmp/libs/ \
    && cp "$LIBDIR"/sasl2/* /tmp/libs/sasl2/ \
    && echo "$(pkg-config --variable=libdir libsasl2)" > /tmp/sasl2-libdir.txt

# ========= Runtime Stage =========
FROM ${UBUNTU_BASE_IMAGE} AS runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=26.13.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4t64 libssl3t64 libexpat1 libatomic1 libgcc-s1 libstdc++6 libuuid1 \
    libbz2-1.0 libffi8 libgdbm6t64 liblzma5 libncursesw6 libreadline8t64 \
    libsqlite3-0 zlib1g libsasl2-2 libsasl2-modules sasl2-bin netbase \
    ca-certificates curl xz-utils python3-minimal python3-docopt python3-schema \
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
    && rm -rf /tmp/node.tar.xz /var/lib/apt/lists/*

COPY --from=python-builder /opt/cpython /opt/cpython
COPY --from=builder /usr/local/bin/gf* /usr/local/bin/
COPY --from=builder /usr/local/lib/libgf* /usr/local/lib/
COPY --from=builder /tmp/libs/ /tmp/libs/
COPY --from=builder /tmp/sasl2-libdir.txt /tmp/
RUN LIBDIR="$(cat /tmp/sasl2-libdir.txt)" \
    && cp /tmp/libs/libSciTokens* "$LIBDIR"/ \
    && mkdir -p "$LIBDIR"/sasl2 \
    && cp /tmp/libs/sasl2/* "$LIBDIR"/sasl2/ \
    && ldconfig \
    && rm -rf /tmp/libs /tmp/sasl2-libdir.txt

COPY . /app/gfarm-http-gateway
WORKDIR /app/gfarm-http-gateway
RUN PATH="/opt/cpython/bin:${PATH}" ./setup.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
