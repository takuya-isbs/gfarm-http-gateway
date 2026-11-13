const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

const username = process.env.GFARM_HTTP_TEST_USERNAME;
const password = process.env.GFARM_HTTP_TEST_PASSWORD;
const passphraseFile = process.env.GFARM_HTTP_JWT_PASSPHRASE_FILE;
const jwtServerURL = process.env.JWT_SERVER_URL;

test("obtain a JWT passphrase from the docker/dist JWT Server", async ({ page }) => {
    expect(username).toBeTruthy();
    expect(password).toBeTruthy();
    expect(passphraseFile).toBeTruthy();
    expect(jwtServerURL, "JWT_SERVER_URL must be set by the docker/dist test runner").toBeTruthy();

    await page.goto(jwtServerURL);
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.locator("#kc-login").click();
    await page.waitForURL(`${new URL(jwtServerURL).origin}/**`);

    const passphraseResponsePromise = page.waitForResponse((response) => {
        return (
            response.request().method() === "POST" &&
            new URL(response.url()).pathname.endsWith("/passphrase")
        );
    });
    await page
        .getByRole("button", {
            name: /Invalidate and\s+Re-Generate\s+a JSON Web Token/,
        })
        .click();
    const passphraseResponse = await passphraseResponsePromise;
    if (!passphraseResponse.ok()) {
        throw new Error("JWT Server did not generate a passphrase successfully.");
    }

    const passphrase = (await page.locator("#passphrase").innerText()).trim();
    if (!/^[A-Za-z0-9_-]{16,}$/.test(passphrase)) {
        throw new Error("JWT Server page did not show a recognizable passphrase in #passphrase.");
    }

    fs.writeFileSync(passphraseFile, `${passphrase}\n`, { mode: 0o600 });
});
