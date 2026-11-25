const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    findNodeByPath,
    clickMenuItemFromView,
    symbolicToOctal,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

async function openPermsTab(page, currentDir, filename) {
    await clickMenuItemFromView(page, filename, "permissions");

    const permstab = page.locator('[data-testid="perms-tab"]');
    const fileNode = findNodeByPath(mockState.fileStructure, `${currentDir}/${filename}`);
    const octalInput = permstab.locator("#perms-octal-input");
    await expect(octalInput).toHaveValue(symbolicToOctal(fileNode.mode_str));
    return { permstab, octalInput };
}

async function setOctal(page, currentDir, filename, octal) {
    const { permstab, octalInput } = await openPermsTab(page, currentDir, filename);
    await octalInput.fill(octal);

    const setButton = permstab.locator('[data-testid="update-perms-button"]');
    await expect(setButton).toBeVisible();

    const filepath = `${currentDir}/${filename}`;
    const updateResponse = page.waitForResponse(
        (res) =>
            res.request().method() === "PUT" && new URL(res.url()).pathname === `/attr${filepath}`
    );
    await setButton.click();
    return await updateResponse;
}

// === Tests ===

test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should update file permissions using the octal input", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const filepath = `${currentDirectory}/${targetFile}`;
    const expectedMode = "777";

    const calls = await mockEndpoint(page, "PUT", `/attr${filepath}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const response = await setOctal(page, currentDirectory, targetFile, expectedMode);
    expect(response.status()).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({ Mode: expectedMode });
});

test("Should apply the sticky bit when updating a directory's permissions", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetDir = "documents";
    const filepath = `${currentDirectory}/${targetDir}`;
    const expectedMode = "1777";

    const calls = await mockEndpoint(page, "PUT", `/attr${filepath}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const response = await setOctal(page, currentDirectory, targetDir, expectedMode);
    expect(response.status()).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({ Mode: expectedMode });
});

test("Should sync checkboxes with octal input and hide sticky bit for files", async ({ page }) => {
    const currentDirectory = "/documents";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const { permstab, octalInput } = await openPermsTab(page, currentDirectory, "report.docx");
    await expect(permstab.locator("#perm-sticky")).not.toBeVisible();

    await permstab.locator("#perm-owner-x").check();
    await permstab.locator("#perm-group-w").check();
    await expect(octalInput).toHaveValue("764");

    await octalInput.fill("600");
    await expect(permstab.locator("#perm-owner-r")).toBeChecked();
    await expect(permstab.locator("#perm-owner-w")).toBeChecked();
    await expect(permstab.locator("#perm-owner-x")).not.toBeChecked();
    await expect(permstab.locator("#perm-group-r")).not.toBeChecked();
});

test("Should display an error notification when permission update fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetDir = "documents";
    const filepath = `${currentDirectory}/${targetDir}`;
    const expectedMode = "1777";

    const calls = await mockEndpoint(page, "PUT", `/attr${filepath}`, {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfchmod", message: "error test", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const response = await setOctal(page, currentDirectory, targetDir, expectedMode);
    expect(response.status()).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toEqual({ Mode: expectedMode });

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
