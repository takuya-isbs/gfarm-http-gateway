import React, { useRef, useEffect, useMemo, useCallback, useState, memo } from "react";
import { VList } from "virtua";
import FileIcon from "@components/FileListView/FileIcon";
import { ItemMenu } from "@components/FileListView/FileActionMenu";
import SortDropDownMenu, { getSortIcon } from "@components/FileListView/SortDropDownMenu";
import { formatFileSize, getTimeStr } from "@utils/func";
import { useViewMode } from "@context/ViewModeContext";
import { useDateFormat } from "@context/DateFormatContext";
import "@css/FileListView.css";
import { BsListTask, BsGridFill, BsGrid3X3GapFill } from "react-icons/bs";
import { FileItemShape } from "@hooks/useFileList";
import PropTypes from "prop-types";

const HEADER_ROW_MIN = 40;
const DESKTOP_ROW_MIN = 60;
const MOBILE_ROW_MIN = 60;
const BUFFER_SIZE_PX = 100;

/* ===== Desktop row (memoized) ===== */
const RowView = memo(function RowView({
    item,
    isSelected,
    isLastSelected,
    dateFormat,
    onClick,
    onDoubleClick,
    onCheck,
    onContextMenu,
    openContextMenu,
    closeContextMenu,
    isButtonMenuOpenFor,
}) {
    return (
        <div
            className={`align-middle d-grid file-list ${isLastSelected ? "file-list-active" : ""}`}
            style={{
                gridTemplateColumns: "40px 36px 1fr 140px 180px 56px",
                alignItems: "center",
                minHeight: DESKTOP_ROW_MIN,
                padding: "0 8px",
                borderBottom: "1px solid var(--bs-border-color, #eee)",
            }}
            onContextMenu={onContextMenu}
            data-testid={`row-${item.name}`}
            onClick={() => onClick(!isSelected, item)}
            onDoubleClick={() => onDoubleClick(item)}
        >
            <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    id={"checkbox-" + item.name}
                    className="form-check-input"
                    onChange={(e) => onCheck(e.target.checked, item)}
                    checked={isSelected}
                />
            </div>

            <div>
                <span className="me-2">
                    <FileIcon
                        filename={item.name}
                        is_dir={item.is_dir}
                        is_sym={item.is_sym}
                        size={"1.8rem"}
                    />
                </span>
            </div>

            <div className="text-break">
                <div
                    className="file-item-name"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick(!isSelected, item, true);
                    }}
                >
                    {item.name}
                </div>
            </div>

            <div className="text-nowrap">{formatFileSize(item.size, item.is_dir)}</div>

            <div className="text-nowrap">{getTimeStr(item.mtime, dateFormat)}</div>

            <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <ItemMenu
                    item={item}
                    isOpen={isButtonMenuOpenFor(item)}
                    onOpen={openContextMenu}
                    onClose={closeContextMenu}
                />
            </div>
        </div>
    );
});

/* ===== Mobile row (memoized) ===== */
const RowSmView = memo(function RowSmView({
    item,
    isSelected,
    isLastSelected,
    dateFormat,
    onClick,
    onDoubleClick,
    onCheck,
    onContextMenu,
    openContextMenu,
    closeContextMenu,
    isButtonMenuOpenFor,
}) {
    return (
        <div
            className={`align-middle file-list ${isLastSelected ? "file-list-active" : ""}`}
            style={{
                minHeight: MOBILE_ROW_MIN,
                padding: "8px 8px",
                borderBottom: "1px solid var(--bs-border-color, #eee)",
            }}
            onContextMenu={onContextMenu}
            data-testid={`row-sm-${item.name}`}
        >
            <div
                className="d-grid"
                style={{
                    gridTemplateColumns: "40px 1fr 56px",
                    alignItems: "center",
                    columnGap: "8px",
                }}
            >
                <div>
                    <input
                        type="checkbox"
                        id={"checkbox-" + item.name + "-sm"}
                        className="form-check-input"
                        onChange={(e) => onCheck(e.target.checked, item)}
                        checked={isSelected}
                    />
                </div>

                <div
                    onClick={() => onClick(!isSelected, item)}
                    onDoubleClick={() => onDoubleClick(item)}
                >
                    <div className="d-flex">
                        <span className="me-2">
                            <FileIcon
                                filename={item.name}
                                is_dir={item.is_dir}
                                is_sym={item.is_sym}
                                size={"1.8rem"}
                            />
                        </span>
                        <div>
                            <div className="text-break">
                                <div
                                    className="file-item-name"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClick(!isSelected, item, true);
                                    }}
                                >
                                    {item.name}
                                </div>
                            </div>
                            <div className="small-info">
                                <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                                    {formatFileSize(item.size, item.is_dir)}
                                    {item.is_dir ? " " : " | "}
                                    {getTimeStr(item.mtime, dateFormat)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <ItemMenu
                        item={item}
                        isOpen={isButtonMenuOpenFor(item)}
                        onOpen={openContextMenu}
                        onClose={closeContextMenu}
                    />
                </div>
            </div>
        </div>
    );
});

function ListView({
    sortedItems,
    selectedItems,
    active,
    lastSelectedItem,
    handleDoubleClick,
    handleClick,
    handleSelectItem,
    handleSelectAll,
    sortDirection,
    setSortDirection,
    openContextMenu,
    closeContextMenu,
    isButtonMenuOpenFor,
}) {
    const headerCheckboxRef = useRef(null);
    const desktopListRef = useRef(null);
    const mobileListRef = useRef(null);
    const firstDesktopRowRef = useRef(null);
    const firstMobileRowRef = useRef(null);
    const { viewMode, setViewMode } = useViewMode();
    const { dateFormat } = useDateFormat();

    const selectedSet = useMemo(() => new Set(selectedItems?.map((x) => x.path)), [selectedItems]);

    const GRID_COLS = "40px 36px 1fr 140px 180px 56px";

    // Header checkbox indeterminate
    useEffect(() => {
        const el = headerCheckboxRef.current;
        if (!el) return;
        if (selectedItems.length === 0) {
            el.indeterminate = false;
            el.checked = false;
        } else if (selectedItems.length === sortedItems.length) {
            el.indeterminate = false;
            el.checked = true;
        } else {
            el.indeterminate = true;
        }
    }, [selectedItems, sortedItems]);

    // Sort helpers
    const toggleSortDirection = (column) => {
        setSortDirection((prev) => ({
            column,
            order: prev.column === column && prev.order === "asc" ? "desc" : "asc",
        }));
    };

    // View mode
    const toggleViewMode = (mode) =>
        mode === "list" ? "icon_rg" : mode === "icon_rg" ? "icon_sm" : "list";
    const toggleViewModeIcon = (mode) =>
        mode === "list" ? (
            <BsGridFill />
        ) : mode === "icon_rg" ? (
            <BsGrid3X3GapFill />
        ) : (
            <BsListTask />
        );

    // ===== Desktop filler calculation =====
    const [desktopHeight, setDesktopHeight] = useState(0);
    const [desktopRowHeight, setDesktopRowHeight] = useState(DESKTOP_ROW_MIN);

    useEffect(() => {
        const el = desktopListRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setDesktopHeight(el.clientHeight || 0));
        ro.observe(el);
        setDesktopHeight(el.clientHeight || 0);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const el = firstDesktopRowRef.current;
        if (!el) return;
        const h = el.getBoundingClientRect().height;
        if (h && Math.abs(h - desktopRowHeight) > 0.5) setDesktopRowHeight(h);
    }, [sortedItems, viewMode, desktopRowHeight]);

    const desktopRowsHeight = (sortedItems?.length || 0) * desktopRowHeight;
    const desktopFillerHeight = Math.max(0, desktopHeight - desktopRowsHeight);
    const desktopHasFiller = desktopFillerHeight > 0;
    const desktopListData = useMemo(
        () => (desktopHasFiller ? [...sortedItems, null] : sortedItems),
        [sortedItems, desktopHasFiller]
    );

    // ===== Mobile filler calculation =====
    const [mobileHeight, setMobileHeight] = useState(0);
    const [mobileRowHeight, setMobileRowHeight] = useState(MOBILE_ROW_MIN);

    useEffect(() => {
        const el = mobileListRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setMobileHeight(el.clientHeight || 0));
        ro.observe(el);
        setMobileHeight(el.clientHeight || 0);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const el = firstMobileRowRef.current;
        if (!el) return;
        const h = el.getBoundingClientRect().height;
        if (h && Math.abs(h - mobileRowHeight) > 0.5) setMobileRowHeight(h);
    }, [sortedItems, viewMode, mobileRowHeight]);

    const mobileRowsHeight = (sortedItems?.length || 0) * mobileRowHeight;
    const mobileFillerHeight = Math.max(0, mobileHeight - mobileRowsHeight);
    const mobileHasFiller = mobileFillerHeight > 0;
    const mobileListData = useMemo(
        () => (mobileHasFiller ? [...sortedItems, null] : sortedItems),
        [sortedItems, mobileHasFiller]
    );

    // Common row handlers (stable refs)
    const onRowClick = useCallback(
        (checkedOrToggle, item, force = false) => {
            return handleClick(checkedOrToggle, item, force);
        },
        [handleClick]
    );
    const onRowDbl = useCallback((item) => handleDoubleClick(item), [handleDoubleClick]);

    const onRowCheck = useCallback(
        (checkedOrToggle, item) => {
            return handleSelectItem(checkedOrToggle, item);
        },
        [handleSelectItem]
    );
    const onRowCtx = useCallback(
        (e, item) => {
            e.preventDefault();
            openContextMenu(e.pageX, e.pageY, item, "contextmenu");
        },
        [openContextMenu]
    );

    // Desktop header
    const DesktopHeader = (
        <div className="bg-body sticky-top border-bottom">
            <div
                className="align-middle d-grid px-2"
                style={{
                    gridTemplateColumns: GRID_COLS,
                    alignItems: "center",
                    minHeight: HEADER_ROW_MIN,
                }}
            >
                <div>
                    <input
                        type="checkbox"
                        className="form-check-input"
                        ref={headerCheckboxRef}
                        onChange={handleSelectAll}
                        checked={
                            selectedItems.length === sortedItems.length && sortedItems.length > 0
                        }
                        id="header-checkbox"
                        data-testid="header-checkbox"
                    />
                </div>

                {/* Icon column placeholder (match the number of columns in the body) */}
                <div />

                <div
                    className="text-nowrap"
                    onClick={() => toggleSortDirection("Name")}
                    data-testid="header-name"
                >
                    Name {getSortIcon("Name", sortDirection.column, sortDirection.order)}
                </div>

                <div
                    className="text-nowrap"
                    onClick={() => toggleSortDirection("Size")}
                    data-testid="header-size"
                >
                    Size {getSortIcon("Size", sortDirection.column, sortDirection.order)}
                </div>

                <div
                    className="text-nowrap"
                    onClick={() => toggleSortDirection("Modified")}
                    data-testid="header-date"
                >
                    Modified {getSortIcon("Modified", sortDirection.column, sortDirection.order)}
                </div>

                <div
                    className="text-end"
                    onClick={() => setViewMode(toggleViewMode(viewMode))}
                    data-testid="header-viewmode"
                >
                    {toggleViewModeIcon(viewMode)}
                </div>
            </div>
        </div>
    );

    // Mobile header
    const MobileHeader = (
        <div className="bg-body sticky-top border-bottom">
            <div
                className="d-grid px-2"
                style={{
                    gridTemplateColumns: "40px 1fr 56px",
                    alignItems: "center",
                    minHeight: HEADER_ROW_MIN,
                }}
            >
                <div>
                    <input
                        type="checkbox"
                        className="form-check-input"
                        ref={headerCheckboxRef}
                        onChange={handleSelectAll}
                        checked={
                            selectedItems.length === sortedItems.length && sortedItems.length > 0
                        }
                        id="header-checkbox-sm"
                        data-testid="header-checkbox-sm"
                    />
                </div>

                <div className="d-flex align-items-center">
                    <SortDropDownMenu
                        sortDirection={sortDirection}
                        setSortDirection={setSortDirection}
                    />
                </div>

                <div
                    className="text-end"
                    onClick={() => setViewMode(toggleViewMode(viewMode))}
                    data-testid="header-viewmode-sm"
                >
                    {toggleViewModeIcon(viewMode)}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop: virtualized with VList */}
            <div className="d-none d-sm-flex flex-column h-100" data-testid="listview">
                {DesktopHeader}
                <div ref={desktopListRef} className="flex-grow-1 min-vh-0">
                    <VList
                        data-testid="listview-scroll-desktop"
                        style={{ height: "100%" }}
                        data={desktopListData}
                        bufferSize={BUFFER_SIZE_PX}
                    >
                        {(_item, index) => {
                            if (desktopHasFiller && index === sortedItems.length) {
                                return (
                                    <div
                                        key="filler"
                                        aria-hidden="true"
                                        style={{ height: desktopFillerHeight }}
                                    />
                                );
                            }
                            const item = sortedItems[index];
                            const isSelected = selectedSet.has(item.path);
                            const isLastSelected = active && lastSelectedItem?.path === item.path;
                            const refCb =
                                index === 0 ? (el) => (firstDesktopRowRef.current = el) : undefined;

                            return (
                                <div key={item.path} ref={refCb} data-testid={`row-list-${index}`}>
                                    <RowView
                                        item={item}
                                        isSelected={isSelected}
                                        isLastSelected={isLastSelected}
                                        dateFormat={dateFormat}
                                        onClick={onRowClick}
                                        onDoubleClick={onRowDbl}
                                        onCheck={onRowCheck}
                                        onContextMenu={(e) => onRowCtx(e, item)}
                                        openContextMenu={openContextMenu}
                                        closeContextMenu={closeContextMenu}
                                        isButtonMenuOpenFor={isButtonMenuOpenFor}
                                    />
                                </div>
                            );
                        }}
                    </VList>
                </div>
            </div>

            {/* Mobile: also virtualized with VList */}
            <div className="d-flex d-sm-none flex-column h-100" data-testid="listview-sm">
                {MobileHeader}
                <div ref={mobileListRef} className="flex-grow-1 min-vh-0">
                    <VList
                        style={{ height: "100%" }}
                        data={mobileListData}
                        bufferSize={BUFFER_SIZE_PX}
                    >
                        {(_item, index) => {
                            if (mobileHasFiller && index === sortedItems.length) {
                                return (
                                    <div
                                        key="filler-sm"
                                        aria-hidden="true"
                                        style={{ height: mobileFillerHeight }}
                                    />
                                );
                            }
                            const item = sortedItems[index];
                            const isSelected = selectedSet.has(item.path);
                            const isLastSelected = active && lastSelectedItem?.path === item.path;
                            const refCb =
                                index === 0 ? (el) => (firstMobileRowRef.current = el) : undefined;

                            return (
                                <div
                                    key={item.path}
                                    ref={refCb}
                                    data-testid={`row-list-sm-${index}`}
                                >
                                    <RowSmView
                                        item={item}
                                        isSelected={isSelected}
                                        isLastSelected={isLastSelected}
                                        dateFormat={dateFormat}
                                        onClick={onRowClick}
                                        onDoubleClick={onRowDbl}
                                        onCheck={onRowCheck}
                                        onContextMenu={(e) => onRowCtx(e, item)}
                                        openContextMenu={openContextMenu}
                                        closeContextMenu={closeContextMenu}
                                        isButtonMenuOpenFor={isButtonMenuOpenFor}
                                    />
                                </div>
                            );
                        }}
                    </VList>
                </div>
            </div>
        </>
    );
}

export default ListView;

ListView.propTypes = {
    sortedItems: PropTypes.arrayOf(FileItemShape).isRequired,
    selectedItems: PropTypes.arrayOf(FileItemShape).isRequired,
    active: PropTypes.bool,
    lastSelectedItem: PropTypes.oneOfType([FileItemShape, PropTypes.oneOf([null])]),
    handleClick: PropTypes.func.isRequired,
    handleDoubleClick: PropTypes.func.isRequired,
    handleSelectItem: PropTypes.func.isRequired,
    handleSelectAll: PropTypes.func.isRequired,
    sortDirection: PropTypes.shape({
        column: PropTypes.string,
        order: PropTypes.oneOf(["asc", "desc"]),
    }).isRequired,
    setSortDirection: PropTypes.func.isRequired,
    openContextMenu: PropTypes.func.isRequired,
    closeContextMenu: PropTypes.func.isRequired,
    isButtonMenuOpenFor: PropTypes.func.isRequired,
};

RowView.propTypes = {
    item: FileItemShape.isRequired,
    isSelected: PropTypes.bool.isRequired,
    isLastSelected: PropTypes.bool,
    dateFormat: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    onClick: PropTypes.func.isRequired,
    onDoubleClick: PropTypes.func.isRequired,
    onCheck: PropTypes.func.isRequired,
    onContextMenu: PropTypes.func.isRequired,
    openContextMenu: PropTypes.func.isRequired,
    closeContextMenu: PropTypes.func.isRequired,
    isButtonMenuOpenFor: PropTypes.func.isRequired,
};

RowView.defaultProps = {
    isLastSelected: false,
};

RowSmView.propTypes = {
    item: FileItemShape.isRequired,
    isSelected: PropTypes.bool.isRequired,
    isLastSelected: PropTypes.bool,
    dateFormat: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    onClick: PropTypes.func.isRequired,
    onDoubleClick: PropTypes.func.isRequired,
    onCheck: PropTypes.func.isRequired,
    onContextMenu: PropTypes.func.isRequired,
    openContextMenu: PropTypes.func.isRequired,
    closeContextMenu: PropTypes.func.isRequired,
    isButtonMenuOpenFor: PropTypes.func.isRequired,
};

RowSmView.defaultProps = {
    isLastSelected: false,
};
