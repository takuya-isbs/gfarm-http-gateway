const { test, expect } = require("./api-coverage-fixture");
const fs = require("fs");

const {
    isVisible,
    findChildrenByPath,
    transformMtimeToUnix,
    getSize,
    getTimeStr,
    getFileIconDefault,
    freezeTime,
    toNDJSON,
    handleRoute,
    mockFileIcons,
    API_URL,
    FRONTEND_URL,
    DIR_LIST,
    ROUTE_STORAGE,
} = require("./test_func");

let fileStructureData = null;

// === Tests ===

test.beforeEach(async ({ context }) => {
    fileStructureData = transformMtimeToUnix(JSON.parse(fs.readFileSync(DIR_LIST, "utf-8")));
    await context.route(`${API_URL}/**`, (route, request) => handleRoute(route, request));
    await context.route(`${FRONTEND_URL}/assets/file_icons.json`, (route, request) =>
        mockFileIcons(route, request)
    );
});
// File/Directory Display Test

test("Should display the file list when accessing an existing path", async ({ page }) => {
    const targetPath = "/";
    const expectedChildren = findChildrenByPath(fileStructureData, targetPath);
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const fileTable = await page.waitForSelector('[data-testid="storage-view"]', {
        timeout: 10000,
    });
    const fileText = await fileTable.textContent();

    console.debug(`File text: ${fileText}`);

    // Check if the table header is displayed
    const checkboxHeader = page.locator('[data-testid="header-checkbox"]');
    await expect(checkboxHeader).toBeVisible();
    await expect(checkboxHeader).not.toBeChecked();

    const nameHeader = page.locator('[data-testid="header-name"]');
    await expect(nameHeader).toBeVisible();

    const sizeHeader = page.locator('[data-testid="header-size"]');
    await expect(sizeHeader).toBeVisible();

    const updatedDateHeader = page.locator('[data-testid="header-date"]');
    await expect(updatedDateHeader).toBeVisible();

    const listview = page.locator('[data-testid="listview"]');
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedChildren.length
    );

    // Validate the row and contents of each file/folder
    for (const expectedFile of expectedChildren) {
        const rowLocator = listview.locator(`[data-testid="row-${expectedFile.name}"]`);

        // Check if the row itself is visible
        await expect(rowLocator).toBeVisible();

        // Check the icon
        const ext = expectedFile.name.split(".").pop();
        const iconClassString = getFileIconDefault(ext, expectedFile.is_dir, expectedFile.is_sym);
        const iconCssSelector = "." + iconClassString.replace(/ /g, ".");
        await expect(rowLocator.locator(iconCssSelector)).toBeVisible();

        // Check if the file name is displayed correctly
        const fileCheckbox = rowLocator.locator('input[type="checkbox"][class="form-check-input"]');
        await expect(fileCheckbox).toBeVisible();
        await expect(fileCheckbox).not.toBeChecked();

        await expect(rowLocator).toContainText(expectedFile.name);

        await expect(rowLocator).toContainText(getSize(expectedFile.size, expectedFile.is_dir));

        await expect(rowLocator).toContainText(getTimeStr(expectedFile.mtime));
    }
});

test("Should show an error message when accessing a nonexistent path", async ({ page }) => {
    const nonexistentPath = "/nonexistent-directory-12345";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${nonexistentPath}`);

    await expect(page.getByRole("heading", { name: "Error!" })).toBeVisible();

    await expect(page.getByText(`Error : 404`)).toBeVisible();

    const reloadLink = page.getByRole("link", { name: "Reload" });
    await expect(reloadLink).toBeVisible();

    const homeLink = page.getByRole("link", { name: "Return to home" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", `#${ROUTE_STORAGE}/documents`);
});

test("Should display a long file list correctly", async ({ page }) => {
    const numberOfFiles = 1000;

    await page.route("**/dir/*", async (route) => {
        const url = new URL(route.request().url());
        let requestedPath = url.pathname.substring(3);
        if (requestedPath === "") {
            requestedPath = "/";
        } else {
            requestedPath = "/" + decodeURIComponent(requestedPath);
        }

        const largeFileList = [];
        for (let i = 0; i < numberOfFiles; i++) {
            largeFileList.push({
                mode_str: "-rw-r--r--",
                is_file: true,
                nlink: 1,
                uname: `user${i % 5}`,
                gname: "users",
                size: Math.floor(Math.random() * 1000000) + 1000,
                mtime: 1748628000,
                name: `large_file_${i}.txt`,
                path: `${requestedPath}/large_file_${i}.txt`,
            });
        }

        await route.fulfill({
            status: 200,
            contentType: "application/x-ndjson",
            body: toNDJSON(largeFileList),
        });
    });

    await page.goto(FRONTEND_URL);

    await page.waitForSelector('[data-testid="listview"]', {
        timeout: 30000,
    });

    const listview = page.locator('[data-testid="listview"]');

    await listview.locator('[data-testid="row-list-0"]').click();
    await page.keyboard.press("End");
    await page.waitForTimeout(500);

    const lastFileName = `large_file_${numberOfFiles - 1}.txt`;
    await listview.getByText(lastFileName).scrollIntoViewIfNeeded();

    await expect(listview.getByText(lastFileName)).toBeVisible();
});

test("Should sort files by name (ascending and descending)", async ({ page }) => {
    const targetPath = "/";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(fileStructureData, targetPath);

    const nameHeader = page.locator('[data-testid="header-name"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    // arc
    console.debug(`expectedChildren: ${initialFiles}`);
    const expectedAscendingNames = [...initialFiles].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return nameA.localeCompare(nameB);
    });

    // default : name asc

    await expect(nameHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();

    for (let i = 0; i < expectedAscendingNames.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingNames[i].name);
    }

    // desc
    const expectedDescendingNames = [...initialFiles].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return nameB.localeCompare(nameA);
    });

    await nameHeader.click();

    await expect(nameHeader.locator('[data-testid="sort-icon-desc"]')).toBeVisible();

    for (let i = 0; i < expectedDescendingNames.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedDescendingNames[i].name);
    }
});

test("Should sort files by size (ascending and descending)", async ({ page }) => {
    const targetPath = "/";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(fileStructureData, targetPath);

    const sizeHeader = page.locator('[data-testid="header-size"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    // arc
    const expectedAscendingSizes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return a.size - b.size;
    });

    await sizeHeader.click();

    await expect(sizeHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();

    for (let i = 0; i < expectedAscendingSizes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingSizes[i].name);
    }

    // desc
    const expectedDescendingSizes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return b.size - a.size;
    });

    await sizeHeader.click();
    await expect(sizeHeader.locator('[data-testid="sort-icon-desc"]')).toBeVisible();

    for (let i = 0; i < expectedDescendingSizes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedDescendingSizes[i].name);
    }
});

test("Should sort files by updated date (ascending and descending)", async ({ page }) => {
    const targetPath = "/";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(fileStructureData, targetPath);

    const updatedDateHeader = page.locator('[data-testid="header-date"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    // arc
    const expectedAscendingTimes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return new Date(a.mtime_str) - new Date(b.mtime_str);
    });

    await updatedDateHeader.click();

    await expect(updatedDateHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();

    for (let i = 0; i < expectedAscendingTimes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingTimes[i].name);
    }

    // desc
    const expectedDescendingTimes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }
        return new Date(b.mtime_str) - new Date(a.mtime_str);
    });

    await updatedDateHeader.click();
    await expect(updatedDateHeader.locator('[data-testid="sort-icon-desc"]')).toBeVisible();

    for (let i = 0; i < expectedDescendingTimes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedDescendingTimes[i].name);
    }
});

test("Should filter files by extension (.txt)", async ({ page }) => {
    const targetPath = "/documents";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(fileStructureData, targetPath);
    const expectedTxtFiles = initialFiles.filter(
        (file) => file.is_file && file.name.endsWith(".txt")
    );
    const unexpectedPdfFile = initialFiles.find(
        (file) => file.is_file && file.name.endsWith(".docx")
    );
    const folder = initialFiles.find((file) => !file.is_file);

    // Find the dropdown toggle button
    const filterToggleButton = page.locator('[data-testid="file-filter-dropdown"]');
    await expect(filterToggleButton).toBeVisible();

    await filterToggleButton.click();

    const clearButton = page.locator('[data-testid="file-filter-clear-button"]');
    await expect(clearButton).toBeVisible();

    const txtFilterCheckbox = page.locator("#HomePage-dropdown-filter-txt");
    await expect(txtFilterCheckbox).toBeVisible();
    await txtFilterCheckbox.check();

    await filterToggleButton.click();

    // Wait for the list to update after applying a filter
    await page.waitForLoadState("networkidle");

    const listview = page.locator('[data-testid="listview"]');
    // Check display files
    for (const expectedFile of expectedTxtFiles) {
        await isVisible(page, expectedFile.name);
    }
    if (unexpectedPdfFile) {
        await isVisible(page, unexpectedPdfFile.name, true); // not visible
    }
    if (folder) {
        await isVisible(page, folder.name, true); // not visible
    }
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedTxtFiles.length
    );

    await expect(filterToggleButton).toHaveText("Types: txt");

    await filterToggleButton.click();
    await clearButton.click();

    // show all
    for (const expectedFile of initialFiles) {
        const fileRow = listview.locator(`[data-testid="row-${expectedFile.name}"]`);
        await expect(fileRow).toBeVisible();
    }
});

// return the expected list of files based on a given dateFilter value
const getExpectedFilesForDateFilter = (allFiles, filterType) => {
    const now = new Date("2025-06-01T12:00:00Z"); // freeze time

    return allFiles.filter((file) => {
        const fileDate = new Date(file.mtime_str);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const oneYearAgo = new Date(now);
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);

        switch (filterType) {
            case "all":
                return true;
            case "today":
                return (
                    fileDate.getFullYear() === now.getFullYear() &&
                    fileDate.getMonth() === now.getMonth() &&
                    fileDate.getDate() === now.getDate()
                );
            case "week":
                return fileDate >= sevenDaysAgo;
            case "month":
                return fileDate >= thirtyDaysAgo;
            case "year":
                return fileDate >= oneYearAgo;
            case "this_month":
                return (
                    fileDate.getFullYear() === now.getFullYear() &&
                    fileDate.getMonth() === now.getMonth()
                );
            case "this_year":
                return fileDate.getFullYear() === now.getFullYear();
            default:
                return true;
        }
    });
};

test("Should filter files by modified date using all available options", async ({ page }) => {
    await freezeTime(page, "2025-06-01T12:00:00Z");
    const targetPath = "/";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const allFilesAtRoot = findChildrenByPath(fileStructureData, targetPath);
    const dateFilterToggleButton = page.locator('[data-testid="date-filter-dropdown"]');
    await expect(dateFilterToggleButton).toBeVisible();

    const filtersToTest = [
        { label: "Today", value: "today" },
        { label: "Last 7 Days", value: "week" },
        { label: "Last 30 days", value: "month" },
        { label: "Last 1 year", value: "year" },
        { label: "This Month", value: "this_month" },
        { label: "This Year", value: "this_year" },
    ];

    const listview = page.locator('[data-testid="listview"]');

    for (const { label, value } of filtersToTest) {
        await dateFilterToggleButton.click(); // open dropdown again
        const option = page.locator(`#dropdown-filter-${value}`);
        await expect(option).toBeVisible();
        await option.click();

        await page.waitForLoadState("networkidle");
        await expect(dateFilterToggleButton).toHaveText(label);

        const expectedFiles = getExpectedFilesForDateFilter(allFilesAtRoot, value);
        await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
            expectedFiles.length
        );

        for (const expectedFile of expectedFiles) {
            await isVisible(page, expectedFile.name);
        }

        const unexpectedFiles = allFilesAtRoot.filter((file) => !expectedFiles.includes(file));
        for (const unexpectedFile of unexpectedFiles) {
            await isVisible(page, unexpectedFile.name, true);
        }
    }

    // Clear filter
    await dateFilterToggleButton.click();
    const clearFilterButton = page.locator('[data-testid="date-filter-clear-button"]');
    await clearFilterButton.click();

    await page.waitForLoadState("networkidle");
    await expect(dateFilterToggleButton).toHaveText("Filter by Modified");
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(allFilesAtRoot.length);
});

test("Should display the current directory path in breadcrumb navigation", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    const rootbutton = page.locator("ol.breadcrumb button.btn.p-0").first();
    await expect(rootbutton).toBeVisible();
    await expect(rootbutton.getByAltText("Logo")).toBeVisible();

    // root = 1
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(1);
    await expect(
        page.locator("ol.breadcrumb li").filter({ hasText: "documents" })
    ).not.toBeVisible();

    const testPath = "/documents/presentations";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${testPath}`);

    await expect(rootbutton).toBeVisible();

    // "documents"
    const documentsBreadcrumb = page.locator("ol.breadcrumb li button", { hasText: "documents" });
    await expect(documentsBreadcrumb).toBeVisible();
    // "presentations"
    const presentationsBreadcrumb = page.locator("ol.breadcrumb li button", {
        hasText: "presentations",
    });
    await expect(presentationsBreadcrumb).toBeVisible();

    // home + "documents" + "presentations" = 3
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(3);

    // go to "documents"
    await documentsBreadcrumb.click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);

    // home + "documents" = 2
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(2);
    await expect(page.locator("ol.breadcrumb li button", { hasText: "documents" })).toBeVisible();

    // go root
    await rootbutton.click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    // root = 1
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(1);

    // access /documents/presentations/
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents/presentations/`);
    // /documents/presentations
    await expect(
        page.locator("ol.breadcrumb li button", { hasText: "presentations" })
    ).toBeVisible();
    // Trailing slashes are ignored
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(3);

    // go home
    const homebutton = page.locator('[data-testid="home-button"]');
    await expect(homebutton).toBeVisible();
    await homebutton.click();
    await expect(documentsBreadcrumb).toBeVisible();
});

test("Should open a file in a new tab when double-clicked", async ({ page, context }) => {
    context.on("page", (page) => {
        console.debug("[DEBUG] New tab opened:", page.url());
    });

    const currentDirectory = "/documents";
    const testFileName = "report.docx";
    const testFilePath = `${currentDirectory}/${testFileName}`;

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const fileRow = page.locator(`[data-testid="row-${testFileName}"]`);
    await expect(fileRow).toBeVisible();

    const newPagePromise = context.waitForEvent("page");
    await fileRow.dblclick();
    const newPage = await newPagePromise;

    await newPage.waitForLoadState("load");

    const expectedFileUrl = `${API_URL}/file${testFilePath}`;
    await expect(newPage).toHaveURL(expectedFileUrl);
    await expect(newPage.locator("body")).toContainText(`This is the content of ${testFilePath}.`);

    await newPage.close();
});

// Path Navigation Test

test("Should navigate into a directory when double-clicked", async ({ page }) => {
    const currentDirectory = "/documents";
    const testDirectoryName = "presentations";
    const expectedNewPath = `${currentDirectory}/${testDirectoryName}`;
    const expectedFileName = "q1_review.pptx";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${currentDirectory}`);

    const directoryRow = page.locator(`[data-testid="row-${testDirectoryName}"]`);
    await expect(directoryRow).toBeVisible();

    await directoryRow.dblclick();

    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${expectedNewPath}`);

    const expectedChildrenInNewDir = findChildrenByPath(fileStructureData, expectedNewPath);
    const listview = page.locator('[data-testid="listview"]');
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedChildrenInNewDir.length
    );
    const fileRow = page.locator(`[data-testid="row-${expectedFileName}"]`);
    await expect(fileRow).toBeVisible();

    await expect(
        page.locator("ol.breadcrumb li button", { hasText: testDirectoryName })
    ).toBeVisible();
});

test("Should navigate back and forward between directories", async ({ page }) => {
    const firstPath = "/documents";
    const secondPath = "/documents/presentations";

    // Go to first directory
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);

    // Then go to second directory
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);
});

test("Should automatically redirect to the home directory when accessing the root URL", async ({
    page,
}) => {
    const targetPath = "/documents";

    await page.goto(`${FRONTEND_URL}/`);

    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    // And the breadcrumb or files update
    await expect(page.locator("ol.breadcrumb li button", { hasText: "documents" })).toBeVisible();
});
