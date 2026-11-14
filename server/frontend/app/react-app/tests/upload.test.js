const { test, expect } = require("./api-coverage-fixture");

const {
    handleRoute,
    mockRoute,
    isVisible,
    clickMenuItemFromNewMenu,
    API_URL,
    FRONTEND_URL,
    DUMMYS,
    ROUTE_STORAGE,
} = require("./test_func");

async function mockUploadRoute(
    page,
    { filepath, statusCode = 200, mockResponse = { result: "ok" } }
) {
    await mockRoute(page, `${API_URL}/**`, "PUT", "/file" + filepath, {
        statusCode,
        contentType: "application/json",
        response: JSON.stringify(mockResponse),
    });
}

async function waitForProgressView(page, expectedFileName) {
    const progressView = page.locator('[data-testid="progress-view"]');

    const taskCard = progressView.locator(`[data-testid^="progress-card-upload"]`);
    await expect(taskCard).toBeVisible();

    await expect(taskCard.locator("h6")).toContainText(expectedFileName);

    // const progressBar = progressView.locator(".progress-bar");
    // await expect(progressBar).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("completed");
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should upload a single file using the upload dialog", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";
    const uploadFilePath = DUMMYS + "/" + testFileName;

    await mockUploadRoute(page, {
        filepath: "/" + testFileName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);
    await page.waitForLoadState("networkidle");

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([uploadFilePath]);

    await waitForProgressView(page, testFileName);

    const ProgressViewHeader = page.locator(".offcanvas-header", { hasText: "Transfers" });
    const close_button = ProgressViewHeader.locator(".btn-close");
    await close_button.click();
    await expect(ProgressViewHeader).not.toBeVisible();
});

test("Should upload multiple files using the upload dialog", async ({ page }) => {
    const currentDirectory = "/";
    const testFileNames = ["dummy.txt", "dummy.py", "dummy.js"];
    const filePaths = testFileNames.map((f) => DUMMYS + "/" + f);

    await mockUploadRoute(page, {
        filepath: currentDirectory,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles(filePaths);

    await waitForProgressView(page, "uploading 3 files");
});

test("Should upload a nested directory using the folder upload dialog", async ({ page }) => {
    const currentDirectory = "/documents";

    await mockUploadRoute(page, {
        filepath: currentDirectory + "/dummy",
    });

    const uploadFilePath = DUMMYS;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-directory");

    const inputLocator = page.locator('input[type="file"][multiple][webkitdirectory]');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([uploadFilePath]);

    await waitForProgressView(page, "uploading 5 files");
});

test("Should overwrite existing file on name conflict", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";

    await mockUploadRoute(page, {
        filepath: currentDirectory + "/" + testFileName,
    });

    const uploadFilePath = DUMMYS + "/" + testFileName;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([uploadFilePath]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible({ timeout: 5000 });

    const duplicateFileName = page.locator(`[id="incoming-${testFileName}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();

    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(overwriteModal).not.toBeVisible();

    await waitForProgressView(page, testFileName);
});

test("Should skip upload and keep existing file", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";

    await mockUploadRoute(page, {
        filepath: currentDirectory + "/" + testFileName,
    });

    const uploadFilePath = DUMMYS + "/" + testFileName;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([uploadFilePath]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible({ timeout: 5000 });

    const duplicateFileName = page.locator(`[id="current-${testFileName}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();

    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(overwriteModal).not.toBeVisible();

    const progressView = page.locator('[data-testid="progress-view"]');
    await expect(progressView).not.toBeVisible(); // No upload task should appear
});

test("Should upload file with new name to avoid conflict", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";
    const expectedFilename = "dummy (1).txt";

    await mockUploadRoute(page, {
        filepath: currentDirectory + "/" + encodeURIComponent(expectedFilename),
    });

    const uploadFilePath = DUMMYS + "/" + testFileName;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([uploadFilePath]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible({ timeout: 5000 });

    const duplicateFileName_incoming = page.locator(`[id="incoming-${testFileName}"]`);
    await expect(duplicateFileName_incoming).toBeVisible();
    await duplicateFileName_incoming.check();
    const duplicateFileName_current = page.locator(`[id="current-${testFileName}"]`);
    await expect(duplicateFileName_current).toBeVisible();
    await duplicateFileName_current.check();

    const confirmButton = page.locator('[data-testid="modal-button-confirm"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(overwriteModal).not.toBeVisible();

    await waitForProgressView(page, expectedFilename);
});

test("Should handle name conflict by canceling the upload", async ({ page }) => {
    const currentDirectory = "/dummy";
    const testFileName = "dummy.txt";
    const uploadFilePath = DUMMYS + "/" + testFileName;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await isVisible(page, testFileName);

    await clickMenuItemFromNewMenu(page, "upload-file");

    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([uploadFilePath]);

    const overwriteModal = page.locator('[data-testid="conflict-modal"]');
    await expect(overwriteModal).toBeVisible({ timeout: 5000 });

    const duplicateFileName = page.locator(`[id="incoming-${testFileName}"]`);
    await expect(duplicateFileName).toBeVisible();
    await duplicateFileName.check();

    const cancelButton = page.locator('[data-testid="modal-button-cancel"]');
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(overwriteModal).not.toBeVisible();

    await expect(page.locator('[data-testid="progress-view"]')).not.toBeVisible();
});

test("Should upload an empty file and complete the task", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "empty.txt";
    const uploadFilePath = DUMMYS + "/" + testFileName;

    await mockUploadRoute(page, {
        filepath: currentDirectory + testFileName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await fileInput.setInputFiles([uploadFilePath]);

    await waitForProgressView(page, testFileName);
});

test("Should upload a file via drag-and-drop and confirm in the modal", async ({ page }) => {
    const testFileName = "test-file.txt";

    await mockUploadRoute(page, {
        filepath: "/" + testFileName,
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    await page.waitForSelector('[data-testid="storage-view"]', {
        timeout: 10000,
    });

    await page.evaluate(() => {
        const file = new File(["This is test file content"], "test-file.txt", {
            type: "text/plain",
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.dispatchEvent(new DragEvent("dragenter", { dataTransfer, bubbles: true }));
        document.dispatchEvent(new DragEvent("dragover", { dataTransfer, bubbles: true }));
    });

    await page.waitForSelector(".drop-zone");

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
});

test("Should display an error and show task status when upload fails", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";
    const uploadFilePath = DUMMYS + "/" + testFileName;

    await mockUploadRoute(page, {
        filepath: "/" + encodeURIComponent(testFileName),
        statusCode: 500,
        mockResponse: {
            detail: {
                command: "upload",
                message: "error test",
                stdout: "",
                stderr: "",
            },
        },
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([uploadFilePath]);

    const progressView = page.locator('[data-testid="progress-view"]');
    const taskCard = progressView.locator(`[data-testid^="progress-card-upload"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("completed");

    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("500");
    await expect(errorNotification).toContainText("error test");
});

test("Should cancel an ongoing upload and display cancellation status", async ({ page }) => {
    const currentDirectory = "/";
    const testFileName = "dummy.txt";
    const uploadFilePath = DUMMYS + "/" + testFileName;

    await page.route(`${API_URL}/file/${encodeURIComponent(testFileName)}`, async (route) => {
        console.log(`[ROUTE MOCK] Simulating delayed upload for: ${testFileName}`);
        await page.waitForTimeout(1000); // delay
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ message: "Upload completed (mocked after delay)" }),
        });
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromNewMenu(page, "upload-file");

    const inputLocator = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await expect(inputLocator).toBeAttached();
    await inputLocator.setInputFiles([uploadFilePath]);

    const progressView = page.locator('[data-testid="progress-view"]');
    const taskCard = progressView.locator(`[data-testid^="progress-card-upload"]`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator(".badge")).toHaveText("upload"); // Initial status

    const cancelButton = taskCard.locator(`[data-testid^="progress-button-cancel"]`);
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(taskCard.locator(".badge")).toHaveText("cancelled");
    const firstTaskMessage = taskCard.locator('[data-testid="task-message-0"]');
    await expect(firstTaskMessage).toContainText("Upload cancelled"); // Verify cancellation message

    const ProgressViewHeader = page.locator('[data-testid="progress-header"]');
    const close_button = ProgressViewHeader.locator('[data-testid="progress-header-button-close"]');
    await close_button.click();
    await expect(ProgressViewHeader).not.toBeVisible();

    const ProgressViewButton = page.locator(".btn", { hasText: "Show Progress" });
    await expect(ProgressViewButton).not.toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
});
