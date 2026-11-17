import { makeStyles, tokens } from "@fluentui/react-components"

/* Flipping a row mid-drag is drawn by the reorder hook straight onto the row
   element, so the only drag style that lives here is the resting cursor. */
export const useGroupStyles = makeStyles({
    row: { display: "flex", gap: "8px", alignItems: "flex-start" },
    grow: { flex: 1, minWidth: 0 },
    grid: { maxHeight: "400px", overflowY: "auto" },
    draggable: { cursor: "grab", userSelect: "none" },
    hint: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    toolbar: { display: "flex", alignItems: "center", minHeight: "32px" },
    toolbarButton: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        width: "auto",
        paddingLeft: "8px",
        paddingRight: "8px",
    },
    toolbarSeparator: { width: "16px", fontSize: "16px" },
})
