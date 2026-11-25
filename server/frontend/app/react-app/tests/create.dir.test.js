const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    clickMenuItemFromNewMenu,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should create a new directory from the New menu", async ({ page }) => {
    const currentDirectory = "/";
    const testDirName = "testdir";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

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
    await expect(newdirModal).not.toBeVisible();
    await expect(page.getByTestId(`row-${testDirName}`)).toBeVisible();
});

test("Should display an error notification when directory creation fails", async ({ page }) => {
    const currentDirectory = "/";
    const testDirName = "testdir";

    const calls = await mockEndpoint(page, "PUT", `/dir/${testDirName}`, {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfmkdir", message: "error test", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

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
    expect(calls).toHaveLength(1);

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});

test("Should warn and skip API request for invalid directory name", async ({ page }) => {
    const calls = await mockEndpoint(page, "PUT", null, {
        match: (_url, decodedPath) => decodedPath.startsWith("/dir/"),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

    await clickMenuItemFromNewMenu(page, "create-directory");

    const newdirModal = page.locator('[data-testid="newdir-modal"]');
    await expect(newdirModal).toBeVisible();

    await newdirModal.locator('[id="create-dir-input"]').fill("bad/name");
    await newdirModal.locator('[data-testid="modal-button-confirm"]').click();

    const notification = page.locator('[data-testid^="notification-"]');
    await expect(notification).toBeVisible();
    await expect(notification).toContainText("Invalid name");
    expect(calls).toHaveLength(0);
});
