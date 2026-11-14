const { test, expect } = require("./api-coverage-fixture");

const {
    mockRoute,
    handleRoute,
    checkItem,
    clickMenuItemFromMenu,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

const currentDirectory = "/documents";
const exportDirectory = "/archives";
const filesToGfptar = ["report.docx", "meeting_notes.txt"];
const archiveName = "/test-archive";

async function waitForProgressView(page, expectedFileName, expectedMessage) {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-gfptar"]`);
    await expect(taskCard).toBeVisible();

    await expect(taskCard.locator("h6")).toContainText(expectedFileName);

    const progressBar = taskCard.locator(".progress-bar");
    await expect(progressBar).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("completed");

    const message = taskCard.locator(`[data-testid^="task-message-"]`);
    await expect(message).toHaveText(expectedMessage);
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

async function mockGfptarRoute(
    page,
    {
        expectedCommand,
        expectedBasedir,
        expectedOutdir,
        expectedSources,
        expectedOptions,
        mockResponse = { message: "Tar operation completed" },
    } = {}
) {
    await mockRoute(page, `${API_URL}/**`, "POST", "/gfptar", {
        validateBody: (body) => {
            // Base type assertions
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

            // Optional value checks
            if (expectedCommand) expect(body.command).toBe(expectedCommand);
            if (expectedBasedir) expect(body.basedir).toBe(expectedBasedir);
            if (expectedOutdir) expect(body.outdir).toBe(expectedOutdir);
            if (expectedSources) {
                for (const f of expectedSources) {
                    expect(body.source).toContain(f);
                }
            }
            if (expectedOptions) {
                expect(body.options).toEqual(expect.arrayContaining(expectedOptions));
            }
        },
        statusCode: 200,
        contentType: "application/json",
        response: JSON.stringify(mockResponse) + "\n",
    });
}

test("Should create an archive from selected files", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    await mockGfptarRoute(page, {
        expectedCommand: "create",
        expectedBasedir: "gfarm:" + currentDirectory,
        expectedOutdir: "gfarm:" + archiveName,
        expectedSources: filesToGfptar,
        expectedOptions: [],
        mockResponse: { message: expectedMessage },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        const fileRow = page.locator(`[data-testid="row-${fileName}"]`);
        await fileRow.locator(`[id="checkbox-${fileName}"]`).check();
    }

    const actionmenu = page.locator('[data-testid="action-menu"]');
    const gfptarButton = actionmenu.locator('[data-testid="action-menu-gfptar"]');
    await gfptarButton.click();

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const outdirInput = gfptarModal.locator('[id="outdir-input"]');
    await outdirInput.fill(archiveName);

    const radioButton = page.locator('[id="mode-create"]');
    await expect(radioButton).toBeVisible(archiveName);
    await radioButton.click();

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(gfptarModal).not.toBeVisible();

    await waitForProgressView(page, archiveName, expectedMessage);
});
test("Should update an existing archive with selected files", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    await mockGfptarRoute(page, {
        expectedCommand: "update",
        expectedBasedir: "gfarm:" + currentDirectory,
        expectedOutdir: "gfarm:" + archiveName,
        expectedSources: filesToGfptar,
        expectedOptions: [],
        mockResponse: { message: expectedMessage },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const outdirInput = gfptarModal.locator('[id="outdir-input"]');
    await outdirInput.fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-update"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(gfptarModal).not.toBeVisible();

    await waitForProgressView(page, archiveName, expectedMessage);
});

test("Should append files to an existing archive", async ({ page }) => {
    const expectedMessage = "Tar operation completed";
    await mockGfptarRoute(page, {
        expectedCommand: "append",
        expectedBasedir: "gfarm:" + currentDirectory,
        expectedOutdir: "gfarm:" + archiveName,
        expectedSources: filesToGfptar,
        expectedOptions: [],
        mockResponse: { message: expectedMessage },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const outdirInput = gfptarModal.locator('[id="outdir-input"]');
    await outdirInput.fill(archiveName);

    const radioButton = gfptarModal.locator('[id="mode-append"]');
    await expect(radioButton).toBeVisible();
    await radioButton.click();

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(gfptarModal).not.toBeVisible();

    await waitForProgressView(page, archiveName, expectedMessage);
});

test("Should retrieve archive members for extraction", async ({ page }) => {
    const archiveName = "documents";
    const expectedMembers = ["folder1/fileA.txt", "folder2/fileB.txt"];

    await page.route(`${API_URL}/gfptar`, async (route) => {
        const chunks =
            expectedMembers.map((m) => JSON.stringify({ message: "F " + m })).join("\n") + "\n";

        console.log("chunks", chunks);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "transfer-encoding": "chunked" },
            body: chunks,
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await checkItem(page, archiveName);

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const extractTab = gfptarModal.locator('[data-testid="extract-tab-button"]');
    await extractTab.click();

    const getButton = gfptarModal.locator('[data-testid="get-members-button"]');
    await getButton.click();

    const members = gfptarModal.locator('[data-testid="members-list"]');
    for (const member of expectedMembers) {
        await expect(members).toContainText(member);
    }

    const closeButton = gfptarModal.locator('[data-testid="modal-button-cancel"]');
    await closeButton.click();

    await expect(gfptarModal).not.toBeVisible();
});

test("Should extract files from an archive to the specified directory", async ({ page }) => {
    const archiveName = "documents";
    const expectedMessage = "Tar operation completed";

    await mockGfptarRoute(page, {
        expectedCommand: "extract",
        expectedBasedir: "gfarm:" + currentDirectory + "/" + archiveName,
        expectedOutdir: "gfarm:" + exportDirectory,
        expectedSources: [],
        expectedOptions: [],
        mockResponse: { message: expectedMessage },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await checkItem(page, archiveName);

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const outdirInput = gfptarModal.locator('[id="outdir-input"]');
    await outdirInput.fill(exportDirectory);

    const extractTab = gfptarModal.locator('[data-testid="extract-tab-button"]');
    await extractTab.click();

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(gfptarModal).not.toBeVisible();

    await waitForProgressView(page, exportDirectory, expectedMessage);
});

test("Should display an error and show task status when tar operation fails", async ({ page }) => {
    await page.route(`${API_URL}/gfptar`, async (route) => {
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "error test" }),
        });
    });
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToGfptar) {
        await checkItem(page, fileName);
    }

    await clickMenuItemFromMenu(page, "gfptar");

    const gfptarModal = page.locator('[data-testid="gfptar-modal"]');
    await expect(gfptarModal).toBeVisible();

    const outdirInput = gfptarModal.locator('[id="outdir-input"]');
    await outdirInput.fill(archiveName);

    const radioButton = page.locator('[id="mode-create"]');
    await expect(radioButton).toBeVisible(archiveName);
    await radioButton.click();

    const confirmButton = gfptarModal.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    const taskCard = page.locator(`[data-testid^="progress-card-gfptar"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("error");

    await expect(gfptarModal).not.toBeVisible();
    const firstTaskMessage = taskCard.locator('[data-testid="task-message-0"]');
    await expect(firstTaskMessage).toContainText("500");
    await expect(firstTaskMessage).toContainText("error test");
});
