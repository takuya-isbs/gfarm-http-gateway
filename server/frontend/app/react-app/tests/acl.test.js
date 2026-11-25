const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    setupApiMocks,
    mockEndpoint,
    clickMenuItemFromView,
    FRONTEND_URL,
    ACLIST,
    ROUTE_STORAGE,
} = require("./test_func");

let mockAclData = null;
let mockState = null;

async function assertEntry(index, entry, { acl_type, acl_name, acl_perms, is_default }, isDir) {
    await expect(entry.locator(`#acinfo-${index}-acl_type`)).toHaveValue(acl_type);
    if (acl_name !== null) {
        await expect(entry.locator(`#acinfo-${index}-acl_name`)).toHaveValue(acl_name);
    }
    for (const p of ["r", "w", "x"]) {
        const box = entry.locator(`input[id*="-${p}"]`);
        if (acl_perms[p]) {
            await expect(box).toBeChecked();
        } else {
            await expect(box).not.toBeChecked();
        }
    }

    if (isDir) {
        if (is_default) {
            await expect(entry.locator('input[id^="default-"]')).toBeChecked();
        } else if (acl_name !== null) {
            await expect(entry.locator('input[id^="default-"]')).not.toBeChecked();
        } else {
            await expect(entry.locator('input[id^="default-"]')).not.toBeVisible();
        }
    } else {
        await expect(entry.locator('input[id^="default-"]')).not.toBeVisible();
    }
}

// === Tests ===

test.beforeEach(async ({ context }) => {
    mockAclData = JSON.parse(fs.readFileSync(ACLIST, "utf-8"));
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should display all ACL entries for a file", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');
    const entries = acltab.locator("div.border.rounded.p-2.mb-2");
    await expect(entries).toHaveCount(mockAclData.length);

    for (let count = 0; count < mockAclData.length; count++) {
        await assertEntry(count, entries.nth(count), mockAclData[count], false);
    }
});

test("Should display default checkbox options for a directory ACL", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    await clickMenuItemFromView(page, "documents", "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');
    const entries = acltab.locator("div.border.rounded.p-2.mb-2");
    await expect(entries).toHaveCount(mockAclData.length);

    for (let count = 0; count < mockAclData.length; count++) {
        await assertEntry(count, entries.nth(count), mockAclData[count], true);
    }
});

test("Should add a new ACL entry and show user suggestions", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const newEntryType = "user";
    const newEntryName = "test";
    const expectedPath = `${currentDirectory}/${targetFile}`;

    const calls = await mockEndpoint(page, "PUT", `/acl${expectedPath}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const addEntryButton = acltab.locator('[data-testid="add-acl-button"]');
    await addEntryButton.scrollIntoViewIfNeeded();
    await addEntryButton.click();

    const entry = acltab.locator("div.border.rounded.p-2.mb-2").last();
    await entry.locator("select").selectOption(newEntryType);

    const nameInput = entry.locator(".form-control");
    await nameInput.click();
    await nameInput.fill("user");
    await expect(entry.locator("ul.list-group li", { hasText: "userA" })).toBeVisible();
    await nameInput.fill(newEntryName);

    await entry.locator('input[id*="-r"]').check();
    await entry.locator('input[id*="-w"]').check();
    await expect(entry.locator('input[id^="default-"]')).not.toBeVisible();

    const setButton = acltab.locator('[data-testid="update-acl-button"]');
    await expect(setButton).toBeVisible();

    const updateResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === `/acl${expectedPath}`
    );
    await setButton.click();
    expect((await updateResponse).status()).toBe(200);

    expect(calls).toHaveLength(1);
    const added = calls[0].json.acl.find(
        (item) => item.acl_type === newEntryType && item.acl_name === newEntryName
    );
    expect(added).toMatchObject({
        acl_type: newEntryType,
        acl_name: newEntryName,
        acl_perms: { r: true, w: true, x: false },
        is_default: false,
    });
});

test("Should add a new default ACL entry for a directory", async ({ page }) => {
    const currentDirectory = "/";
    const targetDir = "documents";
    const newEntryType = "user";
    const newEntryName = "test";
    const expectedPath = `/${targetDir}`;

    const calls = await mockEndpoint(page, "PUT", `/acl${expectedPath}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetDir, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const addEntryButton = acltab.locator('[data-testid="add-acl-button"]');
    await addEntryButton.scrollIntoViewIfNeeded();
    await addEntryButton.click();

    const entry = acltab.locator("div.border.rounded.p-2.mb-2").last();
    await entry.locator("select").selectOption(newEntryType);
    await entry.locator(".form-control").fill(newEntryName);
    await entry.locator('input[id*="-r"]').check();
    await entry.locator('input[id*="-w"]').check();
    await entry.locator('input[id^="default-"]').check();

    const setButton = acltab.locator('[data-testid="update-acl-button"]');
    await expect(setButton).toBeVisible();

    const updateResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === `/acl${expectedPath}`
    );
    await setButton.click();
    expect((await updateResponse).status()).toBe(200);

    expect(calls).toHaveLength(1);
    const added = calls[0].json.acl.find(
        (item) => item.acl_type === newEntryType && item.acl_name === newEntryName
    );
    expect(added).toMatchObject({
        acl_type: newEntryType,
        acl_name: newEntryName,
        acl_perms: { r: true, w: true, x: false },
        is_default: true,
    });
});

test("Should remove the selected ACL entry from the list and submit updated ACL", async ({
    page,
}) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const expectedPath = `${currentDirectory}/${targetFile}`;
    const removedName = mockAclData[3].acl_name;

    const calls = await mockEndpoint(page, "PUT", `/acl${expectedPath}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');
    const entry = acltab.locator("div.border.rounded.p-2.mb-2").nth(3);

    const deleteBtn = entry.locator(".btn-close");
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const entries = acltab.locator("div.border.rounded.p-2.mb-2");
    await expect(entries).toHaveCount(mockAclData.length - 1);

    for (let i = 0; i < mockAclData.length - 1; i++) {
        await expect(entries.nth(i).locator(".form-control")).not.toHaveValue(removedName);
    }

    const updateResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === `/acl${expectedPath}`
    );
    await acltab.locator('[data-testid="update-acl-button"]').click();
    expect((await updateResponse).status()).toBe(200);

    expect(calls).toHaveLength(1);
    expect(calls[0].json.acl).toHaveLength(mockAclData.length - 1);
    expect(calls[0].json.acl.some((item) => item.acl_name === removedName)).toBe(false);
});

test("Should display error notification when ACL update fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const expectedPath = `${currentDirectory}/${targetFile}`;

    const calls = await mockEndpoint(page, "PUT", `/acl${expectedPath}`, {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfsetfacl", message: "error test", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');
    const setButton = acltab.locator('[data-testid="update-acl-button"]');
    await expect(setButton).toBeVisible();

    const updateResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === `/acl${expectedPath}`
    );
    await setButton.click();
    expect((await updateResponse).status()).toBe(500);
    expect(calls).toHaveLength(1);

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
