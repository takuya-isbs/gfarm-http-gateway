// tests/test_perms_tab.spec.js

const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    mockRoute,
    findNodeByPath,
    clickMenuItemFromView,
    symbolicToOctal,
    API_URL,
    FRONTEND_URL,
    DIR_LIST,
    ROUTE_STORAGE,
} = require("./test_func");

let fileStructureData = null;

async function mockAttrRoute(
    page,
    {
        filepath,
        expectedMode,
        mockResponse = { message: "Attribute updated" },
        statusCode = 200,
    } = {}
) {
    await mockRoute(page, `${API_URL}/**`, "PUT", "/attr" + filepath, {
        validateBody: (body) => {
            expect(typeof body.Mode).toBe("string");
            if (expectedMode) expect(body.Mode).toBe(expectedMode);
        },
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

const getExpectedPermsData = (filePath) => {
    const fileNode = findNodeByPath(fileStructureData, filePath);
    if (!fileNode) return null;

    return symbolicToOctal(fileNode.mode_str);
};

async function setOctal(page, currentdir, filename, octal) {
    await clickMenuItemFromView(page, filename, "permissions");

    const permstab = page.locator('[data-testid="perms-tab"]');

    const octalInput = permstab.locator("#perms-octal-input");
    await expect(octalInput).toHaveValue(getExpectedPermsData(currentdir + "/" + filename));
    await octalInput.fill(octal);

    const set_button = permstab.locator('[data-testid="update-perms-button"]');
    await expect(set_button).toBeVisible();
    await set_button.click();
}

// === Tests ===

test.beforeEach(async () => {
    fileStructureData = JSON.parse(fs.readFileSync(DIR_LIST, "utf-8"));
});

test("Should update file permissions using the octal input", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const filepath = currentDirectory + "/" + targetFile;
    const expectedMode = "777";

    await mockAttrRoute(page, {
        filepath: filepath,
        expectedMode: expectedMode,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await setOctal(page, currentDirectory, targetFile, expectedMode);
});

test("Should apply the sticky bit when updating a directory's permissions", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "documents";
    const filepath = currentDirectory + "/" + targetFile;
    const expectedMode = "1777";

    await mockAttrRoute(page, {
        filepath: filepath,
        expectedMode: expectedMode,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await setOctal(page, currentDirectory, targetFile, expectedMode);
});

test("Should display an error notification when permission update fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "documents";
    const filepath = currentDirectory + "/" + targetFile;
    const expectedMode = "1777";

    await mockAttrRoute(page, {
        filepath: filepath,
        expectedMode: expectedMode,
        mockResponse: { detail: "error test" },
        statusCode: 500,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await setOctal(page, currentDirectory, targetFile, expectedMode);

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
