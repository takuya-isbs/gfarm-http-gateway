import React from "react";
import { formatBytes, getTimeStr } from "@utils/func";
import { useDateFormat } from "@context/DateFormatContext";
import PropTypes from "prop-types";

function DetailTab({ active, detailContent }) {
    const { dateFormat } = useDateFormat();
    if (!active) return null;

    const rows = [
        { label: "Path", value: detailContent?.File || "" },
        detailContent?.LinkPath && { label: "Link", value: detailContent?.LinkPath || "" },
        { label: "Type", value: detailContent?.Filetype || "" },
        { label: "Size", value: formatBytes(detailContent?.Size || 0, false) },
        { label: "Mode", value: detailContent?.Mode || "" },
        { label: "Ncopy", value: detailContent?.Ncopy || "" },
        { label: "Owner", value: detailContent?.Uid || "" },
        { label: "Group", value: detailContent?.Gid || "" },
        {
            label: "Access",
            value: getTimeStr(detailContent?.AccessSeconds, dateFormat, detailContent?.AccessNanos),
        },
        {
            label: "Modify",
            value: getTimeStr(detailContent?.ModifySeconds, dateFormat, detailContent?.ModifyNanos),
        },
        {
            label: "Change",
            value: getTimeStr(detailContent?.ChangeSeconds, dateFormat, detailContent?.ChangeNanos),
        },
        {
            label: "Digest",
            value: `${detailContent?.Cksum || ""}${detailContent?.CksumType ? ` (${detailContent.CksumType})` : ""}`,
        },
    ].filter(Boolean);

    return (
        <div>
            <table className="table table-striped table-bordered mt-4">
                <tbody>
                    {rows.map(({ label, value }) => (
                        <tr key={label} data-testid={`detail-${label}`}>
                            <td>
                                <strong>{label}</strong>
                            </td>
                            <td className="text-break">{value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default DetailTab;

DetailTab.propTypes = {
    active: PropTypes.bool,
    detailContent: PropTypes.object,
};
