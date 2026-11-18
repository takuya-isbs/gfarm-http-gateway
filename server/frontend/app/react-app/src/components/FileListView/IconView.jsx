import React, { useRef, useEffect, useMemo, useState, useCallback, memo } from "react";
import { VList } from "virtua";
import FileIcon from "@components/FileListView/FileIcon";
import { ItemMenu } from "@components/FileListView/FileActionMenu";
import SortDropDownMenu from "@components/FileListView/SortDropDownMenu";
import { formatFileSize, getTimeStr } from "@utils/func";
import { useViewMode } from "@context/ViewModeContext";
import { useDateFormat } from "@context/DateFormatContext";
import "@css/FileListView.css";
import { BsListTask, BsGridFill, BsGrid3X3GapFill } from "react-icons/bs";
import { FileItemShape } from "@hooks/useFileList";
import PropTypes from "prop-types";

const CARD_MIN_REG = 240; // viewMode: icon_rg
const CARD_MIN_SM = 150; // viewMode: icon_sm
const GRID_GAP = 16;
const ROW_MIN_HEIGHT = 180;
const BUFFER_SIZE_PX = 100;
const HEADER_GRID_COLS = "40px 1fr 56px";
const HEADER_ROW_MIN = 40;

// ===== Card (memoized) =====
const Card = memo(function Card({
    item,
    isSelected,
    isActive,
    iconPixelSize,
    dateFormat,
    onClick,
    onDoubleClick,
    onContextMenu,
    openContextMenu,
    closeContextMenu,
    isButtonMenuOpenFor,
    onCheck,
    iconSize,
}) {
    return (
        <div
            className={`col file-item position-relative ${isActive ? "file-item-active" : ""} ${
                iconSize === "small" ? "grid-item-sm" : "grid-item"
            }`}
            onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(e, item);
            }}
        >
            <input
                type="checkbox"
                id={"checkbox-" + item.name}
                className="form-check-input position-absolute top-0 start-0 m-1"
                checked={isSelected}
                onChange={(e) => onCheck(e.target.checked, item)}
            />
            <div
                className="file-icon text-center mt-2"
                onClick={() => onClick(!isSelected, item)}
                onDoubleClick={() => onDoubleClick(item)}
            >
                <FileIcon
                    filename={item.name}
                    is_dir={item.is_dir}
                    is_sym={item.is_sym}
                    size={iconPixelSize}
                />
            </div>
            <div
                className="file-name text-center text-break mt-1"
                onClick={() => onClick(!isSelected, item)}
                onDoubleClick={() => onDoubleClick(item)}
            >
                <div
                    className="file-item-name"
                    role="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick(!isSelected, item, true);
                    }}
                >
                    {item.name}
                </div>
            </div>
            <div
                className="text-muted text-center text-break px-3"
                style={{ fontSize: "0.8rem" }}
                onClick={() => onClick(!isSelected, item)}
                onDoubleClick={() => onDoubleClick(item)}
            >
                {formatFileSize(item.size, item.is_dir)}
                <br />
                {getTimeStr(item.mtime, dateFormat)}
            </div>
            <div className="position-absolute bottom-0 end-0 mt-2">
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

function IconView({
    sortedItems,
    selectedItems,
    active,
    lastSelectedItem,
    handleDoubleClick,
    handleClick,
    handleSelectItem,
    iconSize,
    handleSelectAll,
    sortDirection,
    setSortDirection,
    openContextMenu,
    closeContextMenu,
    isButtonMenuOpenFor,
}) {
    const headerCheckboxRef = useRef(null);
    const listRef = useRef(null); // wrapper around VList (measure height/width and scrollbar)
    const firstRowRef = useRef(null); // measure first row height for dynamic row sizing
    const { viewMode, setViewMode } = useViewMode();
    const { dateFormat } = useDateFormat();

    // icon size & grid class
    const iconPixelSize = iconSize === "small" ? "1.5rem" : "3rem";
    const gridContainerClass =
        iconSize === "small" ? "grid-container grid-small" : "grid-container grid-regular";

    // selection set for O(1) checks
    const selectedSet = useMemo(() => new Set(selectedItems?.map((x) => x.path)), [selectedItems]);

    // header checkbox indeterminate state
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

    // view mode helpers
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

    // ===== Container measurements (height, width, scrollbar width) =====
    const [containerHeight, setContainerHeight] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;

        const measure = () => {
            setContainerHeight(el.clientHeight || 0);
            setContainerWidth(el.clientWidth || 0);
        };

        const ro = new ResizeObserver(measure);
        ro.observe(el);
        measure();

        el.addEventListener("scroll", measure, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener("scroll", measure);
        };
    }, []);

    // ===== Compute columns per row based on width/gap/card min width =====
    const colMin = iconSize === "small" ? CARD_MIN_SM : CARD_MIN_REG;
    const [colCount, setColCount] = useState(1);
    useEffect(() => {
        const usable = Math.max(0, containerWidth - GRID_GAP); // minor fudge factor
        const per = colMin + GRID_GAP;
        setColCount(Math.max(1, Math.floor((usable + GRID_GAP) / per))); // account for gaps
    }, [containerWidth, colMin]);

    const rowCount = Math.max(1, Math.ceil((sortedItems?.length || 0) / colCount));

    // ===== Measure first row height and compute filler =====
    const [rowHeight, setRowHeight] = useState(ROW_MIN_HEIGHT);
    useEffect(() => {
        const el = firstRowRef.current;
        if (!el) return;
        const h = el.getBoundingClientRect().height;
        if (h && Math.abs(h - rowHeight) > 0.5) setRowHeight(h);
    }, [sortedItems, iconSize, colCount, rowHeight]);

    const rowsAreaHeight = rowCount * rowHeight;
    const fillerHeight = Math.max(0, containerHeight - rowsAreaHeight);
    const hasFiller = fillerHeight > 0;
    const listData = useMemo(
        () => Array.from({ length: rowCount + (hasFiller ? 1 : 0) }, (_, index) => index),
        [rowCount, hasFiller]
    );

    // ===== Row interaction handlers (stable refs) =====
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

    // ===== Header =====
    const Header = (
        <div className="px-2 border-bottom">
            {/* pad-right equals scrollbar width to keep header aligned with list body */}
            <div className="bg-body sticky-top">
                <div
                    className="d-grid align-items-center"
                    style={{ gridTemplateColumns: HEADER_GRID_COLS, minHeight: HEADER_ROW_MIN }}
                >
                    {/* [1] checkbox column */}
                    <div>
                        <input
                            type="checkbox"
                            className="form-check-input"
                            ref={headerCheckboxRef}
                            onChange={handleSelectAll}
                            checked={
                                selectedItems.length === sortedItems.length &&
                                sortedItems.length > 0
                            }
                            id="header-checkbox-sm"
                            data-testid="header-checkbox-sm"
                        />
                    </div>

                    {/* [2] center column (Sort menu) */}
                    <div className="d-flex align-items-center">
                        <SortDropDownMenu
                            sortDirection={sortDirection}
                            setSortDirection={setSortDirection}
                        />
                    </div>

                    {/* [3] right column (view mode toggle) */}
                    <div
                        className="text-end"
                        onClick={() => setViewMode(toggleViewMode(viewMode))}
                        data-testid="header-viewmode-sm"
                    >
                        {toggleViewModeIcon(viewMode)}
                    </div>
                </div>
            </div>
        </div>
    );

    // ===== Render a single "row" (grid of N cards) =====
    const renderRow = (rowIndex) => {
        const start = rowIndex * colCount;
        const end = Math.min(sortedItems.length, start + colCount);
        const slice = sortedItems.slice(start, end);

        // attach a ref to the first row for height measurement
        const rowRef = rowIndex === 0 ? (el) => (firstRowRef.current = el) : undefined;

        return (
            <div className="px-1" ref={rowRef}>
                <div
                    className={gridContainerClass}
                    style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                        gap: `${GRID_GAP}px`,
                    }}
                >
                    {slice.map((item) => {
                        const isSelected = selectedSet.has(item.path);
                        const isActive = active && lastSelectedItem?.path === item.path;
                        return (
                            <Card
                                key={item.path}
                                item={item}
                                isSelected={isSelected}
                                isActive={isActive}
                                iconPixelSize={iconPixelSize}
                                dateFormat={dateFormat}
                                onClick={onRowClick}
                                onDoubleClick={onRowDbl}
                                onCheck={onRowCheck}
                                onContextMenu={onRowCtx}
                                openContextMenu={openContextMenu}
                                closeContextMenu={closeContextMenu}
                                isButtonMenuOpenFor={isButtonMenuOpenFor}
                                iconSize={iconSize === "small" ? "small" : "regular"}
                            />
                        );
                    })}
                    {/* Fill empty columns for the last row so alignment stays consistent */}
                    {end === sortedItems.length &&
                        end - start < colCount &&
                        Array.from({ length: colCount - (end - start) }).map((_, i) => (
                            <div key={`__empty_${i}`} />
                        ))}
                </div>
            </div>
        );
    };

    return (
        <div className="d-flex flex-column h-100">
            {Header}

            {/* Scrollable area. Let VList own the scroll; keep the parent overflow hidden. */}
            <div ref={listRef} className="flex-grow-1 min-vh-0">
                <VList
                    style={{ height: "100%", scrollbarGutter: "stable" }}
                    data={listData}
                    bufferSize={BUFFER_SIZE_PX}
                >
                    {(index) => {
                        // append a filler block so the list visually fills the viewport
                        if (hasFiller && index === rowCount) {
                            return (
                                <div
                                    key="filler"
                                    aria-hidden="true"
                                    style={{ height: fillerHeight }}
                                />
                            );
                        }
                        return (
                            <div key={`row_${index}`} data-testid={`row-icon-${index}`}>
                                {renderRow(index)}
                            </div>
                        );
                    }}
                </VList>
            </div>
        </div>
    );
}

export default IconView;

IconView.propTypes = {
    sortedItems: PropTypes.arrayOf(FileItemShape).isRequired,
    selectedItems: PropTypes.arrayOf(FileItemShape).isRequired,
    active: PropTypes.bool,
    lastSelectedItem: PropTypes.oneOfType([FileItemShape, PropTypes.oneOf([null])]),
    handleClick: PropTypes.func.isRequired,
    handleDoubleClick: PropTypes.func.isRequired,
    handleSelectItem: PropTypes.func.isRequired,
    iconSize: PropTypes.oneOf(["small", "regular"]).isRequired,
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

Card.propTypes = {
    item: FileItemShape.isRequired,
    isSelected: PropTypes.bool.isRequired,
    isActive: PropTypes.bool,
    iconPixelSize: PropTypes.string.isRequired,
    dateFormat: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    onClick: PropTypes.func.isRequired,
    onDoubleClick: PropTypes.func.isRequired,
    onContextMenu: PropTypes.func.isRequired,
    openContextMenu: PropTypes.func.isRequired,
    closeContextMenu: PropTypes.func.isRequired,
    isButtonMenuOpenFor: PropTypes.func.isRequired,
    onCheck: PropTypes.func.isRequired,
    iconSize: PropTypes.oneOf(["small", "regular"]).isRequired,
};
