const fs = require("fs");
const path = require("path");
const querystring = require("node:querystring");
const { expect } = require("@playwright/test");

// ===== CONFIGURATION CONSTANTS =====
export const FRONTEND_URL = "http://localhost:3000";
export const API_URL = "http://localhost:8080";
export const ZIPNAME = "files.zip";
export const MOCK_NANOS = 123456000;

// File paths
export const DIR_LIST = path.resolve(__dirname, "data/filelist.json");
export const ACLIST = path.resolve(__dirname, "data/aclist.json");
export const DUMMYS = path.resolve(__dirname, "data/dummy");

// Routes
export const ROUTE_STORAGE = "/ui";
export const ROUTE_DOWNLOAD = "/dl";

// ===== UTILITY FUNCTIONS =====
/**
 * Checks if a file is visible in the listview
 * @param {Object} page - Playwright page object
 * @param {string} filename - Name of the file to check
 * @param {boolean} shouldNotBeVisible - If true, expects the file to NOT be visible
 */
export async function isVisible(page, filename, shouldNotBeVisible = false) {
    const listview = page.locator('[data-testid="listview"]');
    const fileRow = listview.locator(`[data-testid="row-${filename}"]`);

    if (shouldNotBeVisible) {
        await expect(fileRow).not.toBeVisible();
    } else {
        await expect(fileRow).toBeVisible();
    }
}

/**
 * Clicks a menu item from the context menu
 * @param {Object} page - Playwright page object
 * @param {string} filename - Name of the file
 * @param {string} action - Action to perform
 */
export async function clickMenuItemFromView(page, filename, action) {
    const fileRow = page.locator(`[data-testid="row-${filename}"]`);
    const menuButton = fileRow.locator('[data-testid="item-menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const actionButton = page
        .locator(".dropdown-menu")
        .locator(`[data-testid="${action}-menu-${filename}"]`);
    await expect(actionButton).toBeVisible();
    await actionButton.click();
}

/**
 * Clicks a menu item from the actions menu
 * @param {Object} page - Playwright page object
 * @param {string} action - Action to perform
 */
export async function clickMenuItemFromMenu(page, action) {
    const actionMenu = page.locator('[data-testid="action-menu"]');
    const actionButton = actionMenu.locator(`[data-testid="action-menu-${action}"]`);
    await actionButton.click();
}

/**
 * Clicks a menu item from the new menu
 * @param {Object} page - Playwright page object
 * @param {string} action - Action to perform
 */
export async function clickMenuItemFromNewMenu(page, action) {
    const uploadMenu = page.locator('[id="upload-dropdown"]');
    await uploadMenu.click();
    const menuButton = page.locator(`[data-testid="${action}"]`);
    await menuButton.click();
}

/**
 * Checks/selects a file item in the list
 * @param {Object} page - Playwright page object
 * @param {string} filename - Name of the file to check
 */
export async function checkItem(page, filename) {
    const fileRow = page.locator(`[data-testid="row-${filename}"]`);
    await expect(fileRow).toBeVisible();
    await fileRow.locator(`[id="checkbox-${filename}"]`).check();
}

// ===== DATA TRANSFORMATION UTILITIES =====
/**
 * Transforms mtime_str to Unix timestamp for file items recursively
 * @param {Array} items - Array of file/directory items
 * @returns {Array} The same array with mtime property added
 */
export function transformMtimeToUnix(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    items.forEach((item) => {
        if (item.mtime_str) {
            const dateObj = new Date(item.mtime_str);

            if (!isNaN(dateObj.getTime())) {
                item.mtime = Math.floor(dateObj.getTime() / 1000);
            } else {
                console.warn(
                    `Warning: Could not parse mtime_str: "${item.mtime_str}". 'mtime' will not be set for this item.`
                );
            }
        }

        if (item.childlen && Array.isArray(item.childlen)) {
            transformMtimeToUnix(item.childlen);
        }
    });

    return items;
}

export function loadFileStructure() {
    return transformMtimeToUnix(JSON.parse(fs.readFileSync(DIR_LIST, "utf-8")));
}

const normalizePath = (p) => {
    if (!p || p === "/") return "/";
    const cleaned = "/" + p.replace(/^\/+/, "").replace(/\/+$/, "");
    return cleaned === "" ? "/" : cleaned;
};

const shouldSearchInNode = (node, normalizedTargetPath) => {
    return (
        node.is_dir &&
        node.childlen &&
        Array.isArray(node.childlen) &&
        (normalizedTargetPath.startsWith(node.path + "/") ||
            (node.path === "/" && normalizedTargetPath !== "/"))
    );
};

/**
 * Finds children of a directory by path in the file structure
 * @param {Array} nodes - File structure nodes
 * @param {string} targetPath - Path to search for
 * @returns {Array|null} Children array or null if not found
 */
export const findChildrenByPath = (nodes, targetPath) => {
    if (targetPath === null) return null;

    const normalizedTargetPath = normalizePath(targetPath);

    for (const node of nodes) {
        if (node.path === normalizedTargetPath) {
            return node.childlen && Array.isArray(node.childlen) ? node.childlen : [];
        }

        if (shouldSearchInNode(node, normalizedTargetPath)) {
            const foundChildren = findChildrenByPath(node.childlen, normalizedTargetPath);
            if (foundChildren !== null) {
                return foundChildren;
            }
        }
    }
    return null;
};

/**
 * Finds a specific node by path in the file structure
 * @param {Array} nodes - File structure nodes
 * @param {string} targetPath - Path to search for
 * @returns {Object|null} Node object or null if not found
 */
export const findNodeByPath = (nodes, targetPath) => {
    if (targetPath === null) return null;

    const normalizedTargetPath = normalizePath(targetPath);

    for (const node of nodes) {
        if (node.path === normalizedTargetPath) {
            return node;
        }

        if (shouldSearchInNode(node, normalizedTargetPath)) {
            const foundNode = findNodeByPath(node.childlen, normalizedTargetPath);
            if (foundNode !== null) {
                return foundNode;
            }
        }
    }
    return null;
};

const addNodeToParent = (nodes, parentPath, newNode) => {
    const children = findChildrenByPath(nodes, parentPath);
    if (!children) return false;
    const existingIdx = children.findIndex((c) => c.path === newNode.path);
    if (existingIdx >= 0) {
        children[existingIdx] = newNode;
    } else {
        children.push(newNode);
    }
    return true;
};

const removeNodeByPath = (nodes, targetPath) => {
    const normalized = normalizePath(targetPath);
    for (const node of nodes) {
        if (Array.isArray(node.childlen)) {
            const idx = node.childlen.findIndex((c) => c.path === normalized);
            if (idx >= 0) {
                const [removed] = node.childlen.splice(idx, 1);
                return removed;
            }
            const nested = removeNodeByPath(node.childlen, normalized);
            if (nested) return nested;
        }
    }
    return null;
};

const updatePathsRecursively = (node, oldPrefix, newPrefix) => {
    node.path = newPrefix + node.path.slice(oldPrefix.length);
    if (Array.isArray(node.childlen)) {
        for (const child of node.childlen) {
            updatePathsRecursively(child, oldPrefix, newPrefix);
        }
    }
};

// ===== FORMATTING UTILITIES =====
/**
 * Formats file size in human-readable format
 * @param {number} filesize - File size in bytes
 * @param {boolean} is_dir - Whether the item is a directory
 * @returns {string} Formatted size string or empty for directories
 */
export const getSize = (filesize, is_dir) => {
    if (is_dir) return "";
    if (filesize === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(filesize) / Math.log(k));

    return `${parseFloat((filesize / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const formatBytes = (bytes) => {
    if (bytes == null) return "";
    return new Intl.NumberFormat("en-US").format(bytes) + " bytes";
};

export const getTimeStr = (time, format = "YMD", nanos = null) => {
    if (!time) return "unknown";

    let locale;
    switch (format) {
        case "MDY":
            locale = "en-US";
            break;
        case "YMD":
            locale = "ja-JP";
            break;
        case "DMY":
        default:
            locale = "en-GB";
    }

    const d = new Date(time * 1000);

    if (nanos === null) {
        return d.toLocaleString(locale);
    } else {
        const offsetMin = -d.getTimezoneOffset();
        const sign = offsetMin >= 0 ? "+" : "-";
        const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
        const mm = String(Math.abs(offsetMin) % 60).padStart(2, "0");
        const tzStr = `${sign}${hh}${mm}`;
        const dateStr = d.toLocaleDateString(locale);
        const timeStr = [
            String(d.getHours()).padStart(2, "0"),
            String(d.getMinutes()).padStart(2, "0"),
            String(d.getSeconds()).padStart(2, "0"),
        ].join(":");

        const fracStr = nanos.toString().padStart(9, "0");

        return `${dateStr} ${timeStr}.${fracStr} ${tzStr}`;
    }
};

const FILE_ICON_MAP = {
    pdf: "bi bi-file-earmark-pdf",
    jpg: "bi bi-file-earmark-image",
    jpeg: "bi bi-file-earmark-image",
    png: "bi bi-file-earmark-image",
    gif: "bi bi-file-earmark-image",
    mp4: "bi bi-file-earmark-play",
    webm: "bi bi-file-earmark-play",
    mp3: "bi bi-file-earmark-music",
    wav: "bi bi-file-earmark-music",
    js: "bi bi-file-earmark-code",
    py: "bi bi-file-earmark-code",
    html: "bi bi-file-earmark-code",
    css: "bi bi-file-earmark-code",
    zip: "bi bi-file-earmark-zip",
    rar: "bi bi-file-earmark-zip",
    tar: "bi bi-file-earmark-zip",
    gz: "bi bi-file-earmark-zip",
};

/**
 * Gets appropriate Bootstrap icon class for file type
 * @param {string} ext - File extension
 * @param {boolean} is_dir - Whether the item is a directory
 * @param {boolean} is_sym - Whether the item is a symbolic link
 * @returns {string} Bootstrap icon class name
 */
export const getFileIconDefault = (ext, is_dir, is_sym) => {
    if (is_dir) return "bi bi-folder-fill";
    if (is_sym) return "bi bi-link-45deg";

    return FILE_ICON_MAP[ext?.toLowerCase()] || "bi bi-file-earmark";
};

/**
 * Reads dummy file content for testing
 * @param {string} filename - Name of the dummy file
 * @returns {string} File content
 */
export const getDummyFileContent = (filename) => {
    return fs.readFileSync(path.join(DUMMYS, filename), "utf8");
};

// ===== TEST UTILITIES =====

/**
 * Create a deferred promise for deterministic async synchronization in route mocks.
 */
export function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/**
 * Freeze time for testing purposes.
 * @param {Object} page - Playwright page object
 * @param {string} isoDate - ISO-formatted date string
 * @returns {Promise<void>}
 */
export async function freezeTime(page, isoDate) {
    await page.addInitScript((isoDate) => {
        const fixed = new Date(isoDate);
        const OriginalDate = Date;

        class MockDate extends OriginalDate {
            constructor(...args) {
                return args.length === 0 ? new OriginalDate(fixed) : new OriginalDate(...args);
            }

            static now() {
                return fixed.getTime();
            }

            static parse = OriginalDate.parse;
            static UTC = OriginalDate.UTC;

            static [Symbol.hasInstance](instance) {
                return instance instanceof OriginalDate;
            }
        }

        window.Date = MockDate;
    }, isoDate);
}

/**
 * Convert `-rwxrwxrwx` to octal.
 * @param {string} symbolic - Symbolic mode string (e.g. '-rwxr-xr--')
 * @returns {string} Octal representation (e.g. '0754')
 */
export function symbolicToOctal(symbolic) {
    if (typeof symbolic !== "string" || symbolic.length < 10) return null;

    const perms = symbolic.slice(1);

    const calculateDigit = (permStr) =>
        (permStr[0] === "r" ? 4 : 0) + (permStr[1] === "w" ? 2 : 0) + (permStr[2] === "x" ? 1 : 0);

    const owner = calculateDigit(perms.slice(0, 3));
    const group = calculateDigit(perms.slice(3, 6));
    const other = calculateDigit(perms.slice(6, 9));

    return `${owner}${group}${other}`;
}

// ===== ROUTE MOCKING =====

/**
 * Intercepts a specific API endpoint on `page` and records every matched request
 * without performing assertions inside the route callback.
 * Non-matching requests fall back to underlying context/page routes.
 */
export async function mockEndpoint(
    page,
    method,
    pathname,
    {
        statusCode = 200,
        contentType = "application/json",
        response = "",
        headers,
        match,
        onRequest,
    } = {}
) {
    const calls = [];
    const expectedMethod = method.toUpperCase();
    const normalizedExpected = pathname ? normalizePath(pathname) : null;

    await page.route(`${API_URL}/**`, async (route, request) => {
        const requestUrl = new URL(request.url());
        const decodedPath = normalizePath(decodeURIComponent(requestUrl.pathname));

        const methodMatches = request.method().toUpperCase() === expectedMethod;
        const pathMatches = match
            ? match(requestUrl, decodedPath)
            : decodedPath === normalizedExpected;

        if (!methodMatches || !pathMatches) {
            return await route.fallback();
        }

        const postData = request.postData();
        let jsonBody = null;
        if (postData) {
            try {
                jsonBody = JSON.parse(postData);
            } catch {
                jsonBody = null;
            }
        }

        const callRecord = {
            method: request.method(),
            url: request.url(),
            pathname: decodedPath,
            searchParams: requestUrl.searchParams,
            postData,
            json: jsonBody,
            headers: request.headers(),
        };
        calls.push(callRecord);

        if (onRequest) {
            await onRequest(route, request, callRecord);
            return;
        }

        const fulfillOptions = {
            status: statusCode,
            body: response,
        };
        if (headers) {
            fulfillOptions.headers = headers;
        } else if (contentType) {
            fulfillOptions.contentType = contentType;
        }

        await route.fulfill(fulfillOptions);
    });

    return calls;
}

export async function mockMoveRoute(page, { statusCode = 200, response = "" } = {}) {
    return mockEndpoint(page, "POST", "/move", {
        statusCode,
        contentType: statusCode >= 400 ? "application/json" : "text/plain",
        response: typeof response === "string" ? response : JSON.stringify(response),
    });
}

// ===== ROUTE HANDLERS =====

export const toNDJSON = (data) => {
    if (Array.isArray(data)) return data.map((x) => JSON.stringify(x)).join("\n") + "\n";
    if (data && typeof data === "object") return JSON.stringify(data) + "\n";
    return "";
};

const gfarmErrorBody = (command, message) =>
    JSON.stringify({
        detail: {
            command,
            message,
            stdout: "",
            stderr: [message],
        },
    });

/**
 * Create a stateful route handler backed by an isolated copy of fileStructureData.
 */
export function createRouteHandler({
    fileStructure = loadFileStructure(),
    unhandledRequests = [],
} = {}) {
    const handleDirGetRoute = async (route, requestUrl) => {
        const rawDirPath = requestUrl.pathname.replace(/^\/dir/, "") || "/";
        const dirPath = normalizePath(decodeURIComponent(rawDirPath));
        const effperm = requestUrl.searchParams.get("effperm");
        const showHidden = requestUrl.searchParams.get("show_hidden");
        const outputFormat = requestUrl.searchParams.get("output_format") || "json";

        if (effperm === "on") {
            await route.fulfill({
                status: 200,
                contentType: "application/x-ndjson",
                body: toNDJSON([{ perms: "rwx" }]),
            });
            return;
        }

        const children = findChildrenByPath(fileStructure, dirPath);
        if (children !== null) {
            const filtered =
                showHidden === "off"
                    ? children.filter((item) => !item.name.startsWith("."))
                    : children;
            if (outputFormat === "plain") {
                await route.fulfill({
                    status: 200,
                    contentType: "text/plain",
                    body: filtered.map((item) => item.name).join("\n"),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: "application/x-ndjson",
                    body: toNDJSON(filtered),
                });
            }
        } else {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: gfarmErrorBody("gfls", "no such file or directory"),
            });
        }
    };

    const handleDirPutRoute = async (route, requestUrl) => {
        const rawDirPath = requestUrl.pathname.replace(/^\/dir/, "") || "/";
        const dirPath = normalizePath(decodeURIComponent(rawDirPath));
        const parentPath = path.posix.dirname(dirPath);
        const name = path.posix.basename(dirPath);

        addNodeToParent(fileStructure, parentPath, {
            mode_str: "drwxr-xr-x",
            is_file: false,
            is_dir: true,
            is_sym: false,
            nlink: 2,
            uname: "user1",
            gname: "users",
            size: 4096,
            mtime: Math.floor(Date.now() / 1000),
            mtime_str: "Jun  1 12:00:00 2025",
            name,
            path: dirPath,
            childlen: [],
        });

        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "",
        });
    };

    const handleUserInfoRoute = async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                username: "user1",
                loginname: "user1",
                home_directory: "/documents",
            }),
        });
    };

    const handleAttrRoute = async (route, requestUrl) => {
        const rawPath = requestUrl.pathname.replace(/^\/attr/, "") || "/";
        const filePath = normalizePath(decodeURIComponent(rawPath));
        const fileNode = findNodeByPath(fileStructure, filePath);

        if (fileNode) {
            const d = new Date(fileNode.mtime_str);
            const sec = Math.floor(d.getTime() / 1000);
            const filetype = fileNode.is_sym
                ? "symbolic link"
                : fileNode.is_dir
                  ? "directory"
                  : "regular file";

            const detailResponse = {
                File: fileNode.path,
                Filetype: filetype,
                Size: fileNode.size,
                Mode: symbolicToOctal(fileNode.mode_str),
                Ncopy: 1,
                Access: fileNode.mtime_str,
                AccessSeconds: sec,
                AccessNanos: MOCK_NANOS,
                Modify: fileNode.mtime_str,
                ModifySeconds: sec,
                ModifyNanos: MOCK_NANOS,
                Change: fileNode.mtime_str,
                ChangeSeconds: sec,
                ChangeNanos: MOCK_NANOS,
                Uid: fileNode.uname,
                Gid: fileNode.gname,
                MetadataHost: "test-host.local",
                MetadataPort: "601",
                MetadataUser: "testuser",
                Cksum: "123456",
                CksumType: "test",
            };
            if (fileNode.is_sym && requestUrl.searchParams.get("check_symlink") === "on") {
                detailResponse.LinkPath = fileNode.linkname || fileNode.path;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(detailResponse),
            });
        } else {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: gfarmErrorBody("gfstat", "no such file or directory"),
            });
        }
    };

    const handleSymlinkGetRoute = async (route, requestUrl) => {
        const rawPath = requestUrl.pathname.replace(/^\/symlink/, "") || "/";
        const symlinkPath = normalizePath(decodeURIComponent(rawPath));
        const targetNode = findNodeByPath(fileStructure, symlinkPath);

        if (!targetNode) {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: gfarmErrorBody("gfstat", "no such file or directory"),
            });
            return;
        }

        const resolved = targetNode.is_sym
            ? findNodeByPath(fileStructure, targetNode.linkname)
            : targetNode;

        if (!resolved) {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: gfarmErrorBody("gfstat", "no such file or directory"),
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                name: resolved.name,
                path: resolved.path,
                is_file: !!resolved.is_file,
                is_dir: !!resolved.is_dir,
                is_sym: false,
            }),
        });
    };

    const handleSymlinkPostRoute = async (route, request) => {
        const body = request.postDataJSON?.();
        if (body?.destination) {
            const destPath = normalizePath(body.destination);
            const parentPath = path.posix.dirname(destPath);
            const name = path.posix.basename(destPath);
            addNodeToParent(fileStructure, parentPath, {
                mode_str: "lrwxrwxrwx",
                is_file: false,
                is_dir: false,
                is_sym: true,
                linkname: body.source || "",
                nlink: 1,
                uname: "user1",
                gname: "users",
                size: (body.source || "").length,
                mtime: Math.floor(Date.now() / 1000),
                mtime_str: "Jun  1 12:00:00 2025",
                name,
                path: destPath,
            });
        }
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "",
        });
    };

    const handleFileGetRoute = async (route, requestUrl) => {
        const rawPath = requestUrl.pathname.replace(/^\/file/, "") || "/";
        const filePath = decodeURIComponent(rawPath).replace(/^\/+/, "");
        const filename = filePath.split("/").pop();
        const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
        const action = requestUrl.searchParams.get("action") || "view";

        if (filename === "deleted_file.txt") {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: gfarmErrorBody("gfexport", `File not found: /${filePath}`),
            });
            return;
        }

        let body;
        let contentType;
        if (filename.includes("empty")) {
            body = "";
            contentType = "text/plain";
        } else if (ext === "html") {
            body = `<!DOCTYPE html><html><body><h1>${filePath} Content</h1><p>This file was displayed in a new tab.</p></body></html>`;
            contentType = "text/html";
        } else if (ext === "pdf") {
            body = Buffer.from(
                "JVBERi0xLjQKJdDUxdgKMSAwIG9iagogIDw8L1BhZ2VzIDIgMCBSD4u (a very short PDF string) ...",
                "base64"
            );
            contentType = "application/pdf";
        } else {
            body = `This is the content of /${filePath}.`;
            contentType = "text/plain";
        }

        const headers = {
            "content-type": contentType,
            "content-length": Buffer.byteLength(body).toString(),
        };

        if (action === "download") {
            const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "");
            const encoded = encodeURIComponent(filename);
            headers["content-disposition"] =
                `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
        }

        await route.fulfill({
            status: 200,
            body,
            headers,
        });
    };

    const handleFilePutRoute = async (route, requestUrl) => {
        const rawPath = requestUrl.pathname.replace(/^\/file/, "") || "/";
        const filePath = normalizePath(decodeURIComponent(rawPath));
        const parentPath = path.posix.dirname(filePath);
        const name = path.posix.basename(filePath);

        addNodeToParent(fileStructure, parentPath, {
            mode_str: "-rw-r--r--",
            is_file: true,
            is_dir: false,
            is_sym: false,
            nlink: 1,
            uname: "user1",
            gname: "users",
            size: 100,
            mtime: Math.floor(Date.now() / 1000),
            mtime_str: "Jun  1 12:00:00 2025",
            name,
            path: filePath,
        });

        await route.fulfill({
            status: 200,
            body: "",
        });
    };

    const handleFileDeleteRoute = async (route, requestUrl) => {
        const rawPath = requestUrl.pathname.replace(/^\/file/, "") || "/";
        const targetPath = normalizePath(decodeURIComponent(rawPath));
        removeNodeByPath(fileStructure, targetPath);

        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "",
        });
    };

    const handleZipRoute = async (route, request) => {
        const postData = request.postData();
        const parsed = querystring.parse(postData);
        const files = Array.isArray(parsed["paths"]) ? parsed["paths"] : [parsed["paths"]];

        const AdmZip = require("adm-zip");
        const zip = new AdmZip();

        for (const item of files) {
            const node = findNodeByPath(fileStructure, item);

            if (node) {
                const entryPath = node.name;

                if (node.is_file) {
                    let fileContent = `Dummy content for ${node.path}. Size: ${getSize(node.size, node.is_dir)}`;
                    if (node.size === 0) {
                        fileContent = "";
                    }
                    zip.addFile(entryPath, Buffer.from(fileContent, "utf8"));
                } else {
                    zip.addFile(entryPath + "/", Buffer.from(""));
                }
            } else {
                console.warn(`[ROUTE MOCK] Path not found in mock data: ${item}`);
            }
        }

        const zipContentBuffer = zip.toBuffer();
        const headers = {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename=${ZIPNAME}`,
            "Content-Length": zipContentBuffer.length.toString(),
        };

        await route.fulfill({
            status: 200,
            body: zipContentBuffer,
            headers,
        });
    };

    const handleUsersRoute = async (route, requestUrl) => {
        const longFormat = requestUrl.searchParams.get("long_format");
        const users = ["userA", "userB", "userC", "admin"];
        const list =
            longFormat === "on" || longFormat === "true"
                ? users.map((u) => ({
                      id: u,
                      name: u,
                      home_directory: `/home/${u}`,
                      identifier: u,
                  }))
                : users;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ list }),
        });
    };

    const handleGroupsRoute = async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ list: ["groupA", "groupB", "developers", "testers"] }),
        });
    };

    const handleAclGetRoute = async (route) => {
        const mockAclData = JSON.parse(fs.readFileSync(ACLIST, "utf-8"));
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ acl: mockAclData }),
        });
    };

    const handleAclPutRoute = async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "",
        });
    };

    const handleMoveRoute = async (route, request) => {
        const body = request.postDataJSON?.();
        if (body?.source && body?.destination) {
            const srcPath = normalizePath(body.source);
            const dstPath = normalizePath(body.destination);
            const moved = removeNodeByPath(fileStructure, srcPath);
            if (moved) {
                moved.name = path.posix.basename(dstPath);
                updatePathsRecursively(moved, srcPath, dstPath);
                addNodeToParent(fileStructure, path.posix.dirname(dstPath), moved);
            }
        }
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "",
        });
    };

    return async (route, request) => {
        const requestUrl = new URL(request.url());
        const pathname = requestUrl.pathname;
        const method = request.method().toUpperCase();

        if (pathname.startsWith("/dir/") && method === "GET") {
            await handleDirGetRoute(route, requestUrl);
        } else if (pathname.startsWith("/dir/") && method === "PUT") {
            await handleDirPutRoute(route, requestUrl);
        } else if (pathname === "/user_info" && method === "GET") {
            await handleUserInfoRoute(route);
        } else if (pathname.startsWith("/attr/") && method === "GET") {
            await handleAttrRoute(route, requestUrl);
        } else if (pathname.startsWith("/symlink/") && method === "GET") {
            await handleSymlinkGetRoute(route, requestUrl);
        } else if (pathname === "/symlink" && method === "POST") {
            await handleSymlinkPostRoute(route, request);
        } else if (pathname.startsWith("/file/") && method === "GET") {
            await handleFileGetRoute(route, requestUrl);
        } else if (pathname.startsWith("/file/") && method === "PUT") {
            await handleFilePutRoute(route, requestUrl);
        } else if (pathname.startsWith("/file/") && method === "DELETE") {
            await handleFileDeleteRoute(route, requestUrl);
        } else if (pathname === "/zip" && method === "POST") {
            await handleZipRoute(route, request);
        } else if (pathname === "/users" && method === "GET") {
            await handleUsersRoute(route, requestUrl);
        } else if (pathname === "/groups" && method === "GET") {
            await handleGroupsRoute(route);
        } else if (pathname.startsWith("/acl/") && method === "GET") {
            await handleAclGetRoute(route);
        } else if (pathname.startsWith("/acl/") && method === "PUT") {
            await handleAclPutRoute(route);
        } else if (pathname === "/move" && method === "POST") {
            await handleMoveRoute(route, request);
        } else {
            const msg = `Unhandled mock API request: ${method} ${request.url()}`;
            unhandledRequests.push(msg);
            console.error(`[MOCK ERROR] ${msg}`);
            await route.fulfill({
                status: 501,
                contentType: "application/json",
                body: gfarmErrorBody("mock", msg),
            });
        }
    };
}

export async function setupApiMocks(context, options = {}) {
    const fileStructure = options.fileStructure || loadFileStructure();
    const unhandledRequests = [];
    const handler = createRouteHandler({ fileStructure, unhandledRequests });

    await context.route(`${API_URL}/**`, handler);
    await context.route(`${FRONTEND_URL}/assets/file_icons.json`, (route, request) =>
        mockFileIcons(route, request)
    );

    return { fileStructure, unhandledRequests };
}

export async function mockFileIcons(route, request) {
    const url = request.url();
    if (url.includes("file_icons.json")) {
        return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "File not found" }),
        });
    }
    return route.fallback();
}
