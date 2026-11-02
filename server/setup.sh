#!/bin/bash
set -eu
set -x

source /etc/os-release

REQUIREMENTS="${1:-requirements.txt}"

INSTALL_SYS_PACKAGES="${INSTALL_SYS_PACKAGES:-0}"

DIR=$(realpath $(dirname $0))
VENV_DIR="${DIR}/venv"
PIP="${VENV_DIR}/bin/pip3"

PYTHON=python3

SUDO() {
    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

APTGET() {
    SUDO apt-get "$@"
}

DNF() {
    SUDO dnf "$@"
}

install_packages_for_debian() {
    # for Ubuntu 24.04
    APTGET update
    APTGET install -y make python3-minimal python3-pip python3-venv redis-server
}

install_packages_for_rhel() {
    # for RHEL9 family
    DNF install -y make python3.12 python3.12-pip redis
}

install_python_package() {
    if [ -n "${PYENV_ROOT:-}" ]; then
        PYTHON=python3
    fi
    # $PYTHON -m venv --clear "$VENV_DIR"
    $PYTHON -m venv --upgrade "$VENV_DIR"

    $PIP install -r "$REQUIREMENTS"
}

install_for_debian() {
    if [ $INSTALL_SYS_PACKAGES -eq 1 ]; then
        install_packages_for_debian
    fi
    install_python_package
}

install_for_rhel() {
    if [ $INSTALL_SYS_PACKAGES -eq 1 ]; then
        install_packages_for_rhel
    fi
    install_python_package
}

install_frontend() {
    if [ $INSTALL_SYS_PACKAGES -eq 1 ]; then
        NODE_VERSION=26
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
        \. "$HOME/.nvm/nvm.sh"
        nvm install $NODE_VERSION
    fi

    npm --prefix frontend/app/react-app ci
    npm --prefix frontend/app/react-app run build
}

# main
ALL_IDS="${ID_LIKE:-} ${ID:-}"
for id in $ALL_IDS; do  # ID_LIKE from /etc/os-release
    case $id in
        debian)
            install_for_debian
            break
            ;;
        rhel)
            PYTHON=python3.12
            install_for_rhel
            break
            ;;
    esac
done

install_frontend
