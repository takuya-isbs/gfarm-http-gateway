const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    mockMoveRoute,
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

test("Should move a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const testFileName = "meeting_notes.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId(`row-${testFileName}`)).toBeVisible();

    await clickMenuItemFromView(page, testFileName, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();

    await moveModal.locator('[id="move-dest-input"]').fill(destinationDirectory);

    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const moveRequest = page.waitForRequest(
        (req) => req.method() === "POST" && new URL(req.url()).pathname === "/move"
    );
    const moveResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/move"
    );
    await confirmButton.click();
    const req = await moveRequest;
    expect(req.postDataJSON()).toEqual({
        source: `${currentDirectory}/${testFileName}`,
        destination: `${destinationDirectory}/${testFileName}`,
    });
    expect((await moveResponse).status()).toBe(200);
    await expect(moveModal).not.toBeVisible();
    await expect(page.getByTestId(`row-${testFileName}`)).not.toBeVisible();
});

test("Should move multiple files from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const filesToMove = ["report.docx", "meeting_notes.txt"];

    const gate = createDeferred();
    const calls = await mockEndpoint(page, "POST", "/move", {
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

    for (const fileName of filesToMove) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();
    await moveModal.locator('[id="move-dest-input"]').fill(destinationDirectory);

    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(moveModal).not.toBeVisible();
    await expect(page.locator('[data-testid="global-overlay"]')).toBeVisible();

    await expect.poll(() => calls.length).toBe(1);
    gate.resolve();

    await expect(page.locator('[data-testid="global-overlay"]')).not.toBeVisible();
    await expect.poll(() => calls.length).toBe(filesToMove.length);

    const movedSources = new Set(calls.map((c) => c.json.source));
    expect(movedSources).toEqual(new Set(filesToMove.map((f) => `${currentDirectory}/${f}`)));
});

test("Should show name conflict prompt when destination has duplicate files", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/documents/documents";
    const filesToMove = ["report.docx", "meeting_notes.txt"];

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToMove) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();
    await moveModal.locator('[id="move-dest-input"]').fill(destinationDirectory);

    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(moveModal).not.toBeVisible();

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible();

    const duplicateFileName = overwriteModal.locator(`[id="current-${filesToMove[0]}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();
    const notDuplicateFileName = overwriteModal.locator(`[id="current-${filesToMove[1]}"]`);
    await expect(notDuplicateFileName).not.toBeVisible();

    const conflictConfirmButton = overwriteModal.locator('[data-testid="modal-button-confirm"]');
    await expect(conflictConfirmButton).toBeVisible();

    const moveRequest = page.waitForRequest(
        (req) => req.method() === "POST" && new URL(req.url()).pathname === "/move"
    );
    const moveResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/move"
    );
    await conflictConfirmButton.click();
    const req = await moveRequest;
    expect(req.postDataJSON()).toEqual({
        source: `${currentDirectory}/${filesToMove[1]}`,
        destination: `${destinationDirectory}/${filesToMove[1]}`,
    });
    expect((await moveResponse).status()).toBe(200);
    await expect(overwriteModal).not.toBeVisible();
    await expect(page.getByTestId(`row-${filesToMove[0]}`)).toBeVisible();
    await expect(page.getByTestId(`row-${filesToMove[1]}`)).not.toBeVisible();
});

test("Should display an error notification when move operation fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const testFileName = "meeting_notes.txt";

    const calls = await mockMoveRoute(page, {
        statusCode: 403,
        response: {
            detail: { command: "gfmv", message: "Permission denied", stdout: "", stderr: [] },
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();
    await moveModal.locator('[id="move-dest-input"]').fill(destinationDirectory);

    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();

    const moveResponse = page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/move"
    );
    await confirmButton.click();
    expect((await moveResponse).status()).toBe(403);
    expect(calls).toHaveLength(1);

    await expect(moveModal).not.toBeVisible();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("403");
    await expect(errorNotification).toContainText("Permission denied");
});

test("Should warn and skip API request when moving to the same directory", async ({ page }) => {
    const calls = await mockMoveRoute(page);

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);

    await clickMenuItemFromView(page, "meeting_notes.txt", "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();
    await moveModal.locator('[data-testid="modal-button-confirm"]').click();

    const notification = page.locator('[data-testid^="notification-"]');
    await expect(notification).toBeVisible();
    await expect(notification).toContainText("Destination is the same as current path");
    expect(calls).toHaveLength(0);
});
