const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    createDeferred,
    clickMenuItemFromView,
    clickMenuItemFromMenu,
    checkItem,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should delete a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedPath = `/file${currentDirectory}/${testFileName}`;

    const gate = createDeferred();
    const calls = await mockEndpoint(page, "DELETE", expectedPath, {
        onRequest: async (route) => {
            await gate.promise;
            await route.fulfill({
                status: 200,
                contentType: "text/plain",
                body: "",
            });
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal).toContainText(testFileName);

    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(deleteModal).not.toBeVisible();
    await expect(page.locator('[data-testid="global-overlay"]')).toBeVisible();

    await expect.poll(() => calls.length).toBe(1);
    gate.resolve();

    await expect(page.locator('[data-testid="global-overlay"]')).not.toBeVisible();
    expect(calls).toHaveLength(1);
});

test("Should delete multiple files from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const filesToDelete = ["report.docx", "meeting_notes.txt"];

    const deletedPaths = [];
    await page.route("**/file/**", async (route, request) => {
        if (request.method() !== "DELETE") {
            return await route.fallback();
        }
        deletedPaths.push(decodeURIComponent(new URL(request.url()).pathname));
        return await route.fallback();
    });

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

    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(deleteModal).not.toBeVisible();
    await expect.poll(() => deletedPaths.length).toBe(filesToDelete.length);
    expect(new Set(deletedPaths)).toEqual(
        new Set(filesToDelete.map((f) => `/file${currentDirectory}/${f}`))
    );
    for (const fileName of filesToDelete) {
        await expect(page.getByTestId(`row-${fileName}`)).not.toBeVisible();
    }
});

test("Should delete a directory recursively from the context menu", async ({ page }) => {
    const currentDirectory = "/";
    const targetDir = "documents";

    const calls = await mockEndpoint(page, "DELETE", `/file/${targetDir}`, {
        statusCode: 200,
        contentType: "text/plain",
        response: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, targetDir, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal).toContainText(targetDir);
    await expect(deleteModal).toContainText("and its contents");

    const deleteResponse = page.waitForResponse(
        (res) =>
            res.request().method() === "DELETE" &&
            new URL(res.url()).pathname === `/file/${targetDir}`
    );
    await page.locator('[data-testid="modal-button-confirm"]').click();
    expect((await deleteResponse).status()).toBe(200);

    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get("force")).toBe("on");
    expect(calls[0].searchParams.get("recursive")).toBe("on");
    await expect(deleteModal).not.toBeVisible();
});

test("Should display an error notification when file deletion fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";
    const expectedPath = `/file${currentDirectory}/${testFileName}`;

    const calls = await mockEndpoint(page, "DELETE", expectedPath, {
        statusCode: 403,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfrm", message: "Permission denied", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "delete");

    const deleteModal = page.locator('[data-testid="delete-modal"]');
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal).toContainText(testFileName);

    const deleteResponse = page.waitForResponse(
        (res) => res.request().method() === "DELETE" && new URL(res.url()).pathname === expectedPath
    );
    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    expect((await deleteResponse).status()).toBe(403);
    expect(calls).toHaveLength(1);
    await expect(deleteModal).not.toBeVisible();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("403");
    await expect(errorNotification).toContainText("Permission denied");
});
