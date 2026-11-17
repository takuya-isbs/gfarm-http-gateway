# Build the http-gw images used by the docker/dist real-Gfarm E2E tests.

group "http-gw" {
  targets = ["http-gw-python3_11", "http-gw-python3_15"]
}

target "http-gw-python3_15" {
  context = "gfarm-http-gateway/server"
  tags    = ["gfarm-http-gateway-docker-dist"]
  args = {
    PYTHON_VERSION = "3.15.2"
    PYTHON_SHA256  = "8b5536d280142ecf6cdfe15d12a21ba1c65e300bbf7b28a8d0cdb849575797de"
  }
}

target "http-gw-python3_11" {
  context = "gfarm-http-gateway/server"
  tags    = ["gfarm-http-gateway-docker-dist:python3.11"]
  args = {
    PYTHON_VERSION = "3.11.18"
    PYTHON_SHA256  = "9120e0a653868f6e3698d36cdd99e5a58903ec9469e448f21d98f7b16d8fa290"
  }
}
