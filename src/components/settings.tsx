import * as React from "react"
import { useEffect, useRef, useCallback } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { AnimationClassNames } from "@fluentui/react/lib/Styling"
import AboutTab from "./settings/about"
import { Pivot, PivotItem, FocusTrapZone } from "@fluentui/react"
import AppTabContainer from "../containers/settings/app-container"
import RulesTab from "./settings/rules"
import ServiceTabContainer from "../containers/settings/service-container"
import LayoutTab from "./settings/layout"
import { initTouchBarWithTexts } from "../scripts/utils"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { exitSettings, openManager } from "../scripts/models/app"
import { Button, makeStyles, Spinner, tokens } from "@fluentui/react-components"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"

const useSettingsClasses = makeStyles({
    pivot: { height: "100%" },
    settingsGroup: {
        position: "absolute",
        top: "70px",
        left: "calc(50% - 404px)",
    },
    managerTab: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "12px",
        maxWidth: "520px",
        padding: "28px 4px",
    },
    managerTitle: {
        fontSize: tokens.fontSizeBase500,
        fontWeight: tokens.fontWeightSemibold,
    },
    managerIntro: {
        fontSize: tokens.fontSizeBase300,
        lineHeight: "20px",
        color: tokens.colorNeutralForeground3,
    },
})

const Settings: React.FC = () => {
    const dispatch = useAppDispatch()
    const settingsClasses = useSettingsClasses()

    const display = useAppSelector(s => s.app.settings.display)
    const blocked = useAppSelector(
        s =>
            !s.app.sourceInit ||
            s.app.syncing ||
            s.app.fetchingItems ||
            s.app.settings.saving
    )
    const exitting = useAppSelector(s => s.app.settings.saving)

    const exittingRef = useRef(exitting)
    exittingRef.current = exitting

    const close = useCallback(() => dispatch(exitSettings()), [])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !exittingRef.current) close()
        }
        if (display) {
            if (globalThis.utils.platform === "darwin")
                globalThis.utils.destroyTouchBar()
            document.body.addEventListener("keydown", onKeyDown)
        } else if (globalThis.utils.platform === "darwin") {
            initTouchBarWithTexts()
        }
        return () => {
            document.body.removeEventListener("keydown", onKeyDown)
        }
    }, [display])

    return (
        display && (
            <div className="settings-container">
                <FlatButtonGroup styleClass={settingsClasses.settingsGroup}>
                    <FlatButton
                        disabled={exitting}
                        title={intl.get("settings.exit")}
                        ariaLabel={intl.get("settings.exit")}
                        onClick={close}>
                        <Icon iconName="Back" />
                    </FlatButton>
                </FlatButtonGroup>
                <div className={"settings " + AnimationClassNames.slideUpIn20}>
                    {blocked && (
                        <FocusTrapZone
                            isClickableOutsideFocusTrap={true}
                            className="loading">
                            <Spinner
                                label={intl.get("settings.fetching")}
                                labelPosition="below"
                                size="tiny"
                                tabIndex={0}
                            />
                        </FocusTrapZone>
                    )}
                    <Pivot className={settingsClasses.pivot}>
                        <PivotItem
                            headerText={intl.get("subs.settingsTab")}
                            itemIcon="List">
                            <div className={settingsClasses.managerTab}>
                                <div className={settingsClasses.managerTitle}>
                                    {intl.get("subs.title")}
                                </div>
                                <div className={settingsClasses.managerIntro}>
                                    {intl.get("subs.settingsIntro")}
                                </div>
                                <Button
                                    appearance="primary"
                                    icon={<Icon iconName="List" />}
                                    onClick={() => dispatch(openManager())}>
                                    {intl.get("subs.settingsOpen")}
                                </Button>
                            </div>
                        </PivotItem>
                        <PivotItem
                            headerText={intl.get("settings.rules")}
                            itemIcon="FilterSettings">
                            <RulesTab />
                        </PivotItem>
                        <PivotItem
                            headerText={intl.get("settings.service")}
                            itemIcon="CloudImportExport">
                            <ServiceTabContainer />
                        </PivotItem>
                        <PivotItem
                            headerText={intl.get("settings.app")}
                            itemIcon="Settings">
                            <AppTabContainer />
                        </PivotItem>
                        <PivotItem
                            headerText={intl.get("settings.layout")}
                            itemIcon="ViewAll">
                            <LayoutTab />
                        </PivotItem>
                        <PivotItem
                            headerText={intl.get("settings.about")}
                            itemIcon="Info">
                            <AboutTab />
                        </PivotItem>
                    </Pivot>
                </div>
            </div>
        )
    )
}

export default Settings
