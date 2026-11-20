import {
    GFARM_PREFIX,
    PARALLEL_LIMIT,
    PARALLEL_LIMIT_MIN,
    PARALLEL_LIMIT_MAX,
} from "@utils/config";

export const encodePath = (path) => {
    let p = "/" + path.replace(/^\/+/, "").replace(/\/+$/, "");
    // URL encode without slash
    return p.replace(/[^/]/g, encodeURIComponent);
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PFX = typeof GFARM_PREFIX !== "undefined" ? String(GFARM_PREFIX) : "gfarm";
export const ESCAPED_PREFIX_FOR_REGEX = escapeRegExp(PFX);
export const RE_HAS_SCHEME_PREFIX = new RegExp(`^${ESCAPED_PREFIX_FOR_REGEX}:`, "i");
const RE_EMPTY_AUTH_SCHEME = new RegExp(`^${ESCAPED_PREFIX_FOR_REGEX}:///`, "i");
const RE_AUTH_SCHEME = new RegExp(`^${ESCAPED_PREFIX_FOR_REGEX}://`, "i");

export const normalizeGfarmUrl = (path) => {
    if (!path) return path;

    if (!RE_HAS_SCHEME_PREFIX.test(path)) return path;
    if (RE_EMPTY_AUTH_SCHEME.test(path)) return path.replace(RE_EMPTY_AUTH_SCHEME, "/");
    if (RE_AUTH_SCHEME.test(path)) return "/" + path;
    return path.replace(RE_HAS_SCHEME_PREFIX, "");
};

export const getParentPath = (path) => {
    if (!path || path === "/") return "/";
    const parts = path.split("/").filter(Boolean);
    parts.pop(); // remove last part
    if (parts.length < 1) return "/";
    return "/" + parts.join("/");
};

export const getFileName = (path) => {
    return path.split("/").pop();
};

export const getTopPath = (path) => {
    if (!path || path === "/" || path === "") return "";
    const topPath = path.split("/").filter(Boolean)[0];
    return topPath;
};

export const joinPaths = (...parts) => {
    return parts
        .map((part, i) => {
            if (i === 0) return part.trim().replace(/[/]*$/g, "");
            return part.trim().replace(/(^[/]*|[/]*$)/g, "");
        })
        .filter(Boolean)
        .join("/");
};

export const normalizePath = (path) => {
    const segments = path.split("/");
    const stack = [];

    for (const segment of segments) {
        if (segment === "..") {
            stack.pop();
        } else if (segment !== "." && segment !== "") {
            stack.push(segment);
        }
    }

    return "/" + stack.join("/");
};

export const getDeepestDirs = (dirSet) => {
    const result = [];

    for (const dirpath of dirSet) {
        // If no other dir starts with this one + "/" => it's a deepest dir
        const isDeepest = [...dirSet].every(
            (other) => other === dirpath || !other.startsWith(dirpath)
        );
        console.debug("getDeepestDirs: isDeepest:", isDeepest, dirpath);
        if (isDeepest) {
            result.push(dirpath);
        }
    }

    return result;
};

export const CollectPathsFromItems = async (items) => {
    const files = [];

    const getFile = (fileEntry) =>
        new Promise((resolve) => {
            fileEntry.file((file) => resolve(file));
        });

    const readAllItems = async (dirEntry) => {
        const reader = dirEntry.createReader();
        const out = [];
        while (true) {
            const batch = await new Promise((resolve) => reader.readEntries(resolve));
            if (!batch || batch.length === 0) break;
            out.push(...batch);
        }
        return out;
    };

    const traverseFileTree = async (item, path = "") => {
        if (item.isFile) {
            const file = await getFile(item);
            files.push({
                path: path + file.name,
                dirPath: path,
                name: file.name,
                is_file: true,
                is_dir: false,
                mtime: Math.floor(file.lastModified / 1000),
                size: file.size,
                file: file,
            });
        } else if (item.isDirectory) {
            const currentPath = path + item.name + "/";
            const children = await readAllItems(item);
            if (children.length === 0) {
                // keep empty directory
                files.push({
                    path: currentPath,
                    dirPath: path,
                    name: item.name,
                    is_file: false,
                    is_dir: true,
                    mtime: null,
                    size: null,
                });
                return;
            }

            for (const child of children) {
                await traverseFileTree(child, currentPath);
            }
        }
    };

    const promises = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
            promises.push(traverseFileTree(item));
        }
    }
    await Promise.all(promises);
    console.debug("CollectPathsFromItems:", files.length);
    return files;
};

export const CollectPathsFromFiles = (files) => {
    console.debug("CollectPathsFromFiles:", files.length);

    const uploadFiles = files.map((file) => {
        const dirPath = file.webkitRelativePath
            ? file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf("/")) + "/"
            : "";
        return {
            path: dirPath + file.name,
            dirPath: dirPath,
            name: file.name,
            is_file: !file.isDirectory,
            is_dir: file.isDirectory,
            mtime: Math.floor(file.lastModified / 1000),
            size: file.size,
            file: file,
        };
    });

    return uploadFiles;
};

export const formatFileSize = (filesize, is_dir) => {
    if (filesize === null || is_dir) {
        return "";
    }
    if (filesize === 0) {
        return "0 Bytes";
    }

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(filesize) / Math.log(k));

    const sizestr = parseFloat((filesize / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    return sizestr;
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
            locale = "en-US"; // month-day-year
            break;
        case "YMD":
            locale = "ja-JP"; // year-month-day
            break;
        case "DMY":
        default:
            locale = "en-GB"; // day-month-year
    }

    const d = new Date(time * 1000);

    if (nanos === null) {
        return d.toLocaleString(locale);
    } else {
        const offsetMin = -d.getTimezoneOffset(); // JSTなら +540
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

        // 9 桁のナノ秒文字列
        const fracStr = nanos.toString().padStart(9, "0");

        return `${dateStr} ${timeStr}.${fracStr} ${tzStr}`;
    }
};

export const loadExternalCss = (url) => {
    if (document.querySelector(`link[href="${url}"]`)) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
};

export const getFileTypes = (files) => {
    const types = new Set();

    files.forEach((file) => {
        if (file.is_dir) {
            types.add("folder");
            return;
        }

        const parts = file.name?.split(".");
        if (parts?.length > 1) {
            types.add(parts.pop().toLowerCase());
        }
    });

    return Array.from(types);
};

export const options = [
    { label: "Today", value: "today", start: 0 },
    { label: "Last 7 Days", value: "week", start: -7 },
    { label: "Last 30 days", value: "month", start: -30 },
    { label: "Last 1 year", value: "year", start: -365 },
    { label: "This Month", value: "this_month", start: 0 },
    { label: "This Year", value: "this_year", start: 0 },
];

export const filterItems = (items, filterTypes, dateFilter) => {
    const now = new Date();
    return items.filter((file) => {
        let isTypeMatch = true;
        let isDateMatch = true;
        if (filterTypes.length !== 0) {
            if (file.is_dir) {
                isTypeMatch = filterTypes.includes("folder");
            } else {
                const ext = file.name.split(".").pop().toLowerCase();
                isTypeMatch = filterTypes.includes(ext);
            }
        }

        const updated = file.mtime * 1000;
        let start = null;
        if (dateFilter == "today") {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        } else if (dateFilter === "this_month") {
            start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        } else if (dateFilter === "this_year") {
            start = new Date(now.getFullYear(), 0, 1).getTime();
        } else {
            const selected = options.find((option) => option.value === dateFilter);
            if (selected) {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                start += selected.start * 24 * 60 * 60 * 1000; // days -> ms
            }
        }
        if (start !== null) {
            isDateMatch = updated >= start;
        }

        return isDateMatch && isTypeMatch;
    });
};

export const sortItemsByName = (a, b, sortDirection) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
    }

    if (sortDirection === "asc") {
        return nameA.localeCompare(nameB);
    } else {
        return nameB.localeCompare(nameA);
    }
};

export const sortItemsBySize = (a, b, sortDirection) => {
    if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
    }
    if (sortDirection === "asc") {
        return a.size - b.size;
    } else {
        return b.size - a.size;
    }
};

export const sortItemsByUpdateDate = (a, b, sortDirection) => {
    if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
    }
    if (sortDirection === "asc") {
        return a.mtime - b.mtime;
    } else {
        return b.mtime - a.mtime;
    }
};

export const getPlatform = () => {
    const ua = window.navigator.userAgent;

    if (/android/i.test(ua)) return "android";
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "ios";
    return "desktop";
};

export const checkConflicts = (incomingItems, currentItems) => {
    const currentMap = new Map(currentItems.map((file) => [file.name, file]));
    console.debug("currentMap", currentMap);
    let hasConflict = false;

    const updatedIncoming = incomingItems.map((file) => {
        const topPath = file.dirPath ? getTopPath(file.dirPath) : "";
        if (topPath !== "") {
            const currentDir = currentMap.get(topPath);
            if (currentDir) {
                hasConflict = true;
                return {
                    ...file,
                    is_conflicted: true,
                    parent_is_conflicted: true,
                    current_size: currentDir.size,
                    current_mtime: currentDir.mtime,
                    topPath,
                };
            }
        } else {
            const current = currentMap.get(file.name);
            if (current) {
                hasConflict = true;
                return {
                    ...file,
                    is_conflicted: true,
                    parent_is_conflicted: false,
                    current_size: current.size || null,
                    current_mtime: current.mtime,
                };
            }
        }

        return {
            ...file,
            is_conflicted: false,
            parent_is_conflicted: false,
        };
    });

    return { hasConflict, incomingItems: updatedIncoming };
};

export const getUniqueConflicts = (incomingItems) => {
    const map = new Map();
    incomingItems.forEach((file) => {
        if (!file) return;
        const key = file.parent_is_conflicted ? getTopPath(file.path) : file.name;
        if (map.has(key)) return;
        map.set(
            key,
            file.parent_is_conflicted
                ? {
                      ...file,
                      name: key,
                  }
                : file
        );
    });
    return Array.from(map.values());
};

export const suggestNewName = (name, existingNames) => {
    const extIndex = name.lastIndexOf(".");
    const base = extIndex !== -1 ? name.slice(0, extIndex) : name;
    const ext = extIndex !== -1 ? name.slice(extIndex) : "";

    const match = base.match(/^(.*?)(?: \((\d+)\))?$/);
    const baseName = match[1];
    let startNum = match[2] ? parseInt(match[2], 10) + 1 : 1;

    let newName = `${baseName} (${startNum})${ext}`;
    const existing = new Set(existingNames);

    if (!existing.has(name)) {
        return name;
    }

    while (existing.has(newName)) {
        startNum++;
        newName = `${baseName} (${startNum})${ext}`;
    }
    return newName;
};

export const checkFileName = (name) => {
    return (
        name.length > 0 && // not empty
        !/[<>:"/\\|?*]/.test(name) && // no invalid chars
        !/[. ]$/.test(name) // doesn't end with space or dot
    );
};

export const hasTouchScreen = () => {
    if ("maxTouchPoints" in navigator) {
        return navigator.maxTouchPoints > 0;
    }
    if ("msMaxTouchPoints" in navigator) {
        return navigator.msMaxTouchPoints > 0;
    }

    const mQ = matchMedia?.("(pointer:coarse)");
    if (mQ?.media === "(pointer:coarse)") {
        return !!mQ.matches;
    } else if ("orientation" in window) {
        return true;
    } else {
        const UA = navigator.userAgent;
        return (
            /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) ||
            /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA)
        );
    }
};

export function closeAllModals() {
    // Close all open modals
    document.querySelectorAll(".modal.show").forEach((el) => {
        // Calls hide() if a Bootstrap instance exists
        if (window.bootstrap && window.bootstrap.Modal) {
            const inst = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
            inst.hide();
        }

        el.classList.remove("show");
        el.setAttribute("aria-hidden", "true");
        el.style.display = "none";
    });

    // Remove all backdrops
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());

    // Reset body
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("paddingRight");
}

export function createLineSplitter() {
    return new TransformStream({
        start() {
            this.buffer = "";
        },
        transform(chunk, controller) {
            this.buffer += chunk;
            let idx;
            while ((idx = this.buffer.indexOf("\n")) !== -1) {
                const line = this.buffer.slice(0, idx).replace(/\r$/, "");
                controller.enqueue(line);
                this.buffer = this.buffer.slice(idx + 1);
            }
        },
        flush(controller) {
            if (this.buffer) controller.enqueue(this.buffer.replace(/\r$/, ""));
        },
    });
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

export function normalizeParallelLimit(raw) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return clamp(PARALLEL_LIMIT, PARALLEL_LIMIT_MIN, PARALLEL_LIMIT_MAX);

    return clamp(Math.trunc(num), PARALLEL_LIMIT_MIN, PARALLEL_LIMIT_MAX);
}
