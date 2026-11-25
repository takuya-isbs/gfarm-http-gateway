const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromNewMenu,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockCreateRoute(
    page,
    { filepath, statusCode = 200, mockResponse = { result: "ok" } }
) {
    await mockRoute(page, `${API_URL}/**`, "PUT", "/dir" + filepath, {
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should create a new directory from the New menu", async ({ page }) => {
    const currentDirectory = "/";
    const testDirName = "testdir";

    await mockCreateRoute(page, {
        filepath: "/" + testDirName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromNewMenu(page, "create-directory");

    const newdirModal = page.locator('[data-testid="newdir-modal"]');
    await expect(newdirModal).toBeVisible();

    const input = newdirModal.locator('[id="create-dir-input"]');
    await input.fill(testDirName);

    const confirmButton = newdirModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    const creationResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === "/dir/testdir"
    );
    await confirmButton.click();
    expect((await creationResponse).status()).toBe(200);
});

test("Should display an error notification when directory creation fails", async ({ page }) => {
    const currentDirectory = "/";
    const testDirName = "testdir";

    await mockCreateRoute(page, {
        filepath: "/" + testDirName,
        statusCode: 500,
        mockResponse: { detail: "error test" },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromNewMenu(page, "create-directory");

    const newdirModal = page.locator('[data-testid="newdir-modal"]');
    await expect(newdirModal).toBeVisible();

    const input = newdirModal.locator('[id="create-dir-input"]');
    await input.fill(testDirName);

    const confirmButton = newdirModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    const creationResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === "/dir/testdir"
    );
    await confirmButton.click();
    expect((await creationResponse).status()).toBe(500);

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
