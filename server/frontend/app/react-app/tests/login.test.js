const { test, expect, trackApiRequests } = require("./api-coverage-fixture");
const fs = require("fs");
const path = require("path");

const { FRONTEND_URL, API_URL, toNDJSON, mockFileIcons } = require("./test_func");

const DIR_LIST = path.resolve(__dirname, "data/datalist.json");
const LOGIN_HTML = path.resolve(__dirname, "../../../../templates/login.html");
const PWA_JS = path.resolve(__dirname, "../../../../static/js/pwa.js");
const BOOTSTRAP_CSS = path.resolve(
    __dirname,
    "../node_modules/bootstrap/dist/css/bootstrap.min.css"
);
const BOOTSTRAP_JS = path.resolve(
    __dirname,
    "../node_modules/bootstrap/dist/js/bootstrap.bundle.min.js"
);

const loginHtmlTemplate = fs.readFileSync(LOGIN_HTML, "utf-8");
const pwaJsContent = fs.readFileSync(PWA_JS, "utf-8");
const bootstrapCssContent = fs.readFileSync(BOOTSTRAP_CSS, "utf-8");
const bootstrapJsContent = fs.readFileSync(BOOTSTRAP_JS, "utf-8");
const expectedFilename = "tmp";

function renderLoginHtml(error = "", csrfToken = "test-csrf-token") {
    return loginHtmlTemplate
        .replace(/ integrity="[^"]*"/g, "")
        .replace("{{ error }}", error)
        .replace("{{ csrf_token }}", csrfToken);
}

async function setupLoginContext(context, { initialLoggedIn = false, loginError = "" } = {}) {
    let loggedIn = initialLoggedIn;
    const unhandledRequests = [];

    await context.route("https://cdn.jsdelivr.net/**", async (route, request) => {
        const url = request.url();
        if (url.endsWith(".css")) {
            await route.fulfill({
                status: 200,
                contentType: "text/css",
                body: bootstrapCssContent,
            });
        } else if (url.endsWith(".js")) {
            await route.fulfill({
                status: 200,
                contentType: "application/javascript",
                body: bootstrapJsContent,
            });
        } else {
            unhandledRequests.push(`Unhandled CDN request: ${url}`);
            await route.abort("failed");
        }
    });

    await context.route(`${FRONTEND_URL}/assets/file_icons.json`, (route, request) =>
        mockFileIcons(route, request)
    );

    await context.route(`${API_URL}/**`, async (route, request) => {
        const requestUrl = new URL(request.url());
        const pathname = requestUrl.pathname;
        const method = request.method().toUpperCase();

        if (pathname === "/login_oidc" && method === "GET") {
            loggedIn = true;
            await route.fulfill({
                status: 200,
                contentType: "text/html",
                body: `<!doctype html><script>location.replace(${JSON.stringify(FRONTEND_URL)});</script>`,
            });
        } else if (pathname.startsWith("/dir/") && method === "GET") {
            const jsonData = JSON.parse(fs.readFileSync(DIR_LIST, "utf-8"));
            await route.fulfill({
                status: 200,
                contentType: "application/x-ndjson",
                body: toNDJSON(jsonData),
            });
        } else if (pathname === "/user_info" && method === "GET") {
            if (loggedIn) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        username: "user1",
                        loginname: "user1",
                        home_directory: "/documents",
                    }),
                });
            } else {
                await route.fulfill({
                    status: 401,
                    contentType: "application/json",
                    body: JSON.stringify({ detail: "Failed to get user info" }),
                });
            }
        } else if (pathname === "/login" && method === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "text/html",
                body: renderLoginHtml(loginError),
            });
        } else if (pathname === "/logout" && method === "GET") {
            loggedIn = false;
            await route.fulfill({
                status: 200,
                contentType: "text/html",
                body: `<!doctype html><script>location.replace(${JSON.stringify(FRONTEND_URL)});</script>`,
            });
        } else if (pathname.endsWith("/pwa.js") && method === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/javascript",
                body: pwaJsContent,
            });
        } else if (pathname.endsWith("/manifest.json") && method === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "{}",
            });
        } else {
            const msg = `Unhandled mock API request: ${method} ${request.url()}`;
            unhandledRequests.push(msg);
            await route.fulfill({
                status: 501,
                contentType: "application/json",
                body: JSON.stringify({ detail: { command: "mock", message: msg } }),
            });
        }
    });

    return { unhandledRequests };
}

// === Tests ===
let mockState = null;

test.beforeEach(async ({ context }) => {
    mockState = await setupLoginContext(context, { initialLoggedIn: false });
});

test.afterEach(() => {
    expect(mockState.unhandledRequests).toEqual([]);
});

test("Should display the login title on the login page without error banner", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveURL(/\/login$/);

    await expect(page.locator("#title")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();
});

test("Should display error banner on login page when login error is present", async ({
    browser,
}) => {
    const context = await browser.newContext();
    try {
        const state = await setupLoginContext(context, {
            initialLoggedIn: false,
            loginError: "Invalid session",
        });
        const page = await context.newPage();
        trackApiRequests(page);

        await page.goto(FRONTEND_URL);
        await expect(page).toHaveURL(/\/login$/);

        await expect(page.locator("#error")).toBeVisible();
        await expect(page.locator("#error")).toContainText("Invalid session");
        expect(state.unhandledRequests).toEqual([]);
    } finally {
        await context.close();
    }
});

test("Should display the login button for OIDC", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveURL(/\/login$/);

    await expect(page.locator("#oidc-btn")).toBeVisible();
});

test("Should submit a selected Gfarm group user for OIDC login", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveURL(/\/login$/);

    await page.locator("summary").click();
    await page.fill("#gfarm-username", "groupuser1");
    const loginRequest = page.waitForRequest((request) => request.url().includes("/login_oidc"));
    await page.click("text=Login with OpenID provider");

    expect((await loginRequest).url()).toContain("username=groupuser1");
});

test("Should log in via OIDC and show the file list", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveURL(/\/login$/);

    await page.click("text=Login with OpenID provider");

    const fileRow = page.locator(`[data-testid="row-${expectedFilename}"]`);
    await expect(fileRow).toBeVisible();
});

test("Should log out and redirect to the login screen", async ({ browser }) => {
    const context = await browser.newContext();
    try {
        const state = await setupLoginContext(context, { initialLoggedIn: true });
        const page = await context.newPage();
        trackApiRequests(page);

        await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });

        await page.click("#usermenu");
        await page.click('a:has-text("Logout")');

        await expect(page).toHaveURL(/\/login$/);
        await expect(page.locator("#oidc-btn")).toBeVisible();
        expect(state.unhandledRequests).toEqual([]);
    } finally {
        await context.close();
    }
});

// A2HS Test

test("[Android] Should trigger install prompt when A2HS button is clicked", async ({
    browserName,
    browser,
}) => {
    test.skip(browserName === "webkit", "Skip this test on Webkit");
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Mobile Safari/537.36",
        viewport: { width: 412, height: 915 },
    });
    try {
        const state = await setupLoginContext(context, { initialLoggedIn: false });
        const page = await context.newPage();
        trackApiRequests(page);

        await page.goto(FRONTEND_URL);
        await expect(page).toHaveURL(/\/login$/);

        await page.evaluate(() => {
            const event = new Event("beforeinstallprompt");
            event.preventDefault = () => {};
            event.prompt = () => {
                window.promptCalled = true;
                return Promise.resolve();
            };
            window.deferredPrompt = event;
            window.promptCalled = false;

            window.dispatchEvent(event);
        });

        const installBtn = page.locator("#installBtn");
        await expect(installBtn).toBeVisible();
        await installBtn.click();

        const promptCalled = await page.evaluate(() => window.promptCalled);
        expect(promptCalled).toBe(true);
        expect(state.unhandledRequests).toEqual([]);
    } finally {
        await context.close();
    }
});

test("[iOS] Should show instructions modal when A2HS button is clicked", async ({ browser }) => {
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 375, height: 812 },
    });

    try {
        const state = await setupLoginContext(context, { initialLoggedIn: false });
        const page = await context.newPage();
        trackApiRequests(page);

        await page.goto(FRONTEND_URL);
        await expect(page).toHaveURL(/\/login$/);

        const installBtn = page.locator("#installBtn");
        await expect(installBtn).toBeVisible();
        await installBtn.click();

        const modal = page.locator("#iosModal");
        await expect(modal).toBeVisible();
        expect(state.unhandledRequests).toEqual([]);
    } finally {
        await context.close();
    }
});

test("[Desktop] Should hide A2HS button", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveURL(/\/login$/);

    const installBtn = page.locator("#installBtn");
    await expect(installBtn).toBeHidden();
});
