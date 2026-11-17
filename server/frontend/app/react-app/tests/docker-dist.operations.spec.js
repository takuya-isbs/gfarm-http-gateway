const { test, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const AdmZip = require("adm-zip");

const username = process.env.GFARM_HTTP_TEST_USERNAME;
const password = process.env.GFARM_HTTP_TEST_PASSWORD;
const testDirectory = process.env.GFARM_HTTP_TEST_DIRECTORY;
const uploadFile = process.env.GFARM_HTTP_TEST_UPLOAD_FILE;
const gatewayOrigin = new URL(process.env.GFARM_HTTP_GATEWAY_URL).origin;

async function login(page) {
    expect(username, "GFARM_HTTP_TEST_USERNAME must be set").toBeTruthy();
    expect(password, "GFARM_HTTP_TEST_PASSWORD must be set").toBeTruthy();
    expect(testDirectory, "GFARM_HTTP_TEST_DIRECTORY must be set").toBeTruthy();

    await page.goto("/login");
    await page.locator("#oidc-btn").click();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.locator("#kc-login").click();
    // Wait until Keycloak has redirected back to http-gw and the login
    // page is gone, so the next navigation does not interrupt the login.
    await page.waitForURL(
        (url) => url.origin === gatewayOrigin && !url.pathname.startsWith("/login")
    );
    const directoryResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "GET" &&
            new URL(response.url()).pathname.includes("/dir/")
        );
    });
    await page.goto(`/#/ui${testDirectory}`);
    expect((await directoryResponsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId("storage-view")).toBeVisible();
}

async function openItemAction(page, filename, action) {
    const row = page.getByTestId(`row-${filename}`);
    await row.getByTestId("item-menu").click();
    await page.getByTestId(`${action}-menu-${filename}`).click();
}

async function waitForProgress(page, type) {
    const task = page
        .getByTestId("progress-view")
        .locator(`[data-testid^="progress-card-${type}"]`)
        .first();
    await expect(task).toBeVisible();
    await expect(task.locator(".badge")).toHaveText("completed", { timeout: 60_000 });
}

async function downloadZip(page, startDownload) {
    const responsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "POST" &&
            new URL(response.url()).pathname.endsWith("/zip")
        );
    });
    const downloadPromise = page.waitForEvent("download");
    await startDownload();
    const [response, download] = await Promise.all([responsePromise, downloadPromise]);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/zip");
    return download;
}

// No Web UI access path; covered by CLI tests:
// - GET /conf/me
// - DELETE /dir
test.beforeEach(async ({ page }) => {
    await login(page);
});

test("GET /user_info and GET /dir/{path}: list Gfarm directory", async ({ page }) => {
    await expect(page.getByTestId("row-download-source.txt")).toBeVisible();
    await expect(page.getByTestId("row-symlink-target")).toBeVisible();
});

test("PUT /dir/{path}: create a Gfarm directory", async ({ page }) => {
    await page.locator("#upload-dropdown").click();
    await page.getByTestId("create-directory").click();
    const modal = page.getByTestId("newdir-modal");
    await modal.locator("#create-dir-input").fill("created-by-webui");
    const responsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.includes("/dir/")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await responsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId("row-created-by-webui")).toBeVisible();
});

test("DELETE /file/{path} (recursive=on): delete a Gfarm directory through the Web UI", async ({
    page,
}) => {
    const directoryName = `deleted-by-browser-${Date.now()}`;
    await page.locator("#upload-dropdown").click();
    await page.getByTestId("create-directory").click();
    const modal = page.getByTestId("newdir-modal");
    await modal.locator("#create-dir-input").fill(directoryName);
    const createResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.includes("/dir/")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await createResponsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId(`row-${directoryName}`)).toBeVisible();

    // The Web UI deletes directories through DELETE /file with recursive=on.
    // DELETE /dir is covered by the CLI suite (test_rmdir).
    await openItemAction(page, directoryName, "delete");
    const deleteModal = page.getByTestId("delete-modal");
    const deleteResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "DELETE" &&
            new URL(response.url()).pathname.includes("/file/")
        );
    });
    await deleteModal.getByTestId("modal-button-confirm").click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.ok()).toBeTruthy();
    const deleteUrl = new URL(deleteResponse.url());
    expect(deleteUrl.searchParams.get("force")).toBe("on");
    expect(deleteUrl.searchParams.get("recursive")).toBe("on");
    await expect(page.getByTestId("global-overlay")).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`row-${directoryName}`)).not.toBeVisible();
});

test("PUT /file/{path}: upload a file to Gfarm", async ({ page }) => {
    expect(uploadFile, "GFARM_HTTP_TEST_UPLOAD_FILE must be set").toBeTruthy();
    await page.locator("#upload-dropdown").click();
    await page.getByTestId("upload-file").click();
    const uploadResponse = page.waitForResponse((response) => {
        return (
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.includes("/file/")
        );
    });
    await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles(path.resolve(uploadFile));
    expect((await uploadResponse).ok()).toBeTruthy();
    await waitForProgress(page, "upload");
    await expect(page.getByTestId("row-docker-dist-upload.txt")).toBeVisible();
});

test("GET /file/{path}: download a Gfarm file", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await openItemAction(page, "download-source.txt", "download");
    const download = await downloadPromise;
    const downloadUrl = new URL(download.url());
    expect(downloadUrl.pathname).toContain("/file/");
    expect(downloadUrl.searchParams.get("action")).toBe("download");
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe("download-source.txt");
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    expect(fs.readFileSync(downloadPath)).toEqual(fs.readFileSync(path.resolve(uploadFile)));
});

test("POST /zip: download multiple Gfarm files as a ZIP", async ({ page }) => {
    const fileNames = ["archive-one.txt", "archive-two.txt"];
    for (const fileName of fileNames) {
        await page.getByTestId(`row-${fileName}`).locator(`[id="checkbox-${fileName}"]`).check();
    }

    const download = await downloadZip(page, () =>
        page.getByTestId("action-menu-download").click()
    );
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    const zip = new AdmZip(await download.path());
    const fixture = fs.readFileSync(path.resolve(uploadFile), "utf8");
    for (const fileName of fileNames) {
        const entry = zip.getEntry(fileName);
        expect(entry, `ZIP should contain ${fileName}`).toBeTruthy();
        expect(entry.getData().toString("utf8")).toBe(fixture);
    }
});

test("POST /zip: download a Gfarm directory as a ZIP", async ({ page }) => {
    const download = await downloadZip(page, () =>
        openItemAction(page, "symlink-target", "download")
    );
    expect(download.suggestedFilename()).toMatch(/^symlink-target_\d{8}-\d{6}\.zip$/);

    const zip = new AdmZip(await download.path());
    const entry = zip.getEntry("symlink-target/target-file.txt");
    expect(entry, "ZIP should contain the file under the selected directory").toBeTruthy();
    const fixture = fs.readFileSync(path.resolve(uploadFile), "utf8");
    expect(entry.getData().toString("utf8")).toBe(fixture);
});

test("PUT /copy: copy a Gfarm file", async ({ page }) => {
    const responsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.endsWith("/copy")
        );
    });
    await openItemAction(page, "copy-source.txt", "copy");
    expect((await responsePromise).ok()).toBeTruthy();
    await waitForProgress(page, "copy");
    await expect(page.getByTestId("row-copy-source (1).txt")).toBeVisible();
});

test("POST /move: move a Gfarm file to another directory", async ({ page }) => {
    await openItemAction(page, "move-source.txt", "move");
    const modal = page.getByTestId("move-modal");
    await modal.locator("#move-dest-input").fill(`${testDirectory}/symlink-target`);
    const moveResponse = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname.endsWith("/move")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await moveResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("global-overlay")).not.toBeVisible({ timeout: 60_000 });
    await page.goto(`/#/ui${testDirectory}/symlink-target`);
    await expect(page.getByTestId("row-move-source.txt")).toBeVisible();
});

test("POST /move: rename a Gfarm file", async ({ page }) => {
    await openItemAction(page, "rename-source.txt", "rename");
    const modal = page.getByTestId("rename-modal");
    await modal.locator("#rename-input").fill("renamed-by-webui.txt");
    const moveResponse = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname.endsWith("/move")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await moveResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("global-overlay")).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("row-renamed-by-webui.txt")).toBeVisible();
});

test("DELETE /file/{path}: delete a Gfarm file", async ({ page }) => {
    await openItemAction(page, "delete-source.txt", "delete");
    const modal = page.getByTestId("delete-modal");
    await expect(modal).toContainText("delete-source.txt");
    const deleteResponse = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "DELETE" &&
            new URL(candidate.url()).pathname.includes("/file/")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await deleteResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("global-overlay")).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("row-delete-source.txt")).not.toBeVisible();
});

test("POST /symlink and GET /symlink/{path}: create and browse a symbolic link", async ({
    page,
}) => {
    await page.locator("#upload-dropdown").click();
    await page.getByTestId("create-symlink").click();
    const modal = page.getByTestId("newsym-modal");
    await modal.locator("#symlink-target-input").fill(`${testDirectory}/symlink-target`);
    await modal.locator("#symlink-linkname-input").fill(`${testDirectory}/webui-link`);
    const symlinkResponse = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname.endsWith("/symlink")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await symlinkResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("row-webui-link")).toBeVisible();
    const resolveResponsePromise = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "GET" &&
            new URL(candidate.url()).pathname.includes("/symlink/")
        );
    });
    await page.getByTestId("row-webui-link").dblclick();
    expect((await resolveResponsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId("row-target-file.txt")).toBeVisible();
});

test("GET /attr/{path}: show Gfarm file details", async ({ page }) => {
    const responsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "GET" &&
            new URL(response.url()).pathname.includes("/attr/")
        );
    });
    await openItemAction(page, "detail-source.txt", "detail");
    expect((await responsePromise).ok()).toBeTruthy();
    const pathDetail = page.getByTestId("detail-Path");
    await expect(pathDetail).toBeVisible();
    await expect(pathDetail.locator("td").nth(1)).toHaveText(`${testDirectory}/detail-source.txt`);
});

test("GET and PUT /attr/{path}: change Gfarm file permissions", async ({ page }) => {
    const getResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "GET" &&
            new URL(response.url()).pathname.includes("/attr/")
        );
    });
    await openItemAction(page, "permission-source.txt", "permissions");
    expect((await getResponsePromise).ok()).toBeTruthy();
    const tab = page.getByTestId("perms-tab");
    await tab.locator("#perms-octal-input").fill("640");
    const response = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "PUT" &&
            new URL(candidate.url()).pathname.includes("/attr/")
        );
    });
    await tab.getByTestId("update-perms-button").click();
    expect((await response).ok()).toBeTruthy();
    await expect(tab.locator("#perms-octal-input")).toHaveValue("640");
});

test("GET and PUT /acl/{path}, GET /users, GET /groups: read and update an ACL", async ({
    page,
}) => {
    const aclResponsePromise = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "GET" &&
            new URL(candidate.url()).pathname.includes("/acl/")
        );
    });
    const usersResponsePromise = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "GET" &&
            new URL(candidate.url()).pathname.endsWith("/users")
        );
    });
    const groupsResponsePromise = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "GET" &&
            new URL(candidate.url()).pathname.endsWith("/groups")
        );
    });
    await openItemAction(page, "acl-source.txt", "acl");
    const [aclResponse, usersResponse, groupsResponse] = await Promise.all([
        aclResponsePromise,
        usersResponsePromise,
        groupsResponsePromise,
    ]);
    expect(aclResponse.ok()).toBeTruthy();
    expect(usersResponse.ok()).toBeTruthy();
    expect(groupsResponse.ok()).toBeTruthy();
    const tab = page.getByTestId("acl-tab");
    await expect(tab.locator(".border.rounded.p-2.mb-2").first()).toBeVisible();
    await tab.getByTestId("add-acl-button").click();
    const entry = tab.locator(".border.rounded.p-2.mb-2").last();
    await entry.locator("select").selectOption("user");
    await entry.locator(".form-control").fill("gfarmadm");
    await entry.locator('input[id*="-r"]').check();
    const response = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "PUT" &&
            new URL(candidate.url()).pathname.includes("/acl/")
        );
    });
    await tab.getByTestId("update-acl-button").click();
    expect((await response).ok()).toBeTruthy();
});

test("POST /gfptar: create a Gfarm archive", async ({ page }) => {
    await page
        .getByTestId("row-archive-one.txt")
        .locator('[id="checkbox-archive-one.txt"]')
        .check();
    await page
        .getByTestId("row-archive-two.txt")
        .locator('[id="checkbox-archive-two.txt"]')
        .check();
    await page.getByTestId("action-menu-gfptar").click();
    const modal = page.getByTestId("gfptar-modal");
    await modal.locator("#outdir-input").fill(`${testDirectory}/webui-test.gfptar`);
    await modal.locator("#mode-create").click();
    const response = page.waitForResponse((candidate) => {
        return (
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname.endsWith("/gfptar")
        );
    });
    await modal.getByTestId("modal-button-confirm").click();
    expect((await response).ok()).toBeTruthy();
    await waitForProgress(page, "gfptar");
});
