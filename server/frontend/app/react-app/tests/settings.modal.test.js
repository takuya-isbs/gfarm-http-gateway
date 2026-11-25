const { test, expect } = require("./api-coverage-fixture");

const {
    setupApiMocks,
    mockEndpoint,
    findChildrenByPath,
    getTimeStr,
    FRONTEND_URL,
    ROUTE_STORAGE,
} = require("./test_func");

let mockState = null;

async function openSettingsModal(page) {
    await page.locator("#usermenu").click();
    await page.locator('a.dropdown-item:has-text("Settings")').click();
    const modal = page.locator("#settingsModal");
    await expect(modal).toBeVisible();
    return modal;
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    mockState = await setupApiMocks(context);
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should toggle show hidden files and update directory listing query", async ({ page }) => {
    const documentsChildren = findChildrenByPath(mockState.fileStructure, "/documents");
    documentsChildren.push({
        mode_str: "-rw-r--r--",
        is_file: true,
        is_dir: false,
        is_sym: false,
        nlink: 1,
        uname: "user1",
        gname: "users",
        size: 128,
        mtime: 1748628000,
        mtime_str: "May 30 18:00:00 2025",
        name: ".hidden_note.txt",
        path: "/documents/.hidden_note.txt",
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    await expect(page.getByTestId("row-report.docx")).toBeVisible();
    await expect(page.getByTestId("row-.hidden_note.txt")).not.toBeVisible();

    const modal = await openSettingsModal(page);
    const dirOnResponse = page.waitForResponse((res) => {
        const url = new URL(res.url());
        return (
            res.request().method() === "GET" &&
            url.pathname === "/dir/documents" &&
            url.searchParams.get("show_hidden") === "on"
        );
    });
    await modal.locator("#show-hidden-input").check();
    expect((await dirOnResponse).status()).toBe(200);
    await expect(page.getByTestId("row-.hidden_note.txt")).toBeVisible();

    const dirOffResponse = page.waitForResponse((res) => {
        const url = new URL(res.url());
        return (
            res.request().method() === "GET" &&
            url.pathname === "/dir/documents" &&
            url.searchParams.get("show_hidden") === "off"
        );
    });
    await modal.locator("#show-hidden-input").uncheck();
    expect((await dirOffResponse).status()).toBe(200);
    await expect(page.getByTestId("row-.hidden_note.txt")).not.toBeVisible();
});

test("Should change date format, view mode, and upload parallel limit in Settings", async ({
    page,
}) => {
    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);
    const reportRow = page.getByTestId("row-report.docx");
    await expect(reportRow).toBeVisible();

    const reportNode = findChildrenByPath(mockState.fileStructure, "/documents").find(
        (item) => item.name === "report.docx"
    );

    const modal = await openSettingsModal(page);
    await modal.locator("#date-format-select").selectOption("MDY");
    await expect(reportRow).toContainText(getTimeStr(reportNode.mtime, "MDY"));

    await modal.locator('label[for="view-mode-select-icon_rg"]').click();
    await expect(page.locator('[data-testid^="row-icon-"]').first()).toBeVisible();

    await modal.locator('label[for="view-mode-select-list"]').click();
    await expect(page.getByTestId("listview")).toBeVisible();

    const parallelInput = modal.locator("#parallel-limit-input");
    await expect(parallelInput).toHaveValue("1");
    await parallelInput.fill("8");
    await parallelInput.blur();
    await expect(parallelInput).toHaveValue("8");

    await modal.getByTestId("reset-parallel-limit").click();
    await expect(parallelInput).toHaveValue("5");
});

test("Should redirect to #auth_error when an API request returns 401", async ({ page }) => {
    await mockEndpoint(page, "GET", "/dir/documents", {
        statusCode: 401,
        contentType: "application/json",
        response: JSON.stringify({ detail: "Not authenticated" }),
    });

    await page.goto(`${FRONTEND_URL}/#${ROUTE_STORAGE}/documents`);

    await expect(page).toHaveURL(/#\/?auth_error$/);
    await expect(page.getByRole("heading", { name: "Error!" })).toBeVisible();
    await expect(page.getByText("Authentication error")).toBeVisible();
    await expect(page.getByText("Sign in again")).toBeVisible();
});
