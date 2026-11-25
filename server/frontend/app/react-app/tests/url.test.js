const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    clickMenuItemFromView,
    FRONTEND_URL,
    ROUTE_STORAGE,
    ROUTE_DOWNLOAD,
} = require("./test_func");

let mockState = null;

// === Tests ===

test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should display the WebUI link in the URL tab", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "url");

    const urltab = page.locator('[data-testid="url-tab"]');
    const input = urltab.locator("#webui-path-input");
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

    const urltab = page.locator('[data-testid="url-tab"]');
    const input = urltab.locator("#download-path-input");
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

    const urltab = page.locator('[data-testid="url-tab"]');
    const input = urltab.locator("#resource-path-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(`${FRONTEND_URL}/file${currentDirectory}/${targetFile}`);
});

test("Should copy WebUI URL when Copy button is clicked", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
            value: {
                writeText: (text) => {
                    window.__copiedText = text;
                    return Promise.resolve();
                },
            },
            configurable: true,
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "url");

    const urltab = page.locator('[data-testid="url-tab"]');
    const copyButton = urltab.getByRole("button", { name: "Copy" }).first();
    await copyButton.click();

    await expect(urltab.getByRole("button", { name: "Copied!" })).toBeVisible();
    const copied = await page.evaluate(() => window.__copiedText);
    expect(copied).toBe(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}/${targetFile}`);
});

test("Should hide download and API resource URLs for directories", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    await clickMenuItemFromView(page, "documents", "url");

    const urltab = page.locator('[data-testid="url-tab"]');
    await expect(urltab.locator("#webui-path-input")).toBeVisible();
    await expect(urltab.locator("#download-path-input")).not.toBeVisible();
    await expect(urltab.locator("#resource-path-input")).not.toBeVisible();
});
