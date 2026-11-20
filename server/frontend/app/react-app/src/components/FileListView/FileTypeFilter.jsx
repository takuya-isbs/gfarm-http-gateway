import React from "react";
import PropTypes from "prop-types";

function FileTypeFilter({ parentName, fileTypes, filterTypes, setFilterTypes }) {
    const toggleType = (type) => {
        setFilterTypes((prev) =>
            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
        );
    };

    const clearAllTypes = () => {
        setFilterTypes([]);
    };

    const filterLabel =
        filterTypes.length > 0
            ? `Types: ${filterTypes.map((t) => (t === "folder" ? "Folder" : t.toLowerCase())).join(", ")}`
            : "Filter by type";

    return (
        <div className="btn-group" role="group">
            <button
                className="btn btn-sm dropdown-toggle btn-outline-secondary"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                data-testid="file-filter-dropdown"
            >
                {filterLabel}
            </button>
            <ul className="dropdown-menu p-2" style={{ minWidth: "150px" }}>
                <li>
                    <button
                        className="btn btn-sm btn-link text-danger d-flex w-100"
                        onClick={clearAllTypes}
                        type="button"
                        data-testid="file-filter-clear-button"
                    >
                        Clear filter
                    </button>
                </li>
                <hr className="dropdown-divider" />
                {fileTypes &&
                    fileTypes.map((type) => (
                        <li key={type} htmlFor={`dropdown-filter-${type}`}>
                            <label
                                className="form-check-label d-flex w-100 gap-2"
                                htmlFor={`${parentName}-dropdown-filter-${type}`}
                            >
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    value={type}
                                    id={`${parentName}-dropdown-filter-${type}`}
                                    checked={filterTypes.includes(type)}
                                    onChange={() => toggleType(type)}
                                />
                                {type.toLowerCase()}
                            </label>
                        </li>
                    ))}
            </ul>
        </div>
    );
}

export default FileTypeFilter;

FileTypeFilter.propTypes = {
    parentName: PropTypes.string,
    fileTypes: PropTypes.array,
    filterTypes: PropTypes.array,
    setFilterTypes: PropTypes.func,
};
