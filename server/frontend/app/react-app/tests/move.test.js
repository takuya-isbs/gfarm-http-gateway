const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    clickMenuItemFromView,
    clickMenuItemFromMenu,
    checkItem,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockMoveRoute(page, { source, destination, statusCode = 200, mockResponse = {} }) {
    await mockRoute(page, `${API_URL}/**`, "POST", "/move", {
        validateBody: (body) => {
            expect(typeof body.source).toBe("string");
            expect(typeof body.destination).toBe("string");
            if (source) expect(body.source).toBe(source);
            if (destination) expect(body.destination).toBe(destination);
        },
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should move a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const testFileName = "meeting_notes.txt";

    await mockMoveRoute(page, {
        source: currentDirectory + "/" + testFileName,
        destination: destinationDirectory + "/" + testFileName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();

    const destdirInput = moveModal.locator('[id="move-dest-input"]');
    await destdirInput.fill(destinationDirectory);

    await page.waitForTimeout(100);

    // Click confirm
    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(moveModal).not.toBeVisible();
});

test("Should move multiple files from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const filesToMove = ["report.docx", "meeting_notes.txt"];

    const seen = [];
    await page.route(`${API_URL}/move`, async (route) => {
        console.log(`[ROUTE MOCK] Simulating move`);
        const request = route.request();
        const body = request.postDataJSON();

        seen.push(body.source);
        await page.waitForTimeout(1000);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToMove) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();

    const destdirInput = moveModal.locator('[id="move-dest-input"]');
    await destdirInput.fill(destinationDirectory);

    await page.waitForTimeout(100);

    // Click confirm
    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(moveModal).not.toBeVisible();

    // Should show deleting overlay
    await expect(page.locator('[data-testid="global-overlay"]')).toBeVisible();
    await expect(page.locator('[data-testid="global-overlay"]')).not.toBeVisible();

    // Wait until exactly N POST /move requests were made (one per file)
    await expect.poll(() => seen.length, { timeout: 5000 }).toBe(filesToMove.length);
    const seenNames = new Set(seen.map((b) => b.split("/").pop()));
    expect(seenNames).toEqual(new Set(filesToMove));
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

    const destdirInput = moveModal.locator('[id="move-dest-input"]');
    await destdirInput.fill(destinationDirectory);

    await page.waitForTimeout(100);

    // Click confirm
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

    const conflict_confirmButton = overwriteModal.locator('[data-testid="modal-button-confirm"]');
    await expect(conflict_confirmButton).toBeVisible();
    await conflict_confirmButton.click();

    await expect(overwriteModal).not.toBeVisible();
});

test("Should display an error notification when move operation fails", async ({ page }) => {
    const currentDirectory = "/documents";
    const destinationDirectory = "/images";
    const testFileName = "meeting_notes.txt";

    await mockMoveRoute(page, {
        source: currentDirectory + "/" + testFileName,
        destination: destinationDirectory + "/" + testFileName,
        statusCode: 403,
        contentType: "application/json",
        mockResponse: {
            detail: { message: "Permission denied", stdout: "", stderr: "" },
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "move");

    const moveModal = page.locator('[data-testid="move-modal"]');
    await expect(moveModal).toBeVisible();

    const destdirInput = moveModal.locator('[id="move-dest-input"]');
    await destdirInput.fill(destinationDirectory);

    await page.waitForTimeout(100);

    // Click confirm
    const confirmButton = moveModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(moveModal).not.toBeVisible();

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("403");
    await expect(errorNotification).toContainText("Permission denied");
});
