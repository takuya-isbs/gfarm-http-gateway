const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");
const AdmZip = require("adm-zip");

const {
    setupApiMocks,
    clickMenuItemFromView,
    clickMenuItemFromMenu,
    checkItem,
    FRONTEND_URL,
    ROUTE_STORAGE,
    ZIPNAME,
} = require("./test_func");

let mockState = null;

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should download a single file from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testFileName = "meeting_notes.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, testFileName, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(testFileName);

    const downloadPath = await download.path();
    const fileContent = fs.readFileSync(downloadPath, "utf8");
    expect(fileContent).toContain(testFileName);
    expect(fs.statSync(downloadPath).size).toBeGreaterThan(0);
});

test("Should download multiple selected files as a ZIP from the actions menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const filesToDownload = ["report.docx", "meeting_notes.txt"];

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    for (const fileName of filesToDownload) {
        await checkItem(page, fileName);
    }

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromMenu(page, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(ZIPNAME);

    const zip = new AdmZip(await download.path());
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    for (const fileName of filesToDownload) {
        expect(entryNames).toContain(fileName);
    }
});

test("Should download a single directory as a ZIP from the context menu", async ({ page }) => {
    const currentDirectory = "/documents";
    const testDirectoryName = "presentations";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, testDirectoryName, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(ZIPNAME);

    const zip = new AdmZip(await download.path());
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    expect(entryNames).toContain(testDirectoryName + "/");
});

test("Should download multiple directories as a ZIP from the actions menu", async ({ page }) => {
    const rootPath = "/";
    const dirsToDownload = ["documents", "images"];

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${rootPath}`);

    for (const dirName of dirsToDownload) {
        await checkItem(page, dirName);
    }

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromMenu(page, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(ZIPNAME);

    const zip = new AdmZip(await download.path());
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    for (const dirName of dirsToDownload) {
        expect(entryNames).toContain(dirName + "/");
    }
});

test("Should download an empty file with 0 bytes", async ({ page }) => {
    const currentDirectory = "/error_test";
    const emptyFileName = "empty_file.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const downloadPromise = page.waitForEvent("download");
    await clickMenuItemFromView(page, emptyFileName, "download");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(emptyFileName);

    const downloadPath = await download.path();
    expect(fs.statSync(downloadPath).size).toBe(0);
});

test("Should display an error when trying to download a nonexistent file", async ({ page }) => {
    const currentDirectory = "/error_test";
    const testFileName = "deleted_file.txt";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    await clickMenuItemFromView(page, testFileName, "download");

    await expect(page.locator("body")).toContainText("File not found");
});
