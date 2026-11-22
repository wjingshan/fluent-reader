import * as React from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { makeStyles, tokens } from "@fluentui/react-components"
import { useAppDispatch } from "../scripts/reducer"
import { openManager, toggleSettings } from "../scripts/models/app"

// Bottom-left entry points of the reading list: subscription manager + settings.
// They used to live in the top nav; keeping them next to the feed list makes
// them reachable without travelling to the title bar.
const useClasses = makeStyles({
    dock: {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        flex: "0 0 36px",
        padding: "0 6px",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
        boxSizing: "border-box",
    },
    item: {
        "display": "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "36px",
        height: "26px",
        padding: "0",
        border: "none",
        borderRadius: "4px",
        background: "transparent",
        cursor: "pointer",
        color: tokens.colorNeutralForeground2,
        fontSize: "14px",
        lineHeight: "14px",
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground2Hover,
            color: tokens.colorNeutralForeground1,
        },
        ":focus-visible": {
            outline: `1px solid ${tokens.colorStrokeFocus2}`,
            outlineOffset: "1px",
        },
    },
})

const SidebarDock: React.FC = () => {
    const classes = useClasses()
    const dispatch = useAppDispatch()

    return (
        <div className={classes.dock}>
            <button
                type="button"
                className={classes.item}
                title={intl.get("subs.title")}
                aria-label={intl.get("subs.title")}
                onClick={() => dispatch(openManager())}>
                <Icon iconName="List" />
            </button>
            <button
                type="button"
                className={classes.item}
                title={intl.get("nav.settings")}
                aria-label={intl.get("nav.settings")}
                onClick={() => dispatch(toggleSettings())}>
                <Icon iconName="Settings" />
            </button>
        </div>
    )
}

export default SidebarDock
