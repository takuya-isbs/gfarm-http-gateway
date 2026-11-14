const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromView,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockCopyRoute(
    page,
    {
        source,
        destination,
        statusCode = 200,
        mockResponse = JSON.stringify({ copied: 100, total: 100, done: true }) + "\n",
    }
) {
    await mockRoute(page, `${API_URL}/**`, "PUT", "/copy", {
        validateBody: (body) => {
            expect(typeof body.source).toBe("string");
            expect(typeof body.destination).toBe("string");
            if (source) expect(body.source).toBe(source);
            if (destination) expect(body.destination).toBe(destination);
        },
        statusCode,
        contentType: "application/json",
        response: mockResponse,
    });
}

async function waitForProgressView(page, expectedFileName) {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-copy"]`);
    await expect(taskCard).toBeVisible();

    await expect(taskCard.locator("h6")).toContainText(expectedFileName);

    const progressBar = taskCard.locator(".progress-bar");
    await expect(progressBar).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("completed");
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should copy a file and display progress until completion", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedTestFileName = "meeting_notes (1).txt";

    await mockCopyRoute(page, {
        source: currentDirectory + "/" + testFileName,
        destination: currentDirectory + "/" + expectedTestFileName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "copy");

    await waitForProgressView(page, expectedTestFileName);

    const ProgressViewHeader = page.locator(".offcanvas-header", { hasText: "Transfers" });
    const close_button = ProgressViewHeader.locator(".btn-close");
    await close_button.click();
    await expect(ProgressViewHeader).not.toBeVisible();
});

test("Should cancel an ongoing copy operation and show cancellation message", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    await page.route(`${API_URL}/copy`, async (route) => {
        console.log(`[ROUTE MOCK] Simulating delayed copy for: ${testFileName}`);
        const headers = {
            "content-type": "application/json",
            "transfer-encoding": "chunked",
        };
        await page.waitForTimeout(1000); // delay
        const total = 1024 * 1024 * 50;
        const chunks = JSON.stringify({ copied: total, total, done: true }) + "\n";
        await route.fulfill({
            status: 200,
            headers,
            body: chunks,
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "copy");

    const progressView = page.locator('[data-testid="progress-view"]');
    const taskCard = progressView.locator(`[data-testid^="progress-card-copy"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("copy");

    const cancelButton = taskCard.locator(`[data-testid^="progress-button-cancel"]`);
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(taskCard.locator(".badge")).toHaveText("cancelled");
    const firstTaskMessage = taskCard.locator('[data-testid="task-message-0"]');
    await expect(firstTaskMessage).toContainText("Copy cancelled"); // Verify cancellation message

    const ProgressViewHeader = page.locator('[data-testid="progress-header"]');
    const close_button = ProgressViewHeader.locator('[data-testid="progress-header-button-close"]');
    await close_button.click();
    await expect(ProgressViewHeader).not.toBeVisible();

    const ProgressViewButton = page.locator(".btn", { hasText: "Show Progress" });
    await expect(ProgressViewButton).not.toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
});
