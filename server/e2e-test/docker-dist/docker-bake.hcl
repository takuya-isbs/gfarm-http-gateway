# Build the http-gw images used by the docker/dist real-Gfarm E2E tests.

group "http-gw" {
  targets = ["http-gw-python3_11", "http-gw-python3_15"]
}

variable "GFARM_HTTP_PYTHON_VERSION" {}

variable "GFARM_HTTP_PYTHON_311_VERSION" {}

target "http-gw-python3_15" {
  context = "gfarm-http-gateway/server"
  tags    = ["gfarm-http-gateway-docker-dist:python${GFARM_HTTP_PYTHON_VERSION}"]
  args = {
    PYTHON_VERSION = GFARM_HTTP_PYTHON_VERSION
  }
}

target "http-gw-python3_11" {
  context = "gfarm-http-gateway/server"
  tags    = ["gfarm-http-gateway-docker-dist:python${GFARM_HTTP_PYTHON_311_VERSION}"]
  args = {
    PYTHON_VERSION = GFARM_HTTP_PYTHON_311_VERSION
  }
}
