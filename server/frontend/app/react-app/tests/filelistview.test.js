const { test, expect } = require("./api-coverage-fixture");
const { openItemAction, scrollToItem } = require("./filelistview-helpers");

const {
    setupApiMocks,
    isVisible,
    findChildrenByPath,
    getSize,
    getTimeStr,
    getFileIconDefault,
    freezeTime,
    toNDJSON,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

async function mockCustomDirList(page, buildItems) {
    await page.route("**/dir/*", async (route, request) => {
        if (request.method() !== "GET") {
            return await route.fallback();
        }
        const url = new URL(request.url());
        if (url.searchParams.get("effperm") === "on") {
            return await route.fallback();
        }
        const rawDirPath = url.pathname.replace(/^\/dir/, "") || "/";
        const requestedPath = decodeURIComponent(rawDirPath);
        const normalized = requestedPath === "/" ? "" : requestedPath.replace(/\/$/, "");
        const items = buildItems(normalized);
        await route.fulfill({
            status: 200,
            contentType: "application/x-ndjson",
            body: toNDJSON(items),
        });
    });
}

// === Tests ===

test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should display the file list when accessing an existing path", async ({ page }) => {
    const targetPath = "/";
    const expectedChildren = findChildrenByPath(mockState.fileStructure, targetPath);
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    await expect(page.locator('[data-testid="storage-view"]')).toBeVisible();

    const checkboxHeader = page.locator('[data-testid="header-checkbox"]');
    await expect(checkboxHeader).toBeVisible();
    await expect(checkboxHeader).not.toBeChecked();

    await expect(page.locator('[data-testid="header-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="header-size"]')).toBeVisible();
    await expect(page.locator('[data-testid="header-date"]')).toBeVisible();

    const listview = page.locator('[data-testid="listview"]');
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedChildren.length
    );

    for (const expectedFile of expectedChildren) {
        const rowLocator = listview.locator(`[data-testid="row-${expectedFile.name}"]`);
        await expect(rowLocator).toBeVisible();

        const ext = expectedFile.name.split(".").pop();
        const iconClassString = getFileIconDefault(ext, expectedFile.is_dir, expectedFile.is_sym);
        const iconCssSelector = "." + iconClassString.replace(/ /g, ".");
        await expect(rowLocator.locator(iconCssSelector)).toBeVisible();

        const fileCheckbox = rowLocator.locator('input[type="checkbox"][class="form-check-input"]');
        await expect(fileCheckbox).toBeVisible();
        await expect(fileCheckbox).not.toBeChecked();

        await expect(rowLocator).toContainText(expectedFile.name);
        await expect(rowLocator).toContainText(getSize(expectedFile.size, expectedFile.is_dir));
        await expect(rowLocator).toContainText(getTimeStr(expectedFile.mtime));
    }
});

test("Should display files in icon view", async ({ page }) => {
    const targetPath = "/";
    const expectedChildren = findChildrenByPath(mockState.fileStructure, targetPath);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);
    await expect(page.locator('[data-testid="storage-view"]')).toBeVisible();
    await page.locator('[data-testid="header-viewmode"]').click();

    const iconRows = page.locator('[data-testid^="row-icon-"]');
    await expect(iconRows.first()).toBeVisible();
    await expect(page.getByText(expectedChildren[0].name)).toBeVisible();
});

test("Should show an error message when accessing a nonexistent path", async ({ page }) => {
    const nonexistentPath = "/nonexistent-directory-12345";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${nonexistentPath}`);

    await expect(page.getByRole("heading", { name: "Error!" })).toBeVisible();
    await expect(page.getByText("Error : 404")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reload" })).toBeVisible();

    const homeLink = page.getByRole("link", { name: "Return to home" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", `#${ROUTE_STORAGE}/documents`);
});

test("Should display a long file list correctly", async ({ page }) => {
    const numberOfFiles = 1000;

    await mockCustomDirList(page, (requestedPath) =>
        Array.from({ length: numberOfFiles }, (_, i) => ({
            mode_str: "-rw-r--r--",
            is_file: true,
            nlink: 1,
            uname: `user${i % 5}`,
            gname: "users",
            size: (i + 1) * 1024,
            mtime: 1748628000,
            name: `large_file_${i}.txt`,
            path: `${requestedPath}/large_file_${i}.txt`,
        }))
    );

    await page.goto(FRONTEND_URL);

    const listview = page.locator('[data-testid="listview"]');
    await expect(listview).toBeVisible({ timeout: 30_000 });

    await listview.locator('[data-testid="row-list-0"]').click();
    const scroller = page.getByTestId("listview-scroll-desktop");
    const lastRow = listview.getByText(`large_file_${numberOfFiles - 1}.txt`, { exact: true });
    await expect(lastRow).not.toBeInViewport();

    await page.keyboard.press("End");

    await expect
        .poll(() =>
            scroller.evaluate(
                (element) => element.scrollHeight - element.clientHeight - element.scrollTop
            )
        )
        .toBeLessThanOrEqual(1);
    await expect(lastRow).toBeInViewport();
});

test("Should scroll to a deeply virtualized row", async ({ page }) => {
    test.setTimeout(20_000);

    const numberOfFiles = 300;
    const targetFileName = `file-${String(numberOfFiles - 1).padStart(4, "0")}.txt`;
    await page.setViewportSize({ width: 1280, height: 480 });

    await mockCustomDirList(page, (requestedPath) =>
        Array.from({ length: numberOfFiles }, (_, index) => {
            const name = `file-${String(index).padStart(4, "0")}.txt`;
            return {
                mode_str: "-rw-r--r--",
                is_file: true,
                nlink: 1,
                uname: "user",
                gname: "users",
                size: 1024,
                mtime: 1748628000,
                name,
                path: `${requestedPath}/${name}`,
            };
        })
    );

    await page.goto(FRONTEND_URL);
    const targetRow = await scrollToItem(page, targetFileName);
    await expect(targetRow).toBeVisible();
});

test("Should rename an off-screen virtualized row and refresh the list", async ({ page }) => {
    test.setTimeout(25_000);

    const numberOfFiles = 40;
    const targetFileName = "zz-rename-source.txt";
    const renamedFileName = "renamed-by-webui.txt";
    await page.setViewportSize({ width: 1280, height: 480 });
    let fileList = [];

    await mockCustomDirList(page, (requestedPath) => {
        if (fileList.length === 0) {
            fileList = Array.from({ length: numberOfFiles }, (_, index) => ({
                mode_str: "-rw-r--r--",
                is_file: true,
                nlink: 1,
                uname: "user",
                gname: "users",
                size: 1024,
                mtime: 1748628000,
                name: `file-${String(index).padStart(3, "0")}.txt`,
                path: `${requestedPath}/file-${String(index).padStart(3, "0")}.txt`,
            }));
            fileList.push({
                mode_str: "-rw-r--r--",
                is_file: true,
                nlink: 1,
                uname: "user",
                gname: "users",
                size: 1024,
                mtime: 1748628000,
                name: targetFileName,
                path: `${requestedPath}/${targetFileName}`,
            });
        }
        return fileList;
    });
    await page.route("**/move", async (route) => {
        const { source, destination } = route.request().postDataJSON();
        const item = fileList.find((candidate) => candidate.path === source);
        item.name = destination.slice(destination.lastIndexOf("/") + 1);
        item.path = destination;
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByTestId("row-file-000.txt")).toBeVisible();
    await expect(page.getByTestId(`row-${targetFileName}`)).toHaveCount(0);

    await openItemAction(page, targetFileName, "rename");
    const renameModal = page.getByTestId("rename-modal");
    await renameModal.locator("#rename-input").fill(renamedFileName);

    const moveResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname.endsWith("/move")
    );
    const directoryResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname.includes("/dir/")
    );
    await renameModal.getByTestId("modal-button-confirm").click();
    expect((await moveResponsePromise).ok()).toBeTruthy();
    expect((await directoryResponsePromise).ok()).toBeTruthy();
    await expect(renameModal).not.toBeVisible();
    const renamedRow = await scrollToItem(page, renamedFileName);
    await expect(renamedRow).toBeVisible();
});

test("Should sort files by name (ascending and descending)", async ({ page }) => {
    const targetPath = "/";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(mockState.fileStructure, targetPath);

    const nameHeader = page.locator('[data-testid="header-name"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    const expectedAscendingNames = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    await expect(nameHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();
    for (let i = 0; i < expectedAscendingNames.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingNames[i].name);
    }

    const expectedDescendingNames = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return b.name.toLowerCase().localeCompare(a.name.toLowerCase());
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

    const initialFiles = findChildrenByPath(mockState.fileStructure, targetPath);

    const sizeHeader = page.locator('[data-testid="header-size"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    const expectedAscendingSizes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.size - b.size;
    });

    await sizeHeader.click();
    await expect(sizeHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();
    for (let i = 0; i < expectedAscendingSizes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingSizes[i].name);
    }

    const expectedDescendingSizes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
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

    const initialFiles = findChildrenByPath(mockState.fileStructure, targetPath);

    const updatedDateHeader = page.locator('[data-testid="header-date"]');
    const fileNamesLocator = page.locator('[data-testid^="row-list-"]');

    const expectedAscendingTimes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.mtime - b.mtime;
    });

    await updatedDateHeader.click();
    await expect(updatedDateHeader.locator('[data-testid="sort-icon-asc"]')).toBeVisible();
    for (let i = 0; i < expectedAscendingTimes.length; i++) {
        await expect(fileNamesLocator.nth(i)).toContainText(expectedAscendingTimes[i].name);
    }

    const expectedDescendingTimes = [...initialFiles].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return b.mtime - a.mtime;
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

    const initialFiles = findChildrenByPath(mockState.fileStructure, targetPath);
    const expectedTxtFiles = initialFiles.filter(
        (file) => file.is_file && file.name.endsWith(".txt")
    );
    const unexpectedDocxFile = initialFiles.find(
        (file) => file.is_file && file.name.endsWith(".docx")
    );
    const folder = initialFiles.find((file) => !file.is_file);

    const filterToggleButton = page.locator('[data-testid="file-filter-dropdown"]');
    await expect(filterToggleButton).toBeVisible();
    await filterToggleButton.click();

    const clearButton = page.locator('[data-testid="file-filter-clear-button"]');
    await expect(clearButton).toBeVisible();

    const txtFilterCheckbox = page.locator("#HomePage-dropdown-filter-txt");
    await expect(txtFilterCheckbox).toBeVisible();
    await txtFilterCheckbox.check();

    await filterToggleButton.click();

    const listview = page.locator('[data-testid="listview"]');
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedTxtFiles.length
    );

    for (const expectedFile of expectedTxtFiles) {
        await isVisible(page, expectedFile.name);
    }
    if (unexpectedDocxFile) {
        await isVisible(page, unexpectedDocxFile.name, true);
    }
    if (folder) {
        await isVisible(page, folder.name, true);
    }

    await expect(filterToggleButton).toHaveText("Types: txt");

    await filterToggleButton.click();
    await clearButton.click();

    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(initialFiles.length);
    for (const expectedFile of initialFiles) {
        await isVisible(page, expectedFile.name);
    }
});

test("Should filter folders alone and together with a file extension", async ({ page }) => {
    const targetPath = "/documents";
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);

    const initialFiles = findChildrenByPath(mockState.fileStructure, targetPath);
    const folders = initialFiles.filter((file) => !file.is_file);
    const txtFiles = initialFiles.filter((file) => file.is_file && file.name.endsWith(".txt"));
    const filterToggleButton = page.locator('[data-testid="file-filter-dropdown"]');
    const listview = page.locator('[data-testid="listview"]');

    await filterToggleButton.click();
    const folderFilter = page.locator("#HomePage-dropdown-filter-folder");
    await expect(folderFilter).toBeVisible();
    await folderFilter.check();
    await filterToggleButton.click();

    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(folders.length);
    for (const folder of folders) {
        await isVisible(page, folder.name);
    }
    for (const txtFile of txtFiles) {
        await isVisible(page, txtFile.name, true);
    }

    await filterToggleButton.click();
    await page.locator("#HomePage-dropdown-filter-txt").check();
    await filterToggleButton.click();

    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        folders.length + txtFiles.length
    );
    for (const folder of folders) {
        await isVisible(page, folder.name);
    }
    for (const txtFile of txtFiles) {
        await isVisible(page, txtFile.name);
    }
});

test("Should leave a visible gap between file type checkboxes and labels", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);

    await page.locator('[data-testid="file-filter-dropdown"]').click();

    for (const type of ["folder", "txt"]) {
        const label = page.locator(`label[for="HomePage-dropdown-filter-${type}"]`);
        await expect(label).toBeVisible();
        await expect(label).toHaveCSS("column-gap", "8px");
    }
});

test.describe("Modified date filtering with fixed UTC timezone", () => {
    test.use({ timezoneId: "UTC" });

    const datedItems = [
        { name: "today_file.txt", iso: "2025-06-15T10:00:00Z" },
        { name: "week_file.txt", iso: "2025-06-11T10:00:00Z" },
        { name: "month_file.txt", iso: "2025-06-02T10:00:00Z" },
        { name: "thirty_days_file.txt", iso: "2025-05-25T10:00:00Z" },
        { name: "year_file.txt", iso: "2025-02-10T10:00:00Z" },
        { name: "last_year_within_365.txt", iso: "2024-09-01T10:00:00Z" },
        { name: "old_file.txt", iso: "2023-01-01T10:00:00Z" },
    ];

    const expectedByFilter = {
        today: ["today_file.txt"],
        week: ["today_file.txt", "week_file.txt"],
        month: ["today_file.txt", "week_file.txt", "month_file.txt", "thirty_days_file.txt"],
        year: [
            "today_file.txt",
            "week_file.txt",
            "month_file.txt",
            "thirty_days_file.txt",
            "year_file.txt",
            "last_year_within_365.txt",
        ],
        this_month: ["today_file.txt", "week_file.txt", "month_file.txt"],
        this_year: [
            "today_file.txt",
            "week_file.txt",
            "month_file.txt",
            "thirty_days_file.txt",
            "year_file.txt",
        ],
    };

    test("Should filter files by modified date using all available options", async ({ page }) => {
        await freezeTime(page, "2025-06-15T12:00:00Z");
        await mockCustomDirList(page, (requestedPath) =>
            datedItems.map((item) => ({
                mode_str: "-rw-r--r--",
                is_file: true,
                is_dir: false,
                is_sym: false,
                nlink: 1,
                uname: "user1",
                gname: "users",
                size: 1024,
                mtime: Math.floor(Date.parse(item.iso) / 1000),
                name: item.name,
                path: `${requestedPath}/${item.name}`,
            }))
        );

        await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

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
            await dateFilterToggleButton.click();
            const option = page.locator(`#dropdown-filter-${value}`);
            await expect(option).toBeVisible();
            await option.click();

            await expect(dateFilterToggleButton).toHaveText(label);

            const expectedNames = expectedByFilter[value];
            await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
                expectedNames.length
            );

            for (const name of expectedNames) {
                await isVisible(page, name);
            }
            for (const item of datedItems) {
                if (!expectedNames.includes(item.name)) {
                    await isVisible(page, item.name, true);
                }
            }
        }

        await dateFilterToggleButton.click();
        await page.locator('[data-testid="date-filter-clear-button"]').click();

        await expect(dateFilterToggleButton).toHaveText("Filter by Modified");
        await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(datedItems.length);
    });
});

test("Should display the current directory path in breadcrumb navigation", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);

    const rootbutton = page.locator("ol.breadcrumb button.btn.p-0").first();
    await expect(rootbutton).toBeVisible();
    await expect(rootbutton.getByAltText("Logo")).toBeVisible();

    await expect(page.locator("ol.breadcrumb li")).toHaveCount(1);
    await expect(
        page.locator("ol.breadcrumb li").filter({ hasText: "documents" })
    ).not.toBeVisible();

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents/presentations`);
    await expect(rootbutton).toBeVisible();

    const documentsBreadcrumb = page.locator("ol.breadcrumb li button", { hasText: "documents" });
    await expect(documentsBreadcrumb).toBeVisible();
    await expect(
        page.locator("ol.breadcrumb li button", { hasText: "presentations" })
    ).toBeVisible();
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(3);

    await documentsBreadcrumb.click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(2);

    await rootbutton.click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/`);
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(1);

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents/presentations/`);
    await expect(
        page.locator("ol.breadcrumb li button", { hasText: "presentations" })
    ).toBeVisible();
    await expect(page.locator("ol.breadcrumb li")).toHaveCount(3);

    const homebutton = page.locator('[data-testid="home-button"]');
    await expect(homebutton).toBeVisible();
    await homebutton.click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();
});

test("Should open a file in a new tab when double-clicked", async ({ page, context }) => {
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
    await expect(newPage).toHaveURL(`${FRONTEND_URL.replace("3000", "8080")}/file${testFilePath}`);
    await expect(newPage.locator("body")).toContainText(`This is the content of ${testFilePath}.`);

    await newPage.close();
});

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

    const expectedChildrenInNewDir = findChildrenByPath(mockState.fileStructure, expectedNewPath);
    const listview = page.locator('[data-testid="listview"]');
    await expect(listview.locator('[data-testid^="row-list-"]')).toHaveCount(
        expectedChildrenInNewDir.length
    );
    await expect(page.locator(`[data-testid="row-${expectedFileName}"]`)).toBeVisible();
    await expect(
        page.locator("ol.breadcrumb li button", { hasText: testDirectoryName })
    ).toBeVisible();
});

test("Should resolve symbolic links to files, directories, and report broken links", async ({
    page,
    context,
}) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/symlinks`);

    const fileLinkRow = page.getByTestId("row-link_to_file");
    await expect(fileLinkRow).toBeVisible();
    const newPagePromise = context.waitForEvent("page");
    await fileLinkRow.dblclick();
    const newPage = await newPagePromise;
    await newPage.waitForLoadState("load");
    await expect(newPage).toHaveURL("http://localhost:8080/file/documents/report.docx");
    await expect(newPage.locator("body")).toContainText(
        "This is the content of /documents/report.docx."
    );
    await newPage.close();

    const dirLinkRow = page.getByTestId("row-link_to_dir");
    await dirLinkRow.dblclick();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/symlinks`);
    await page.getByTestId("row-broken_link").dblclick();
    const errorNotification = page.locator('[data-testid^="notification-"]');
    await expect(errorNotification).toBeVisible();
    await expect(errorNotification).toContainText("404");
});

test("Should navigate back and forward between directories and render list contents", async ({
    page,
}) => {
    const firstPath = "/documents";
    const secondPath = "/documents/presentations";

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);
    await expect(page.getByTestId("row-q1_review.pptx")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${firstPath}`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${secondPath}`);
    await expect(page.getByTestId("row-q1_review.pptx")).toBeVisible();
});

test("Should select all items via header checkbox and keyboard shortcuts", async ({ page }) => {
    const targetPath = "/documents";
    const expectedChildren = findChildrenByPath(mockState.fileStructure, targetPath);

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();

    const headerCheckbox = page.getByTestId("header-checkbox");
    await headerCheckbox.check();
    await expect(page.getByTestId("action-menu")).toContainText(
        `${expectedChildren.length} selected`
    );

    await headerCheckbox.uncheck();
    await expect(page.getByTestId("action-menu")).not.toBeVisible();

    await page.keyboard.press("Control+a");
    await expect(page.getByTestId("action-menu")).toContainText(
        `${expectedChildren.length} selected`
    );

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("action-menu")).not.toBeVisible();

    await page.getByTestId("row-report.docx").click();
    await page.keyboard.press("F2");
    await expect(page.getByTestId("rename-modal")).toBeVisible();
    await page.getByTestId("rename-modal").getByTestId("modal-button-cancel").click();

    await page.keyboard.press("Delete");
    await expect(page.getByTestId("delete-modal")).toBeVisible();
    await page.getByTestId("delete-modal").getByTestId("modal-button-cancel").click();
});

test("Should automatically redirect to the home directory when accessing the root URL", async ({
    page,
}) => {
    const targetPath = "/documents";

    await page.goto(`${FRONTEND_URL}/`);

    await expect(page).toHaveURL(`${FRONTEND_URL}/#${ROUTE_STORAGE}${targetPath}`);
    await expect(page.locator("ol.breadcrumb li button", { hasText: "documents" })).toBeVisible();
});
