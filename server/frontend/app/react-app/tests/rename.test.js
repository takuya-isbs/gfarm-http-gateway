const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromView,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockMoveRoute(page, { source, destination, statusCode = 200, mockResponse = {} }) {
    await mockRoute(page, `${API_URL}/**`, "POST", "/move", {
        validateBody: (body) => {
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

test("Should rename a file from the context menu", async ({ page }) => {
    const currentDirectory = "/";
    const testname = "python_code.py";
    const newName = "newname.py";

    await mockMoveRoute(page, {
        source: currentDirectory + testname,
        destination: currentDirectory + newName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromView(page, testname, "rename");

    const renameModal = page.locator('[data-testid="rename-modal"]');
    await expect(renameModal).toBeVisible();

    const input = renameModal.locator('[id="rename-input"]');
    await input.fill(newName);

    const confirmButton = renameModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
});

test("Should display an error notification when file rename fails", async ({ page }) => {
    const currentDirectory = "/";
    const testname = "python_code.py";
    const newName = "newname.py";

    await mockMoveRoute(page, {
        source: currentDirectory + testname,
        destination: currentDirectory + newName,
        statusCode: 500,
        contentType: "application/json",
        mockResponse: {
            detail: "error test",
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromView(page, testname, "rename");

    const renameModal = page.locator('[data-testid="rename-modal"]');
    await expect(renameModal).toBeVisible();

    const input = renameModal.locator('[id="rename-input"]');
    await input.fill(newName);

    const confirmButton = renameModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
