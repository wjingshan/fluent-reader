import * as React from "react"
import { closeContextMenu } from "../scripts/models/app"
import Page from "./page"
import { Menu } from "./menu"
import Nav from "./nav"
import Settings from "./settings"
import SubscriptionManager from "./subscriptions/manager"
import SourceSettingsDialog from "./subscriptions/source-dialog"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import { ContextMenu } from "./context-menu"
import LogMenu from "./log-menu"
import {
    FluentProvider,
    makeStyles,
    mergeClasses,
} from "@fluentui/react-components"
import { useEffect, useMemo, useState } from "react"
import { ThemeProvider } from "@fluentui/react"
import { CUSTOM_STYLE_HOOKS, createAppTheme } from "./utils/theme"
import { CustomStyleHooksProvider_unstable as CustomStyleHooksProvider } from "@fluentui/react-shared-contexts"
import { getFontFamilyForLocale } from "../scripts/settings"
import { applyLayoutVariables } from "../scripts/layout"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"

const useClasses = makeStyles({
    root: {
        background: "none",
        height: "100%",
    },
    articleBackground: {
        // Directly blurred backgrounds fade to transparency at the window edges.
        backgroundColor: "var(--neutralLighterAlt)",
    },
    articleBackgroundDarwin: {
        // Fade the opaque backing in with the article scrim.
        animationName: {
            from: { backgroundColor: "transparent" },
            to: { backgroundColor: "var(--neutralLighterAlt)" },
        },
        animationDuration: "0.5s",
        animationTimingFunction: "var(--transition-timing)",
        animationFillMode: "backwards",
    },
})

const Root: React.FC = () => {
    const dispatch = useAppDispatch()
    const locale = useAppSelector(s => s.app.locale)
    const articleOverlayOpen = useArticleOverlayOpen()

    const classes = useClasses()
    const [isDarkMode, setIsDarkMode] = useState(() =>
        globalThis.settings.shouldUseDarkColors()
    )
    const layout = useAppSelector(s => s.app.layout)
    const managerOpen = useAppSelector(s => s.app.manager.display)
    useEffect(() => {
        applyLayoutVariables(layout)
    }, [layout])
    useEffect(() => {
        globalThis.settings.addThemeUpdateListener(shouldDark => {
            setIsDarkMode(shouldDark)
        })
    }, [])
    const themeBundle = useMemo(
        () => createAppTheme(isDarkMode, getFontFamilyForLocale(locale)),
        [isDarkMode, locale]
    )
    return (
        locale && (
            <ThemeProvider
                theme={themeBundle.v8Theme}
                applyTo="none"
                style={{ height: "100%" }}>
                <FluentProvider
                    theme={themeBundle.v9Theme}
                    className={classes.root}>
                    <CustomStyleHooksProvider value={CUSTOM_STYLE_HOOKS}>
                        <div
                            id="root"
                            key={locale}
                            className={
                                articleOverlayOpen
                                    ? mergeClasses(
                                          classes.articleBackground,
                                          globalThis.utils.platform ===
                                              "darwin" &&
                                              classes.articleBackgroundDarwin
                                      )
                                    : undefined
                            }
                            onMouseDown={() => dispatch(closeContextMenu())}
                            style={managerOpen ? { display: "none" } : undefined}>
                            <Nav />
                            <Page />
                            <LogMenu />
                            <Menu />
                            <Settings />
                            <SubscriptionManager />
                            <ContextMenu />
                        </div>
                        {/* Outside #root: the manager hides #root, and this
                            dialog must stay visible on top of either view. */}
                        <SourceSettingsDialog />
                    </CustomStyleHooksProvider>
                </FluentProvider>
            </ThemeProvider>
        )
    )
}

export default Root
