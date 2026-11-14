const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromView,
    API_URL,
    FRONTEND_URL,
    ACLIST,
    ROUTE_STORAGE,
} = require("./test_func");

let mockAclData = null;

async function mockAclUpdateRoute(
    page,
    { filepath, expectedAclList, statusCode = 200, mockResponse = { message: "ACL updated" } }
) {
    await mockRoute(page, `${API_URL}/**`, "PUT", "/acl" + filepath, {
        validateBody: (body) => {
            const aclList = body.acl;

            for (const expected of expectedAclList) {
                const match = aclList.find((received) => {
                    if (
                        received.acl_type !== expected.acl_type ||
                        received.acl_name !== expected.acl_name ||
                        received.is_default !== expected.is_default
                    ) {
                        return false;
                    }

                    return (
                        received.acl_perms.r === expected.acl_perms.r &&
                        received.acl_perms.w === expected.acl_perms.w &&
                        received.acl_perms.x === expected.acl_perms.x
                    );
                });

                expect(match).toBeDefined();
            }
        },
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

async function assertEntry(index, entry, { acl_type, acl_name, acl_perms, is_default, is_dir }) {
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

    if (is_dir) {
        if (is_default) {
            const def = entry.locator('input[id^="default-"]');
            await expect(def).toBeChecked();
        } else if (acl_name !== null) {
            const def = entry.locator('input[id^="default-"]');
            await expect(def).not.toBeChecked();
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
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should display all ACL entries for a file", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    let count = 0;
    for (const data of mockAclData) {
        console.debug("data", data);
        const entry = acltab.locator("div.border.rounded.p-2.mb-2").nth(count);
        await assertEntry(count, entry, data);
        count++;
    }
});

test("Should add a new ACL entry", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const newentry_type = "user";
    const ewentry_name = "test";
    const expectedAclList = [
        {
            acl_type: newentry_type,
            acl_name: ewentry_name,
            acl_perms: {
                r: true,
                w: true,
                x: false,
            },
            is_default: false,
        },
    ];

    await mockAclUpdateRoute(page, {
        filepath: currentDirectory + "/" + targetFile,
        expectedAclList: expectedAclList,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const addEntryButton = acltab.locator('[data-testid="add-acl-button"]');
    await addEntryButton.scrollIntoViewIfNeeded();
    await addEntryButton.click();

    const entry = acltab.locator("div.border.rounded.p-2.mb-2").last();

    const typeSelect = entry.locator("select");
    await typeSelect.selectOption(newentry_type);

    const nameInput = entry.locator(".form-control");
    await nameInput.fill(ewentry_name);

    const r_box = entry.locator('input[id*="-r"]');
    const w_box = entry.locator('input[id*="-w"]');

    await r_box.check();
    await w_box.check();
    await expect(entry.locator('input[id^="default-"]')).not.toBeVisible();

    const set_button = acltab.locator('[data-testid="update-acl-button"]');
    await expect(set_button).toBeVisible();
    await set_button.click();
});

test("Should add a new default ACL entry for a directory", async ({ page }) => {
    const currentDirectory = "/";
    const targetFile = "documents";
    const newentry_type = "user";
    const ewentry_name = "test";
    const expectedAclList = [
        {
            acl_type: newentry_type,
            acl_name: ewentry_name,
            acl_perms: {
                r: true,
                w: true,
                x: false,
            },
            is_default: true,
        },
    ];

    await mockAclUpdateRoute(page, {
        filepath: currentDirectory + "/" + targetFile,
        expectedAclList: expectedAclList,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const addEntryButton = acltab.locator('[data-testid="add-acl-button"]');
    await addEntryButton.scrollIntoViewIfNeeded();
    await addEntryButton.click();

    const entry = acltab.locator("div.border.rounded.p-2.mb-2").last();

    const typeSelect = entry.locator("select");
    await typeSelect.selectOption(newentry_type);

    const nameInput = entry.locator(".form-control");
    await nameInput.fill(ewentry_name);

    const r_box = entry.locator('input[id*="-r"]');
    const w_box = entry.locator('input[id*="-w"]');
    const d_box = entry.locator('input[id^="default-"]');

    await r_box.check();
    await w_box.check();
    await d_box.check();

    const set_button = acltab.locator('[data-testid="update-acl-button"]');
    await expect(set_button).toBeVisible();
    await set_button.click();
});

test("Should remove the selected ACL entry from the list", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const entry = acltab.locator("div.border.rounded.p-2.mb-2").nth(3);

    const deleteBtn = entry.locator(".btn-close");
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const entries = acltab.locator("div.border.rounded.p-2.mb-2");

    for (let i = 0; i < mockAclData.length - 1; i++) {
        await expect(entries.nth(i).locator(".form-control")).not.toHaveValue(
            mockAclData[3].acl_name
        );
    }
});

test("Should display error notification when ACL update fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const targetFile = "report.docx";
    const expectedAclList = [
        {
            acl_type: "user",
            acl_name: null,
            acl_perms: {
                r: true,
                w: true,
                x: true,
            },
            is_default: false,
        },
    ];

    await mockAclUpdateRoute(page, {
        filepath: currentDirectory + "/" + targetFile,
        expectedAclList: expectedAclList,
        mockResponse: { detail: "error test" },
        statusCode: 500,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetFile, "acl");

    const acltab = page.locator('[data-testid="acl-tab"]');

    const set_button = acltab.locator('[data-testid="update-acl-button"]');
    await expect(set_button).toBeVisible();
    await set_button.click();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});
