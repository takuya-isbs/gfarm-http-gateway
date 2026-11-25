const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    createDeferred,
    isVisible,
    clickMenuItemFromNewMenu,
    FRONTEND_URL,
    DUMMYS,
    ROUTE_STORAGE,
    toNDJSON,
} = require("./test_func");

let mockState = null;

async function waitForProgressView(page, expectedFileName, expectedStatus = "completed") {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-upload"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator("h6")).toContainText(expectedFileName);
    await expect(taskCard.locator(".badge")).toHaveText(expectedStatus);
    return taskCard;
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should upload a single file using the upload dialog", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";
    const uploadFilePath = `${DUMMYS}/${testFileName}`;

    const calls = await mockEndpoint(page, "PUT", `/${"file"}/${testFileName}`, {
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([uploadFilePath]);

    await waitForProgressView(page, testFileName);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-file-timestamp"]).toBeTruthy();

    const progressViewHeader = page.locator(".offcanvas-header", { hasText: "Transfers" });
    await progressViewHeader.locator(".btn-close").click();
    await expect(progressViewHeader).not.toBeVisible();
});

test("Should upload multiple files using the upload dialog", async ({ page }) => {
    const currentDirectory = "/";
    const testFileNames = ["dummy.txt", "dummy.py", "dummy.js"];
    const filePaths = testFileNames.map((f) => `${DUMMYS}/${f}`);

    const calls = await mockEndpoint(page, "PUT", null, {
        match: (_url, decodedPath) => decodedPath.startsWith("/file/"),
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles(filePaths);

    await waitForProgressView(page, "uploading 3 files");
    expect(calls).toHaveLength(testFileNames.length);
    expect(new Set(calls.map((c) => c.pathname))).toEqual(
        new Set(testFileNames.map((f) => `/file/${f}`))
    );
});

test("Should upload a nested directory using the folder upload dialog", async ({ page }) => {
    const currentDirectory = "/documents";
    const expectedFiles = [
        "/file/documents/dummy/dummy.js",
        "/file/documents/dummy/dummy.py",
        "/file/documents/dummy/dummy.txt",
        "/file/documents/dummy/empty.txt",
        "/file/documents/dummy/dummy2/dummy2.txt",
    ];

    const dirCalls = [];
    const fileCalls = [];
    await page.route("**/dir/**", async (route, request) => {
        if (request.method() !== "PUT") {
            return await route.fallback();
        }
        const url = new URL(request.url());
        dirCalls.push({
            pathname: decodeURIComponent(url.pathname),
            p: url.searchParams.get("p"),
        });
        return await route.fallback();
    });
    await page.route("**/file/**", async (route, request) => {
        if (request.method() !== "PUT") {
            return await route.fallback();
        }
        fileCalls.push(decodeURIComponent(new URL(request.url()).pathname));
        return await route.fallback();
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-directory");

    const inputLocator = page.locator('input[type="file"][multiple][webkitdirectory]');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([DUMMYS]);

    await waitForProgressView(page, "uploading 5 files");
    expect(dirCalls.length).toBeGreaterThanOrEqual(2);
    expect(dirCalls.every((c) => c.p === "on")).toBe(true);
    expect(new Set(fileCalls)).toEqual(new Set(expectedFiles));
});

test("Should overwrite existing file on name conflict", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";
    const expectedPath = `/file${currentDirectory}/${testFileName}`;

    const calls = await mockEndpoint(page, "PUT", expectedPath, {
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([`${DUMMYS}/${testFileName}`]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible();

    const duplicateFileName = page.locator(`[id="incoming-${testFileName}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();

    await page.locator('[data-testid="modal-button-confirm"]').click();
    await expect(overwriteModal).not.toBeVisible();

    await waitForProgressView(page, testFileName);
    expect(calls).toHaveLength(1);
});

test("Should skip upload and keep existing file", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";

    const calls = await mockEndpoint(page, "PUT", null, {
        match: (_url, decodedPath) => decodedPath.startsWith("/file/"),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([`${DUMMYS}/${testFileName}`]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible();

    const duplicateFileName = page.locator(`[id="current-${testFileName}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();

    await page.locator('[data-testid="modal-button-confirm"]').click();
    await expect(overwriteModal).not.toBeVisible();

    await expect(page.locator('[data-testid="progress-view"]')).not.toBeVisible();
    expect(calls).toHaveLength(0);
});

test("Should upload file with new name to avoid conflict", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";
    const expectedFilename = "dummy (1).txt";

    const calls = await mockEndpoint(page, "PUT", `/file${currentDirectory}/${expectedFilename}`, {
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([`${DUMMYS}/${testFileName}`]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible();

    await page.locator(`[id="incoming-${testFileName}"]`).check();
    await page.locator(`[id="current-${testFileName}"]`).check();

    await page.locator('[data-testid="modal-button-confirm"]').click();
    await expect(overwriteModal).not.toBeVisible();

    await waitForProgressView(page, expectedFilename);
    expect(calls).toHaveLength(1);
});

test("Should handle name conflict by canceling the upload", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";

    const calls = await mockEndpoint(page, "PUT", null, {
        match: (_url, decodedPath) => decodedPath.startsWith("/file/"),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([`${DUMMYS}/${testFileName}`]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible();

    await page.locator(`[id="incoming-${testFileName}"]`).check();
    await page.locator('[data-testid="modal-button-cancel"]').click();

    await expect(overwriteModal).not.toBeVisible();
    await expect(page.locator('[data-testid="progress-view"]')).not.toBeVisible();
    expect(calls).toHaveLength(0);
});

test("Should upload an empty file and complete the task", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "empty.txt";

    const calls = await mockEndpoint(page, "PUT", `/file/${testFileName}`, {
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await fileInput.setInputFiles([`${DUMMYS}/${testFileName}`]);

    await waitForProgressView(page, testFileName);
    expect(calls).toHaveLength(1);
});

test("Should upload a file via drag-and-drop and confirm in the modal", async ({ page }) => {
    const testFileName = "test-file.txt";

    const calls = await mockEndpoint(page, "PUT", `/file/${testFileName}`, {
        statusCode: 200,
        body: "",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);
    await expect(page.getByTestId("storage-view")).toBeVisible();

    await page.evaluate(() => {
        const file = new File(["This is test file content"], "test-file.txt", {
            type: "text/plain",
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.dispatchEvent(new DragEvent("dragenter", { dataTransfer, bubbles: true }));
        document.dispatchEvent(new DragEvent("dragover", { dataTransfer, bubbles: true }));
    });

    await expect(page.locator(".drop-zone")).toBeVisible();

    await page.evaluate(() => {
        const dropZone = document.querySelector(".drop-zone");
        if (!dropZone) {
            throw new Error("drop-zone not found!");
        }
        const file = new File(["This is test file content"], "test-file.txt", {
            type: "text/plain",
        });
        const fakeItem = {
            kind: "file",
            type: file.type,
            getAsFile: () => file,
            webkitGetAsEntry: () => ({
                isFile: true,
                isDirectory: false,
                file: (cb) => cb(file),
            }),
        };

        const dataTransfer = new DataTransfer();
        Object.defineProperty(dataTransfer, "items", {
            value: [fakeItem],
        });
        Object.defineProperty(dataTransfer, "types", {
            value: ["Files"],
        });

        dropZone.dispatchEvent(new DragEvent("dragenter", { dataTransfer, bubbles: true }));
        dropZone.dispatchEvent(new DragEvent("dragover", { dataTransfer, bubbles: true }));
        dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true }));
    });

    const modal = page.locator('[data-testid="dropzone-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator("ul")).toContainText(testFileName);

    await modal.locator('[data-testid="modal-button-confirm"]').click();

    await waitForProgressView(page, testFileName);
    expect(calls).toHaveLength(1);
});

test("Should display an error and show task status when upload fails", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";

    const calls = await mockEndpoint(page, "PUT", `/file/${testFileName}`, {
        statusCode: 500,
        contentType: "application/json",
        response: JSON.stringify({
            detail: {
                command: "gfreg",
                message: "error test",
                stdout: "",
                stderr: [],
            },
        }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([`${DUMMYS}/${testFileName}`]);

    await waitForProgressView(page, testFileName, "completed");
    expect(calls).toHaveLength(1);

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});

test("Should reject upload when target directory lacks write permission", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "dummy.txt";

    const putCalls = await mockEndpoint(page, "PUT", null, {
        match: (_url, decodedPath) => decodedPath.startsWith("/file/"),
    });
    await mockEndpoint(page, "GET", null, {
        match: (url, decodedPath) =>
            decodedPath === `/dir${currentDirectory}` && url.searchParams.get("effperm") === "on",
        statusCode: 200,
        contentType: "application/x-ndjson",
        response: toNDJSON([{ perms: "r-x" }]),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");
    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([`${DUMMYS}/${testFileName}`]);

    const taskCard = await waitForProgressView(page, testFileName, "error");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "Permission denied"
    );
    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("403");
    expect(putCalls).toHaveLength(0);
});

test("Should cancel an ongoing upload and display cancellation status", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";

    const gate = createDeferred();
    const calls = await mockEndpoint(page, "PUT", `/file/${testFileName}`, {
        onRequest: async (route) => {
            await gate.promise;
            try {
                await route.fulfill({
                    status: 200,
                    body: "",
                });
            } catch {
                // Request may already be aborted by cancellation.
            }
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([`${DUMMYS}/${testFileName}`]);

    const taskCard = await waitForProgressView(page, testFileName, "upload");
    await expect.poll(() => calls.length).toBe(1);

    const cancelButton = taskCard.locator(`[data-testid^="progress-button-cancel"]`);
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(taskCard.locator(".badge")).toHaveText("cancelled");
    await expect(taskCard.locator('[data-testid="task-message-0"]')).toContainText(
        "Upload cancelled"
    );
    gate.resolve();

    const progressViewHeader = page.locator('[data-testid="progress-header"]');
    await progressViewHeader.locator('[data-testid="progress-header-button-close"]').click();
    await expect(progressViewHeader).not.toBeVisible();

    await expect(page.locator(".btn", { hasText: "Show Progress" })).not.toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
});
