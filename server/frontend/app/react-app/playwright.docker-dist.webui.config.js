import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    testMatch: ["docker-dist.integration.spec.js", "docker-dist.operations.spec.js"],
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    outputDir: "/tmp/gfarm-http-gateway-webui-results",
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.GFARM_HTTP_GATEWAY_URL,
        ignoreHTTPSErrors: true,
        trace: "off",
        screenshot: "off",
        video: "off",
    },
});
