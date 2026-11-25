const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    createDeferred,
    checkItem,
    clickMenuItemFromMenu,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

const currentDirectory = "/documents";
const exportDirectory = "/archives";
const filesToGfptar = ["report.docx", "meeting_notes.txt"];
const archiveName = "/test-archive";

let mockState = null;

async function waitForProgressView(
    page,
    expectedFileName,
    expectedMessage,
    expectedStatus = "completed"
) {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-gfptar"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator("h6")).toContainText(expectedFileName);

    const progressBar = taskCard.locator(".progress-bar");
    await expect(progressBar).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText(expectedStatus);

    if (expectedMessage !== undefined) {
        const message = taskCard.locator(`[data-testid^="task-message-"]`);
        await expect(message).toContainText(expectedMessage);
    }
    return taskCard;
}

function assertGfptarBody(
    body,
    { expectedCommand, expectedBasedir, expectedOutdir, expectedSources, expectedOptions }
) {
    expect(typeof body.command).toBe("string");
    expect(typeof body.basedir).toBe("string");
    expect(typeof body.outdir).toBe("string");
    expect(Array.isArray(body.source)).toBe(true);

    if (body.options !== null && body.options !== undefined) {
        expect(Array.isArray(body.options)).toBe(true);
        for (const opt of body.options) {
            expect(typeof opt).toBe("string");
        }
    }

    if (expectedCommand) expect(body.command).toBe(expectedCommand);
    if (expectedBasedir) expect(body.basedir).toBe(expectedBasedir);
    if (expectedOutdir !== undefined) expect(body.outdir).toBe(expectedOutdir);
    if (expectedSources) {
        expect(body.source).toEqual(expectedSources);
    }
    if (expectedOptions) {
        expect(body.options).toEqual(expectedOptions);
    }
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should create an archive from selected files with options", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ message: expectedMessage }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-create"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    await gfptarModal.locator('[id="option-input"]').fill("--jobs=4");

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(gfptarModal).not.toBeVisible();
    await waitForProgressView(page, archiveName, expectedMessage);

    expect(calls).toHaveLength(1);
    assertGfptarBody(calls[0].json, {
        expectedCommand: "create",
        expectedBasedir: `gfarm:${currentDirectory}`,
        expectedOutdir: `gfarm:${archiveName}`,
        expectedSources: filesToGfptar,
        expectedOptions: ["--jobs=4"],
    });
});

test("Should update an existing archive with selected files", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ message: expectedMessage }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();
    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-update"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    await expect(gfptarModal).not.toBeVisible();
    await waitForProgressView(page, archiveName, expectedMessage);

    expect(calls).toHaveLength(1);
    assertGfptarBody(calls[0].json, {
        expectedCommand: "update",
        expectedBasedir: `gfarm:${currentDirectory}`,
        expectedOutdir: `gfarm:${archiveName}`,
        expectedSources: filesToGfptar,
        expectedOptions: [],
    });
});

test("Should append files to an existing archive", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ message: expectedMessage }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();
    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-append"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    await expect(gfptarModal).not.toBeVisible();
    await waitForProgressView(page, archiveName, expectedMessage);

    expect(calls).toHaveLength(1);
    assertGfptarBody(calls[0].json, {
        expectedCommand: "append",
        expectedBasedir: `gfarm:${currentDirectory}`,
        expectedOutdir: `gfarm:${archiveName}`,
        expectedSources: filesToGfptar,
        expectedOptions: [],
    });
});

test("Should retrieve archive members for extraction", async ({ page }) => {
    const targetArchive = "documents";
    const expectedMembers = ["folder1/fileA.txt", "folder2/fileB.txt"];
    const chunks =
        expectedMembers.map((m) => JSON.stringify({ message: "F " + m })).join("\n") + "\n";

    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: chunks,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await checkItem(page, targetArchive);
    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    await gfptarModal.locator('[data-testid="extract-tab-button"]').click();
    await gfptarModal.locator('[data-testid="get-members-button"]').click();

    const members = gfptarModal.locator('[data-testid="members-list"]');
    for (const member of expectedMembers) {
        await expect(members).toContainText(member);
    }

    expect(calls).toHaveLength(1);
    assertGfptarBody(calls[0].json, {
        expectedCommand: "list",
        expectedBasedir: `gfarm:${currentDirectory}/${targetArchive}`,
        expectedSources: [],
    });

    await gfptarModal.locator('[data-testid="modal-button-cancel"]').click();
    await expect(gfptarModal).not.toBeVisible();
});

test("Should display an error notification when retrieving archive members fails", async ({
    page,
}) => {
    const targetArchive = "documents";

    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfptar", message: "list failed", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await checkItem(page, targetArchive);
    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    await gfptarModal.locator('[data-testid="extract-tab-button"]').click();
    await gfptarModal.locator('[data-testid="get-members-button"]').click();

    expect(calls).toHaveLength(1);
    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("list failed");
});

test("Should extract files from an archive to the specified directory", async ({ page }) => {
    const targetArchive = "documents";
    const expectedMessage = "Tar operation completed";

    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ message: expectedMessage }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await checkItem(page, targetArchive);
    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    await gfptarModal.locator('[id="outdir-input"]').fill(exportDirectory);
    await gfptarModal.locator('[data-testid="extract-tab-button"]').click();
    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    await expect(gfptarModal).not.toBeVisible();
    await waitForProgressView(page, exportDirectory, expectedMessage);

    expect(calls).toHaveLength(1);
    assertGfptarBody(calls[0].json, {
        expectedCommand: "extract",
        expectedBasedir: `gfarm:${currentDirectory}/${targetArchive}`,
        expectedOutdir: `gfarm:${exportDirectory}`,
        expectedSources: [],
        expectedOptions: [],
    });
});

test("Should display an error and show task status when tar operation fails", async ({ page }) => {
    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: { command: "gfptar", message: "error test", stdout: "", stderr: [] },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-create"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    await expect(gfptarModal).not.toBeVisible();
    const taskCard = await waitForProgressView(page, archiveName, "error test", "error");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText("500");
    expect(calls).toHaveLength(1);
});

test("Should show error status when gfptar stream emits an error array", async ({ page }) => {
    await mockEndpoint(page, "POST", "/gfptar", {
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: JSON.stringify({ message: "", error: ["tar failed"] }) + "\n",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();
    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);
    await gfptarModal.locator('[id="mode-create"]').click();
    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    await expect(gfptarModal).not.toBeVisible();
    await waitForProgressView(page, archiveName, "tar failed", "error");
});

test("Should cancel an ongoing gfptar operation", async ({ page }) => {
    const gate = createDeferred();
    const calls = await mockEndpoint(page, "POST", "/gfptar", {
        onRequest: async (route) => {
            await gate.promise;
            try {
                await route.fulfill({
                    status: 200,
                    contentType: "application/x-ndjson",
                    body: JSON.stringify({ message: "done" }) + "\n",
                });
            } catch {
                // Request may already be aborted by cancellation.
            }
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();
    await gfptarModal.locator('[id="outdir-input"]').fill(archiveName);
    await gfptarModal.locator('[id="mode-create"]').click();
    await gfptarModal.locator('[data-testid="modal-button-confirm"]').click();

    const taskCard = await waitForProgressView(page, archiveName, undefined, "create");
    await expect.poll(() => calls.length).toBe(1);

    await taskCard.locator(`[data-testid^="progress-button-cancel"]`).click();
    await expect(taskCard.locator(".badge")).toHaveText("cancelled");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "gfptar cancelled"
    );
    gate.resolve();
    await page.unrouteAll({ behavior: "ignoreErrors" });
});
