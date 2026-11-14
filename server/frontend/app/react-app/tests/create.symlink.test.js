const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromNewMenu,
    clickMenuItemFromView,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockSymlinkRoute(
    page,
    { source, destination, statusCode = 200, mockResponse = {} }
) {
    await mockRoute(page, `${API_URL}/**`, "POST", "/symlink", {
        validateBody: (body) => {
            console.log("body.source", body.source);
            console.log("body.destination", body.destination);
            expect(typeof body.source).toBe("string");
            expect(typeof body.destination).toBe("string");
            if (source) expect(body.source).toBe(source);
            if (destination) expect(body.destination).toBe(destination);
        },
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should create a symbolic link to a file from the New menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/symlink";
    const testFileName = "meeting_notes.txt";

    await mockSymlinkRoute(page, {
        source: currentDirectory + "/" + testFileName,
        destination: destination,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromNewMenu(page, "create-symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    const srcInput = newsymModal.locator('[id="symlink-target-input"]');
    await srcInput.fill(currentDirectory + "/" + testFileName);

    const destInput = newsymModal.locator('[id="symlink-linkname-input"]');
    await destInput.fill(destination);

    await page.waitForTimeout(100);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
});

test("Should create a symbolic link to a directory from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/symlink";
    const testDirName = "documents";

    await mockSymlinkRoute(page, {
        source: currentDirectory + "/" + testDirName,
        destination: destination,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromView(page, testDirName, "symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    const destInput = newsymModal.locator('[id="symlink-linkname-input"]');
    await destInput.fill(destination);

    await page.waitForTimeout(100);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
});

test("Should display an error notification when symlink creation fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const destination = "/symlink";
    const testDirName = "documents";

    await mockSymlinkRoute(page, {
        source: currentDirectory + "/" + testDirName,
        destination: destination,
        statusCode: 500,
        mockResponse: { detail: "error test" },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromView(page, testDirName, "symlink");

    const newsymModal = page.locator('[data-testid="newsym-modal"]');
    await expect(newsymModal).toBeVisible();

    const destInput = newsymModal.locator('[id="symlink-linkname-input"]');
    await destInput.fill(destination);

    await page.waitForTimeout(100);

    const confirmButton = newsymModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
