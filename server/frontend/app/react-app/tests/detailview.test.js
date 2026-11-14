const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    findChildrenByPath,
    findNodeByPath,
    clickMenuItemFromView,
    formatBytes,
    getTimeStr,
    symbolicToOctal,
    handleRoute,
    FRONTEND_URL,
    API_URL,
    DIR_LIST,
    ROUTE_STORAGE,
} = require("./test_func");

let fileStructureData = null;

async function closeDetailTab(page) {
    const sidepanel = page.locator(".custom-sidepanel");
    const closeButton = sidepanel.locator(".btn-close");
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(page.locator(".custom-sidepanel.hide")).toBeVisible();
}

// === Tests ===

test.beforeEach(async ({ context }) => {
    fileStructureData = JSON.parse(fs.readFileSync(DIR_LIST, "utf-8"));
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

const getExpectedDetailData = (filePath) => {
    const fileNode = findNodeByPath(fileStructureData, filePath);
    if (!fileNode) return null;
    const d = new Date(fileNode.mtime_str);

    return {
        File: fileNode.name,
        Filetype: fileNode.name.includes(".")
            ? fileNode.name.split(".").pop()
            : fileNode.is_file
              ? "regular file"
              : "directory",
        Size: fileNode.size,
        Mode: fileNode.mode_str,
        Access: fileNode.mtime_str,
        AccessSeconds: d.getTime() / 1000,
        Modify: fileNode.mtime_str,
        ModifySeconds: d.getTime() / 1000,
        Change: fileNode.mtime_str,
        ChangeSeconds: d.getTime() / 1000,
        Uid: fileNode.uname, // Use 'uname'
        Gid: fileNode.gname, // Use 'gname'
        MetadataHost: "test-host.local",
        MetadataPort: 8080,
        MetadataUser: "testuser",
        Cksum: "123456",
        CksumType: "test",
    };
};

// === Tests ===

test("Should display file name in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Path"]').locator("td").nth(1)).toHaveText(
            expectedDetail.File
        );

        await closeDetailTab(page);
    }
});

test("Should display file type in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Type"]').locator("td").nth(1)).toHaveText(
            expectedDetail.Filetype
        );

        await closeDetailTab(page);
    }
});

test("Should display file size in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Size"]').locator("td").nth(1)).toHaveText(
            formatBytes(expectedDetail.Size, false)
        );

        await closeDetailTab(page);
    }
});

test("Should display permissions in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Mode"]').locator("td").nth(1)).toHaveText(
            symbolicToOctal(expectedDetail.Mode)
        );

        await closeDetailTab(page);
    }
});

test("Should display last access time in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Access"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expectedDetail.AccessSeconds, "YMD", true)
        );

        await closeDetailTab(page);
    }
});

test("Should display last modified time in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Modify"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expectedDetail.ModifySeconds, "YMD", true)
        );

        await closeDetailTab(page);
    }
});

test("Should display change time in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Change"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expectedDetail.ChangeSeconds, "YMD", true)
        );

        await closeDetailTab(page);
    }
});

test("Should display file owner (UID) in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Owner"]').locator("td").nth(1)).toHaveText(
            expectedDetail.Uid
        );

        await closeDetailTab(page);
    }
});

test("Should display file group (GID) in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Group"]').locator("td").nth(1)).toHaveText(
            expectedDetail.Gid
        );

        await closeDetailTab(page);
    }
});

test("Should display cksum in the details panel", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedChildren = findChildrenByPath(fileStructureData, currentDirectory);
    for (const expectedFile of expectedChildren) {
        const testFilePath = `${currentDirectory}/${expectedFile.name}`;

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
        await clickMenuItemFromView(page, expectedFile.name, "detail");

        const expectedDetail = getExpectedDetailData(testFilePath);
        await expect(
            page.locator('[data-testid="detail-Digest"]').locator("td").nth(1)
        ).toContainText(expectedDetail.Cksum);
        await expect(
            page.locator('[data-testid="detail-Digest"]').locator("td").nth(1)
        ).toContainText(expectedDetail.CksumType);

        await closeDetailTab(page);
    }
});
