import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    testMatch: "docker-dist.jwt-server.spec.js",
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    outputDir: "/tmp/gfarm-http-gateway-jwt-playwright-results",
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        // The docker/dist JWT Server certificate is not trusted by the Playwright browser by default.
        ignoreHTTPSErrors: true,
        trace: "off",
        screenshot: "off",
        video: "off",
    },
});
