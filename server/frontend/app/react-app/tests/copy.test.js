const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    createDeferred,
    clickMenuItemFromView,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

async function waitForProgressView(page, expectedFileName, expectedStatus = "completed") {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-copy"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator("h6")).toContainText(expectedFileName);

    const progressBar = taskCard.locator(".progress-bar");
    if (expectedStatus === "completed") {
        await expect(progressBar).toBeVisible();
    } else {
        await expect(progressBar).toBeAttached();
    }
    await expect(taskCard.locator(".badge")).toHaveText(expectedStatus);
    return taskCard;
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should copy a file and display progress until completion", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedTestFileName = "meeting_notes (1).txt";

    const calls = await mockEndpoint(page, "PUT", "/copy", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ copied: 100, total: 100, done: true }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const copyResponse = page.waitForResponse(
        (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/copy"
    );
    await clickMenuItemFromView(page, testFileName, "copy");
    expect((await copyResponse).status()).toBe(200);

    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({
        source: `${currentDirectory}/${testFileName}`,
        destination: `${currentDirectory}/${expectedTestFileName}`,
    });

    await waitForProgressView(page, expectedTestFileName);

    const progressViewHeader = page.locator(".offcanvas-header", { hasText: "Transfers" });
    await progressViewHeader.locator(".btn-close").click();
    await expect(progressViewHeader).not.toBeVisible();
});

test("Should cancel an ongoing copy operation and show cancellation message", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    const gate = createDeferred();
    const calls = await mockEndpoint(page, "PUT", "/copy", {
        onRequest: async (route) => {
            await gate.promise;
            try {
                const total = 1024 * 1024 * 50;
                await route.fulfill({
                    status: 200,
                    contentType: "application/x-ndjson",
                    body: JSON.stringify({ copied: total, total, done: true }) + "\n",
                });
            } catch {
                // Request may already be aborted by cancellation.
            }
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "copy");

    const progressView = page.locator('[data-testid="progress-view"]');
    const taskCard = progressView.locator(`[data-testid^="progress-card-copy"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("copy");
    await expect.poll(() => calls.length).toBe(1);

    const cancelButton = taskCard.locator(`[data-testid^="progress-button-cancel"]`);
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(taskCard.locator(".badge")).toHaveText("cancelled");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "Copy cancelled"
    );
    gate.resolve();

    const progressViewHeader = page.locator('[data-testid="progress-header"]');
    await progressViewHeader.locator('[data-testid="progress-header-button-close"]').click();
    await expect(progressViewHeader).not.toBeVisible();

    await expect(page.locator(".btn", { hasText: "Show Progress" })).not.toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Should show error status when copy fails with HTTP error", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedTestFileName = "meeting_notes (1).txt";

    await mockEndpoint(page, "PUT", "/copy", {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfexport", message: "copy error", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const copyResponse = page.waitForResponse(
        (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/copy"
    );
    await clickMenuItemFromView(page, testFileName, "copy");
    expect((await copyResponse).status()).toBe(500);

    const taskCard = await waitForProgressView(page, expectedTestFileName, "error");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText("500");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText("copy error");
});

test("Should show error status when copy stream emits an error payload", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedTestFileName = "meeting_notes (1).txt";

    await mockEndpoint(page, "PUT", "/copy", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response:
            JSON.stringify({ copied: 50, total: 100, done: false }) +
            "\n" +
            JSON.stringify({ error: "checksum mismatch", done: true }) +
            "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await clickMenuItemFromView(page, testFileName, "copy");

    const taskCard = await waitForProgressView(page, expectedTestFileName, "error");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "checksum mismatch"
    );
});

test("Should display warning message from copy stream before completion", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedTestFileName = "meeting_notes (1).txt";

    await mockEndpoint(page, "PUT", "/copy", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ warn: "checksum unavailable", done: true }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await clickMenuItemFromView(page, testFileName, "copy");

    const taskCard = await waitForProgressView(page, expectedTestFileName, "completed");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "checksum unavailable"
    );
});
