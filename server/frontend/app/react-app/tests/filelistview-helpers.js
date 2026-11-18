const { expect } = require("@playwright/test");

async function scrollToItem(page, filename) {
    const row = page.getByTestId(`row-${filename}`);
    const scrollArea = page.getByTestId("listview-scroll-desktop");

    await expect(scrollArea).toBeVisible();

    await scrollArea.evaluate((element) => {
        element.scrollTop = 0;
    });

    for (let attempt = 0; attempt < 20; attempt++) {
        const { isVisible, reachedEnd } = await scrollArea.evaluate((element, rowTestId) => {
            const row = Array.from(element.querySelectorAll("[data-testid]")).find(
                (candidate) => candidate.getAttribute("data-testid") === rowTestId
            );
            const viewportTop = element.getBoundingClientRect().top + element.clientTop;
            const viewportBottom = viewportTop + element.clientHeight;

            if (row) {
                const rowRect = row.getBoundingClientRect();
                if (rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom) {
                    return { isVisible: true, reachedEnd: false };
                }
            }

            const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
            const scrollDirection = row && row.getBoundingClientRect().top < viewportTop ? -1 : 1;
            const nextScrollTop = Math.max(
                0,
                Math.min(element.scrollTop + scrollDirection * element.clientHeight, maxScrollTop)
            );
            element.scrollTop = nextScrollTop;

            return {
                isVisible: false,
                reachedEnd: scrollDirection > 0 && nextScrollTop >= maxScrollTop,
            };
        }, `row-${filename}`);
        if (isVisible || reachedEnd) break;
    }

    await expect
        .poll(() =>
            scrollArea.evaluate((element, rowTestId) => {
                const row = Array.from(element.querySelectorAll("[data-testid]")).find(
                    (candidate) => candidate.getAttribute("data-testid") === rowTestId
                );
                if (!row) return false;

                const rowRect = row.getBoundingClientRect();
                const viewportTop = element.getBoundingClientRect().top + element.clientTop;
                const viewportBottom = viewportTop + element.clientHeight;
                return rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom;
            }, `row-${filename}`)
        )
        .toBe(true);
    await expect(row).toBeVisible();
    return row;
}

async function openItemAction(page, filename, action) {
    const row = await scrollToItem(page, filename);
    await row.getByTestId("item-menu").click();
    await page.getByTestId(`${action}-menu-${filename}`).click();
}

module.exports = { openItemAction, scrollToItem };
