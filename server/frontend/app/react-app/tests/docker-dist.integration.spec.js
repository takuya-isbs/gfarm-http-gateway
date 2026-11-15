const { test, expect } = require("@playwright/test");
const path = require("node:path");

const gatewayURL = process.env.GFARM_HTTP_GATEWAY_URL;
const username = process.env.GFARM_HTTP_TEST_USERNAME;
const password = process.env.GFARM_HTTP_TEST_PASSWORD;
const testDirectory = process.env.GFARM_HTTP_TEST_DIRECTORY;
const clientUploadedFilename = process.env.GFARM_HTTP_CLIENT_UPLOADED_FILENAME;
const webUploadedFilename = process.env.GFARM_HTTP_WEB_UPLOADED_FILENAME;
const uploadFile = process.env.GFARM_HTTP_TEST_UPLOAD_FILE;

test("real Keycloak login and Gfarm file sharing with gfarm-http", async ({ page }) => {
    for (const [name, value] of Object.entries({
        gatewayURL,
        username,
        password,
        testDirectory,
        clientUploadedFilename,
        webUploadedFilename,
        uploadFile,
    })) {
        expect(value, `${name} must be set by the docker/dist test runner`).toBeTruthy();
    }

    await page.goto("/login");
    await page.locator("#oidc-btn").click();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.locator("#kc-login").click();
    // Wait until Keycloak has redirected back to the gateway and the login
    // page is gone, so the next navigation does not interrupt the login.
    await page.waitForURL(
        (url) => url.origin === new URL(gatewayURL).origin && !url.pathname.startsWith("/login")
    );

    const directoryResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "GET" &&
            new URL(response.url()).pathname.includes("/dir/")
        );
    });
    await page.goto(`/#/ui${testDirectory}`);
    expect((await directoryResponsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId(`row-${clientUploadedFilename}`)).toBeVisible();

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
    const uploadTask = page
        .locator('[data-testid="progress-view"]')
        .locator('[data-testid^="progress-card-upload"]');
    await expect(uploadTask).toBeVisible();
    await expect(uploadTask.locator(".badge")).toHaveText("completed", {
        timeout: 30_000,
    });
});
