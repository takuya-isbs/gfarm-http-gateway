const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    clickMenuItemFromNewMenu,
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

test("Should create a symbolic link to a file from the New menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/documents/symlink";
    const testFileName = "meeting_notes.txt";
    const expectedSource = `${currentDirectory}/${testFileName}`;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testFileName}`)).toBeVisible();

    await clickMenuItemFromNewMenu(page, "create-symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    await newsymModal.locator('[id="symlink-target-input"]').fill(expectedSource);
    await newsymModal.locator('[id="symlink-linkname-input"]').fill(destination);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const symlinkRequest = page.waitForRequest(
        (req) => req.method() === "POST" && new URL(req.url()).pathname === "/symlink"
    );
    const symlinkResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/symlink"
    );
    await confirmButton.click();
    const req = await symlinkRequest;
    expect(req.postDataJSON()).toEqual({
        source: expectedSource,
        destination,
    });
    expect((await symlinkResponse).status()).toBe(200);
    await expect(newsymModal).not.toBeVisible();
    await expect(page.getByTestId("row-symlink")).toBeVisible();
});

test("Should create a symbolic link to a directory from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/documents/symlink";
    const testDirName = "documents";
    const expectedSource = `${currentDirectory}/${testDirName}`;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testDirName}`)).toBeVisible();

    await clickMenuItemFromView(page, testDirName, "symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    await newsymModal.locator('[id="symlink-linkname-input"]').fill(destination);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const symlinkRequest = page.waitForRequest(
        (req) => req.method() === "POST" && new URL(req.url()).pathname === "/symlink"
    );
    const symlinkResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/symlink"
    );
    await confirmButton.click();
    const req = await symlinkRequest;
    expect(req.postDataJSON()).toEqual({
        source: expectedSource,
        destination,
    });
    expect((await symlinkResponse).status()).toBe(200);
    await expect(newsymModal).not.toBeVisible();
    await expect(page.getByTestId("row-symlink")).toBeVisible();
});

test("Should display an error notification when symlink creation fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/documents/symlink";
    const testDirName = "documents";
    const expectedSource = `${currentDirectory}/${testDirName}`;

    const calls = await mockEndpoint(page, "POST", "/symlink", {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfln", message: "error test", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testDirName}`)).toBeVisible();

    await clickMenuItemFromView(page, testDirName, "symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    await newsymModal.locator('[id="symlink-linkname-input"]').fill(destination);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const symlinkResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/symlink"
    );
    await confirmButton.click();
    expect((await symlinkResponse).status()).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({
        source: expectedSource,
        destination,
    });

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});

test("Should warn and skip API request when symlink target is missing", async ({ page }) => {
    const calls = await mockEndpoint(page, "POST", "/symlink");

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

    await clickMenuItemFromNewMenu(page, "create-symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();
    await newsymModal.locator('[id="symlink-linkname-input"]').fill("/documents/new_sym");
    await newsymModal.locator('[data-testid="modal-button-confirm"]').click();

    const notification = page.locator('[data-testid^="notification-"]');
    await expect(notification).toBeVisible();
    await expect(notification).toContainText("All fields are required");
    expect(calls).toHaveLength(0);
});
