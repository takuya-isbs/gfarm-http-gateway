const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    clickMenuItemFromView,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
    ROUTE_DOWNLOAD,
} = require("./test_func");

// === Tests ===

test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

// Copy link
test("Should display the WebUI link in the URL tab", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "url");

    const acltab = page.locator('[data-testid="url-tab"]');

    const input = acltab.locator("#webui-path-input");
    await expect(input).toBeVisible();

    await expect(input).toHaveValue(
        `${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}/${targetFile}`
    );
});

test("Should display the download link and allow access to the file via URL", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "url");

    const acltab = page.locator('[data-testid="url-tab"]');
    const input = acltab.locator("#download-path-input");
    await expect(input).toBeVisible();

    await expect(input).toHaveValue(
        `${FRONTEND_URL}/#${ROUTE_DOWNLOAD}${currentDirectory}/${targetFile}`
    );

    await page.goto(`${FRONTEND_URL}/#${ROUTE_DOWNLOAD}${currentDirectory}/${targetFile}`);
    await expect(page.locator("body")).toContainText(
        `This is the content of ${currentDirectory}/${targetFile}.`
    );
});

test("Should display the API resource URL for the selected file", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "url");

    const acltab = page.locator('[data-testid="url-tab"]');
    const input = acltab.locator("#resource-path-input");
    await expect(input).toBeVisible();

    await expect(input).toHaveValue(`${FRONTEND_URL}/file${currentDirectory}/${targetFile}`);
});
