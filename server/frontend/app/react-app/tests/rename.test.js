const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockMoveRoute,
    clickMenuItemFromView,
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

test("Should rename a file from the context menu", async ({ page }) => {
    const currentDirectory = "/";
    const testName = "python_code.py";
    const newName = "newname.py";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testName}`)).toBeVisible();

    await clickMenuItemFromView(page, testName, "rename");

    const renameModal = page.locator('[data-testid="rename-modal"]');
    await expect(renameModal).toBeVisible();

    const input = renameModal.locator('[id="rename-input"]');
    await input.fill(newName);

    const confirmButton = renameModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const moveRequest = page.waitForRequest(
        (req) => req.method() === "POST" && new URL(req.url()).pathname === "/move"
    );
    const moveResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/move"
    );
    await confirmButton.click();
    const req = await moveRequest;
    expect(req.postDataJSON()).toEqual({
        source: `${currentDirectory}${testName}`,
        destination: `${currentDirectory}${newName}`,
    });
    expect((await moveResponse).status()).toBe(200);
    await expect(renameModal).not.toBeVisible();
    await expect(page.getByTestId(`row-${newName}`)).toBeVisible();
    await expect(page.getByTestId(`row-${testName}`)).not.toBeVisible();
});

test("Should display an error notification when file rename fails", async ({ page }) => {
    const currentDirectory = "/";
    const testName = "python_code.py";
    const newName = "newname.py";

    const calls = await mockMoveRoute(page, {
        statusCode: 500,
        response: {
            detail: { command: "gfmv", message: "error test", stdout: "", stderr: [] },
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testName}`)).toBeVisible();

    await clickMenuItemFromView(page, testName, "rename");

    const renameModal = page.locator('[data-testid="rename-modal"]');
    await expect(renameModal).toBeVisible();

    await renameModal.locator('[id="rename-input"]').fill(newName);

    const confirmButton = renameModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const moveResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/move"
    );
    await confirmButton.click();
    expect((await moveResponse).status()).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({
        source: `${currentDirectory}${testName}`,
        destination: `${currentDirectory}${newName}`,
    });

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});

test("Should warn and skip API request for invalid rename input", async ({ page }) => {
    const calls = await mockMoveRoute(page);

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);
    await expect(page.getByTestId("row-python_code.py")).toBeVisible();

    await clickMenuItemFromView(page, "python_code.py", "rename");

    const renameModal = page.locator('[data-testid="rename-modal"]');
    await expect(renameModal).toBeVisible();
    await renameModal.locator('[id="rename-input"]').fill("bad/name.py");
    await renameModal.locator('[data-testid="modal-button-confirm"]').click();

    const notification = page.locator('[data-testid^="notification-"]');
    await expect(notification).toBeVisible();
    await expect(notification).toContainText("Invalid name");
    expect(calls).toHaveLength(0);
});
