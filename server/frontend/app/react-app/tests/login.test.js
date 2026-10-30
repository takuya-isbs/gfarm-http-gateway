const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const { FRONTEND_URL, API_URL, toNDJSON } = require("./test_func");

const DIR_LIST = path.resolve(__dirname, "data/datalist.json");

let login = false;

// Read login.html once at the start
const LOGIN_HTML = path.resolve(__dirname, "../../../../templates/login.html");
const PWA_JS = path.resolve(__dirname, "../../../../static/js/pwa.js");
const htmlContent = fs.readFileSync(LOGIN_HTML, "utf-8");
const expectedFilename = "tmp";

// Route handler
async function login_handleRoute(route, request) {
    const url = request.url();
    if (url.includes("/login_oidc")) {
        console.log("/login_oidc", url);
        login = true;
        await route.fulfill({
            status: 302,
            headers: { Location: FRONTEND_URL },
        });
    } else if (url.includes("/login_passwd")) {
        console.log("/login_passwd", url);
        const postData = await request.postDataJSON?.();
        const formData = new URLSearchParams(postData || request.postData());

        if (formData.get("username") === "user1" && formData.get("password") === "pass1") {
            login = true;
            console.log("Simulate successful login", url);
            route.fulfill({
                status: 302,
                headers: {
                    location: FRONTEND_URL, // Redirect to some post-login page
                },
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "text/html",
                body: htmlContent,
            });
        }
    } else if (url.includes("/dir/")) {
        console.log("/dir/", url);
        const jsonData = JSON.parse(fs.readFileSync(DIR_LIST, "utf-8"));
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: toNDJSON(jsonData),
        });
    } else if (url.includes("/user_info")) {
        console.log("/user_info", url);
        if (login) {
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
            const responseData = {
                detail: {
                    command: "user_info",
                    message: "Authentication error",
                    stdout: "",
                    stderr: "",
                },
            };
            await route.fulfill({
                status: 401,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(responseData),
            });
        }
    } else if (url.includes("/login")) {
        console.log("/login", url);
        await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: htmlContent,
        });
    } else if (url.includes("/logout")) {
        console.log("/logout", url);
        login = false;
        // Simulate redirect to index page "/"
        route.fulfill({
            status: 303, // HTTP See Other for redirect after POST/GET
            headers: {
                location: FRONTEND_URL, // Redirect to some post-login page
            },
            body: "",
        });
    } else if (url.includes("pwa.js")) {
        const jsContent = fs.readFileSync(PWA_JS, "utf-8");
        await route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: jsContent,
        });
    } else {
        await route.continue();
    }
}

// === Tests ===
test.beforeEach(async ({ context }) => {
    await context.route(`${API_URL}/**`, (route, request) => login_handleRoute(route, request));
});
// Login Process Test

test("Should display the login title on the login page", async ({ page }) => {
    login = false;
    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    await expect(page.locator("#title")).toBeVisible();
});

test("Should display the login button for OIDC", async ({ page }) => {
    login = false;
    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    await expect(page.locator("#oidc-btn")).toBeVisible();
});

test("Should submit a selected Gfarm group user for OIDC login", async ({
    page,
}) => {
    login = false;
    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    await page.locator("summary").click();
    await page.fill("#gfarm-username", "groupuser1");
    const loginRequest = page.waitForRequest((request) =>
        request.url().includes("/login_oidc")
    );
    await page.click("text=Login with OpenID provider");

    expect((await loginRequest).url()).toContain("username=groupuser1");
});

test("Should log in via OIDC and show the file list", async ({ page }) => {
    login = false;
    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    await page.click("text=Login with OpenID provider");

    await page.waitForLoadState("networkidle");

    const fileRow = page.locator(`[data-testid="row-${expectedFilename}"]`);
    await expect(fileRow).toBeVisible();
});

// test("Should log in with valid SASL credentials and show the file list", async ({ page }) => {
//     login = false;
//     await page.goto(FRONTEND_URL);
//     await page.waitForFunction(() => window.location.href.includes("/login"));

//     await page.fill("#username", "user1");
//     await page.fill("#password", "pass1");

//     // Submit the form
//     const navigationPromise = page.waitForNavigation();
//     await page.click('button[type="submit"]');
//     await navigationPromise;

//     await page.waitForLoadState("networkidle");

//     const fileRow = page.locator(`[data-testid="row-${expectedFilename}"]`);
//     await expect(fileRow).toBeVisible();
// });

// test("Should stay on the login page with invalid SASL credentials", async ({ page }) => {
//     login = false;
//     await page.goto(FRONTEND_URL);
//     await page.waitForFunction(() => window.location.href.includes("/login"));

//     await page.fill("#username", "wronguser");
//     await page.fill("#password", "wrongpass");

//     const navigationPromise = page.waitForNavigation();
//     await page.click('button[type="submit"]');
//     await navigationPromise;

//     await expect(page).toHaveURL(/login/);
// });

// Logout Process Test

test("Should log out and redirect to the login screen", async ({ page }) => {
    login = true;
    await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });

    await page.click("#usermenu");
    await page.click('a:has-text("Logout")');

    await expect(page).toHaveURL(/login/);
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
    const page = await context.newPage();
    await page.route(`${API_URL}/**`, login_handleRoute);
    login = false;

    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    await page.evaluate(() => {
        // Create a fake deferredPrompt object
        const event = new Event("beforeinstallprompt");
        event.preventDefault = () => {};
        event.prompt = () => {
            window.promptCalled = true;
            return Promise.resolve();
        };
        window.deferredPrompt = event;
        window.promptCalled = false;

        // Manually dispatch the event
        window.dispatchEvent(event);
    });

    const installBtn = await page.locator("#installBtn");
    await expect(installBtn).toBeVisible();

    await installBtn.click();

    const promptCalled = await page.evaluate(() => window.promptCalled);
    expect(promptCalled).toBe(true);

    await context.close();
});

test("[iOS] Should show instructions modal when A2HS button is clicked", async ({ browser }) => {
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 375, height: 812 },
    });

    const page = await context.newPage();
    await page.route(`${API_URL}/**`, login_handleRoute);
    login = false;

    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    const installBtn = page.locator("#installBtn");
    await expect(installBtn).toBeVisible();

    await installBtn.click();

    const modal = page.locator("#iosModal");
    await modal.count();
    await expect(modal).toBeVisible();

    await context.close();
});

test("[Desktop] Should hide A2HS button", async ({ page }) => {
    login = false;

    await page.goto(FRONTEND_URL);
    await page.waitForFunction(() => window.location.href.includes("/login"));

    const installBtn = await page.locator("#installBtn");
    await expect(installBtn).toBeHidden();
});
