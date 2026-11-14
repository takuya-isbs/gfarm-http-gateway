const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    handleRoute,
    clickMenuItemFromView,
    clickMenuItemFromMenu,
    checkItem,
    API_URL,
    FRONTEND_URL,
    ROUTE_STORAGE,
    ZIPNAME,
} = require("./test_func");

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
});

test("Should download a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, testFileName, "download");
    const download = await downloadPromise;

    // Verify the downloaded file name
    expect(download.suggestedFilename().replace(/^_+|_+$/g, "")).toBe(testFileName);

    const path = await download.path(); // Get the temporary file path
    const fileContent = fs.readFileSync(path, "utf8"); // Read the file contents
    expect(fileContent).toContain(testFileName);
    expect(fs.statSync(path).size).toBeGreaterThan(0);
});

test("Should download multiple selected files as a ZIP from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const filesToDownload = ["report.docx", "meeting_notes.txt"];
    const expectedZipFileName = ZIPNAME;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToDownload) {
        await checkItem(page, fileName);
    }

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromMenu(page, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(expectedZipFileName);

    const zipFilePath = await download.path();
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();
    for (const fileName of filesToDownload) {
        expect(zipEntries.map((entry) => entry.entryName)).toContain(fileName);
    }
});

test("Should download a single directory as a ZIP from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testDirectoryName = "presentations";
    const expectedZipFileName = ZIPNAME;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, testDirectoryName, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(expectedZipFileName);

    const zipFilePath = await download.path();
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();
    expect(zipEntries.map((entry) => entry.entryName)).toContain(testDirectoryName + "/");
});

test("Should download multiple directories as a ZIP from the actions menu", async ({ page }) => {
    const rootPath = "/";
    const dirsToDownload = ["documents", "images"];
    const expectedZipFileName = ZIPNAME;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${rootPath}`);

    for (const dirName of dirsToDownload) {
        await checkItem(page, dirName);
    }

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromMenu(page, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(expectedZipFileName);

    const zipFilePath = await download.path();
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();
    for (const dirName of dirsToDownload) {
        expect(zipEntries.map((entry) => entry.entryName)).toContain(dirName + "/");
    }
});

test("Should download an empty file with 0 bytes", async ({ page }) => {
    const currentDirectory = "/error_test";
    const emptyFileName = "empty_file.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, emptyFileName, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename().replace(/^_+|_+$/g, "")).toBe(emptyFileName);

    const path = await download.path();
    const stats = fs.statSync(path);
    expect(stats.size).toBe(0);
});

test("Should display an error when trying to download a nonexistent file", async ({ page }) => {
    const currentDirectory = "/error_test";
    const testFileName = "deleted_file.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "download");

    await expect(page.locator("body")).toContainText("File not found");
});
