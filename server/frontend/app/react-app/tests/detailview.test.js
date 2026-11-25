const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    findNodeByPath,
    clickMenuItemFromView,
    formatBytes,
    getTimeStr,
    symbolicToOctal,
    FRONTEND_URL,
    ROUTE_STORAGE,
    MOCK_NANOS,
} = require("./test_func");

let mockState = null;

async function closeDetailTab(page) {
    const sidepanel = page.locator(".custom-sidepanel");
    const closeButton = sidepanel.locator(".btn-close");
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(sidepanel).toHaveClass(/hide/);
}

function getExpectedDetailData(filePath) {
    const fileNode = findNodeByPath(mockState.fileStructure, filePath);
    if (!fileNode) return null;
    const d = new Date(fileNode.mtime_str);
    const sec = Math.floor(d.getTime() / 1000);

    return {
        File: fileNode.path,
        LinkPath: fileNode.linkname || null,
        Filetype: fileNode.is_sym
            ? "symbolic link"
            : fileNode.is_dir
              ? "directory"
              : "regular file",
        Size: fileNode.size,
        Mode: symbolicToOctal(fileNode.mode_str),
        Ncopy: "1",
        AccessSeconds: sec,
        ModifySeconds: sec,
        ChangeSeconds: sec,
        Uid: fileNode.uname,
        Gid: fileNode.gname,
        Cksum: "123456",
        CksumType: "test",
    };
}

// === Tests ===

test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should display all attributes for representative file and directory items", async ({
    page,
}) => {
    const currentDirectory = "/documents";
    const targets = ["report.docx", "presentations"];

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const name of targets) {
        const testFilePath = `${currentDirectory}/${name}`;
        await clickMenuItemFromView(page, name, "detail");

        const expected = getExpectedDetailData(testFilePath);
        await expect(page.locator('[data-testid="detail-Path"]').locator("td").nth(1)).toHaveText(
            expected.File
        );
        await expect(page.locator('[data-testid="detail-Type"]').locator("td").nth(1)).toHaveText(
            expected.Filetype
        );
        await expect(page.locator('[data-testid="detail-Size"]').locator("td").nth(1)).toHaveText(
            formatBytes(expected.Size)
        );
        await expect(page.locator('[data-testid="detail-Mode"]').locator("td").nth(1)).toHaveText(
            expected.Mode
        );
        await expect(page.locator('[data-testid="detail-Ncopy"]').locator("td").nth(1)).toHaveText(
            expected.Ncopy
        );
        await expect(page.locator('[data-testid="detail-Owner"]').locator("td").nth(1)).toHaveText(
            expected.Uid
        );
        await expect(page.locator('[data-testid="detail-Group"]').locator("td").nth(1)).toHaveText(
            expected.Gid
        );
        await expect(page.locator('[data-testid="detail-Access"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expected.AccessSeconds, "YMD", MOCK_NANOS)
        );
        await expect(page.locator('[data-testid="detail-Modify"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expected.ModifySeconds, "YMD", MOCK_NANOS)
        );
        await expect(page.locator('[data-testid="detail-Change"]').locator("td").nth(1)).toHaveText(
            getTimeStr(expected.ChangeSeconds, "YMD", MOCK_NANOS)
        );

        const digestCell = page.locator('[data-testid="detail-Digest"]').locator("td").nth(1);
        await expect(digestCell).toContainText(expected.Cksum);
        await expect(digestCell).toContainText(expected.CksumType);

        await closeDetailTab(page);
    }
});

test("Should display Link target and symbolic link type in the details panel", async ({ page }) => {
    const currentDirectory = "/symlinks";
    const symlinkName = "link_to_file";
    const testFilePath = `${currentDirectory}/${symlinkName}`;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await clickMenuItemFromView(page, symlinkName, "detail");

    const expected = getExpectedDetailData(testFilePath);
    await expect(page.locator('[data-testid="detail-Path"]').locator("td").nth(1)).toHaveText(
        expected.File
    );
    await expect(page.locator('[data-testid="detail-Link"]').locator("td").nth(1)).toHaveText(
        expected.LinkPath
    );
    await expect(page.locator('[data-testid="detail-Type"]').locator("td").nth(1)).toHaveText(
        "symbolic link"
    );

    await closeDetailTab(page);
});

test("Should display an error notification when fetching details fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    const calls = await mockEndpoint(page, "GET", `/attr${currentDirectory}/${targetFile}`, {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfstat", message: "stat failed", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await clickMenuItemFromView(page, targetFile, "detail");

    expect(calls).toHaveLength(1);
    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("stat failed");
});
