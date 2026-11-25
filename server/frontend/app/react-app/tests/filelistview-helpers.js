const { expect } = require("@playwright/test");

async function scrollToItem(page, filename) {
    const row = page.getByTestId(`row-${filename}`);
    const scrollArea = page.getByTestId("listview-scroll-desktop");

    await expect(scrollArea).toBeVisible();

    await scrollArea.evaluate((element) => {
        element.scrollTop = 0;
    });

    await expect
        .poll(
            () =>
                scrollArea.evaluate((element, rowTestId) => {
                    const row = Array.from(element.querySelectorAll("[data-testid]")).find(
                        (candidate) => candidate.getAttribute("data-testid") === rowTestId
                    );
                    const viewportTop = element.getBoundingClientRect().top + element.clientTop;
                    const viewportBottom = viewportTop + element.clientHeight;

                    if (row) {
                        const rowRect = row.getBoundingClientRect();
                        if (rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom) {
                            return true;
                        }
                    }

                    const referenceRow =
                        row || element.querySelector('.file-list[data-testid^="row-"]');
                    const rowHeight = referenceRow?.getBoundingClientRect().height ?? 0;
                    // Overlap adjacent viewports by at least one row so no row is skipped.
                    const scrollStep = Math.max(
                        1,
                        Math.min(
                            Math.floor(element.clientHeight * 0.9),
                            element.clientHeight - rowHeight
                        )
                    );
                    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
                    const scrollDirection =
                        row && row.getBoundingClientRect().top < viewportTop ? -1 : 1;
                    element.scrollTop = Math.max(
                        0,
                        Math.min(element.scrollTop + scrollDirection * scrollStep, maxScrollTop)
                    );
                    return false;
                }, `row-${filename}`),
            {
                intervals: [50],
                timeout: 15_000,
                message: `Could not scroll to virtualized row "${filename}"`,
            }
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
