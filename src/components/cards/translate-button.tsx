import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { RSSItem } from "../../scripts/models/item"
import {
    clearTranslationError,
    toggleTranslation,
    translationMessage,
} from "../../scripts/translate"
import { useTranslation } from "../utils/hooks/useTranslation"

const useStyles = makeStyles({
    // Pinned to the card's top right corner. The info row keeps a reserved gap
    // on its right (see list-card.tsx) so the source name and time never slide
    // underneath, and the cover thumbnail sits on the opposite side.
    button: {
        "position": "absolute",
        "top": "3px",
        "right": "3px",
        "zIndex": 1,
        "width": "22px",
        "height": "22px",
        "minWidth": 0,
        "padding": 0,
        "boxSizing": "border-box",
        "display": "flex",
        "alignItems": "center",
        "justifyContent": "center",
        "borderRadius": "3px",
        "border": "1px solid var(--neutralQuaternaryAlt)",
        "backgroundColor": "var(--neutralLighterAltOpacity)",
        "color": "var(--neutralSecondary)",
        "fontFamily": "inherit",
        "fontSize": "12px",
        "fontWeight": 600,
        "lineHeight": 1,
        "cursor": "pointer",
        "outlineStyle": "none",
        "transition": "background-color 0.1s, color 0.1s, border-color 0.1s",
        ":hover": {
            backgroundColor: "var(--neutralLight)",
            color: "var(--neutralPrimary)",
        },
        ":active": {
            backgroundColor: "var(--neutralQuaternaryAlt)",
        },
        ":focus-visible": {
            border: "1px solid var(--primary)",
        },
    },
    // Translation is on: the card body shows the Chinese text.
    active: {
        "border": "1px solid var(--primary)",
        "backgroundColor": "var(--primary)",
        "color": "var(--whiteConstant)",
        ":hover": {
            backgroundColor: "var(--primary)",
            color: "var(--whiteConstant)",
        },
    },
    loading: {
        cursor: "progress",
        opacity: 0.6,
    },
    // A failed attempt flashes red before the card resets the button.
    failed: {
        "border": "1px solid #c42b1c",
        "backgroundColor": "#c42b1c",
        "color": "var(--whiteConstant)",
        ":hover": {
            backgroundColor: "#c42b1c",
            color: "var(--whiteConstant)",
        },
    },
})

const ERROR_VISIBLE_MS = 4000

const TranslateButton: React.FunctionComponent<{ item: RSSItem }> = props => {
    const classes = useStyles()
    const record = useTranslation(props.item)
    const loading = record?.status === "loading"
    const failed = record?.status === "error"
    const translated = Boolean(record?.showTranslation)

    useEffect(() => {
        if (!failed) return
        // Leave the button idle again so the next click simply retries. The
        // reason itself stays in the native title attribute.
        const timer = setTimeout(() => {
            clearTranslationError(props.item._id)
        }, ERROR_VISIBLE_MS)
        return () => clearTimeout(timer)
    }, [failed, props.item._id])

    const hint = failed
        ? translationMessage(record)
        : loading
        ? intl.get("translate.loading")
        : translated
        ? intl.get("translate.showOriginal")
        : intl.get("translate.action")

    // Deliberately a native title instead of a Fluent UI tooltip: this project
    // uses Fluent v8, and a v9 <Tooltip> without a provider mounts a full-screen
    // FluentProvider (z-index 1000000, pointer-events auto) per card, which
    // swallows every real mouse click in the window.
    return (
        <button
            type="button"
            title={hint}
            aria-label={hint}
            className={mergeClasses(
                classes.button,
                translated && classes.active,
                loading && classes.loading,
                failed && classes.failed
            )}
            onClick={event => {
                // Keep the click away from the card: it would open the
                // article, mark it read and steal the selection.
                event.preventDefault()
                event.stopPropagation()
                if (!loading) toggleTranslation(props.item)
            }}
            onMouseUp={event => {
                // Right click still reaches the card's own context menu.
                if (event.button === 2) return
                event.preventDefault()
                event.stopPropagation()
            }}
            onDoubleClick={event => {
                event.preventDefault()
                event.stopPropagation()
            }}>
            {loading
                ? "…"
                : failed
                ? "!"
                : translated
                ? intl.get("translate.glyphActive")
                : intl.get("translate.glyphIdle")}
        </button>
    )
}

export default TranslateButton
