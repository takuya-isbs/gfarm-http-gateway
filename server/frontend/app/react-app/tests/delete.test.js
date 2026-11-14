const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromView,
    clickMenuItemFromMenu,
    checkItem,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should delete a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    await page.route(`${API_URL}/file${currentDirectory}/${testFileName}`, async (route) => {
        console.log(`[ROUTE MOCK] Simulating delayed delete for: ${testFileName}`);
        await page.waitForTimeout(1000);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();

    await expect(deleteModal).toContainText(testFileName);

    // Click confirm
    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(deleteModal).not.toBeVisible();

    // Should show deleting overlay
    await expect(page.locator('[data-testid="global-overlay"]')).toBeVisible();
    await expect(page.locator('[data-testid="global-overlay"]')).not.toBeVisible();
});

test("Should delete multiple files from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const filesToDelete = ["report.docx", "meeting_notes.txt"];

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToDelete) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();

    for (const fileName of filesToDelete) {
        await expect(deleteModal).toContainText(fileName);
    }

    // Click confirm
    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(deleteModal).not.toBeVisible();
});

test("Should display an error notification when file deletion fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    await await mockRoute(
        page,
        `${API_URL}/**`,
        "DELETE",
        `/file${currentDirectory}/${testFileName}`,
        {
            statusCode: 403,
            contentType: "application/json",
            response: JSON.stringify({
                detail: { message: "Permission denied", stdout: "", stderr: "" },
            }),
        }
    );

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();

    await expect(deleteModal).toContainText(testFileName);

    // Click confirm
    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(deleteModal).not.toBeVisible();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("403");
    await expect(errorNotification).toContainText("Permission denied");
});
