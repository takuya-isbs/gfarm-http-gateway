const { test: baseTest, expect } = require("@playwright/test");

const API_ORIGIN = process.env.GFARM_HTTP_API_ORIGIN || "http://localhost:8080";
const OUTPUT_PREFIX = "GFARM_HTTP_API_REQUEST ";

function trackApiRequests(page) {
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin !== API_ORIGIN) return;

        const query = {};
        for (const name of new Set(url.searchParams.keys())) {
            query[name] = url.searchParams.getAll(name);
        }
        process.stdout.write(
            `${OUTPUT_PREFIX}${JSON.stringify({
                client: "webui",
                method: request.method(),
                path: url.pathname,
                query,
            })}\n`
        );
    });
}

const test = baseTest.extend({
    captureApiRequests: [
        async ({ context }, use) => {
            context.on("page", trackApiRequests);
            for (const page of context.pages()) trackApiRequests(page);
            await use();
        },
        { auto: true },
    ],
});

module.exports = { test, expect, trackApiRequests };
