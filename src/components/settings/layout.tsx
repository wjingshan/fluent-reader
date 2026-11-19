import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    Dialog,
    DialogFooter,
    DialogType,
    Dropdown,
    IDropdownOption,
    PrimaryButton,
    Slider,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    countCustomLayout,
    DEFAULT_LAYOUT_CONFIG,
    LAYOUT_RANGES,
    LayoutConfig,
    LayoutNumberKey,
    ViewType,
} from "../../schema-types"
import { resetLayoutConfig, updateLayoutConfig } from "../../scripts/models/app"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { availableCardFonts } from "../../scripts/layout"
import LayoutPreview from "./layout/preview"

const SYSTEM_FONT_KEY = "__system__"

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        paddingBottom: "24px",
    },
    toolbar: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
    },
    status: {
        flexGrow: 1,
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        userSelect: "none",
    },
    hint: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
    },
    previewRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "6px",
    },
    previewLabel: { fontSize: "13px" },
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        paddingTop: "14px",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
    },
    sectionHead: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    // Three columns: a setting that owns a whole row of its own (the font picker)
    // spans all of them, everything else fills the next free cell.
    sectionBody: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        columnGap: "28px",
        rowGap: "10px",
    },
    itemWide: {
        gridColumn: "1 / -1",
    },
    sectionTitle: {
        flexGrow: 1,
        fontSize: "14px",
        fontWeight: 600,
        margin: 0,
    },
    item: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    },
    itemHead: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "8px",
    },
    itemLabel: { fontSize: "13px" },
    itemValue: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        fontVariantNumeric: "tabular-nums",
    },
    dropdown: { width: "240px" },
})

type LayoutItemDef = {
    key: LayoutNumberKey
    labelKey: string
    // Suffix after the number; pixels unless the setting counts something else.
    unitKey?: string
    hintKey?: string
}

type LayoutGroupDef = {
    key: string
    titleKey: string
    items: LayoutItemDef[]
    // The card font picker belongs to the shared group only.
    font?: boolean
    keys: (keyof LayoutConfig)[]
    // Which preview view this group belongs to. Absent means it applies to every
    // view (the shared metrics), so it stays visible whatever is selected.
    view?: ViewType
}

const GROUPS: LayoutGroupDef[] = [
    {
        key: "common",
        titleKey: "layout.groupCommon",
        font: true,
        items: [
            {
                key: "cardTitleSize",
                labelKey: "layout.cardTitleSize",
                hintKey: "layout.cardTitleSizeHint",
            },
            { key: "cardSnippetSize", labelKey: "layout.cardSnippetSize" },
            { key: "cardGap", labelKey: "layout.cardGap" },
        ],
        keys: ["cardTitleSize", "cardSnippetSize", "cardGap", "cardFont"],
    },
    {
        key: "cards",
        titleKey: "layout.groupCards",
        view: ViewType.Cards,
        items: [
            { key: "cardsColumnWidth", labelKey: "layout.cardsColumnWidth" },
            { key: "cardsRowHeight", labelKey: "layout.cardsRowHeight" },
        ],
        keys: ["cardsColumnWidth", "cardsRowHeight"],
    },
    {
        key: "list",
        titleKey: "layout.groupList",
        view: ViewType.List,
        items: [
            { key: "listCoverHeight", labelKey: "layout.listCoverHeight" },
            { key: "listTitleSize", labelKey: "layout.listTitleSize" },
        ],
        keys: ["listCoverHeight", "listTitleSize"],
    },
    {
        key: "magazine",
        titleKey: "layout.groupMagazine",
        view: ViewType.Magazine,
        items: [
            {
                key: "magazineCoverHeight",
                labelKey: "layout.magazineCoverHeight",
            },
        ],
        keys: ["magazineCoverHeight"],
    },
    {
        key: "compact",
        titleKey: "layout.groupCompact",
        view: ViewType.Compact,
        items: [
            { key: "compactRowHeight", labelKey: "layout.compactRowHeight" },
        ],
        keys: ["compactRowHeight"],
    },
    {
        key: "waterfall",
        titleKey: "layout.groupWaterfall",
        view: ViewType.Customized,
        items: [
            {
                key: "waterfallMinColumnWidth",
                labelKey: "layout.waterfallMinColumnWidth",
            },
            { key: "waterfallGap", labelKey: "layout.waterfallGap" },
            {
                key: "waterfallMaxTiles",
                labelKey: "layout.waterfallMaxTiles",
                unitKey: "layout.unitTiles",
                hintKey: "layout.waterfallMaxTilesHint",
            },
        ],
        keys: ["waterfallMinColumnWidth", "waterfallGap", "waterfallMaxTiles"],
    },
]

const PREVIEW_VIEWS: { view: ViewType; key: string }[] = [
    { view: ViewType.Cards, key: "layout.viewCards" },
    { view: ViewType.List, key: "layout.viewList" },
    { view: ViewType.Magazine, key: "layout.viewMagazine" },
    { view: ViewType.Compact, key: "layout.viewCompact" },
    { view: ViewType.Customized, key: "layout.viewWaterfall" },
]

function isChanged(config: LayoutConfig, keys: (keyof LayoutConfig)[]) {
    return keys.some(key => config[key] !== DEFAULT_LAYOUT_CONFIG[key])
}

type NumberRowProps = {
    def: LayoutItemDef
    value: number
    onChange: (key: LayoutNumberKey, value: number) => void
}

function NumberRow({ def, value, onChange }: NumberRowProps) {
    const classes = useStyles()
    const range = LAYOUT_RANGES[def.key]
    const defaultValue = DEFAULT_LAYOUT_CONFIG[def.key]
    const label = intl.get(def.labelKey)
    const unit = def.unitKey ? intl.get(def.unitKey) : "px"
    return (
        <div className={classes.item}>
            <div className={classes.itemHead}>
                <span className={classes.itemLabel}>{label}</span>
                <span className={classes.itemValue}>
                    {value} {unit}
                    {" · "}
                    {intl.get("layout.defaultHint", { value: defaultValue })}
                </span>
            </div>
            <Slider
                ariaLabel={label}
                min={range.min}
                max={range.max}
                step={range.step}
                value={value}
                showValue={false}
                snapToStep
                onChange={next => onChange(def.key, next)}
            />
            {def.hintKey ? (
                <span className={classes.hint}>{intl.get(def.hintKey)}</span>
            ) : null}
        </div>
    )
}

const LayoutTab: React.FC = () => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const layout = useAppSelector(state => state.app.layout)
    const currentView = useAppSelector(state => state.page.viewType)
    // The preview follows the view the app is currently showing until the user
    // picks another one from the dropdown.
    const [previewView, setPreviewView] = useState<ViewType>(currentView)
    const [confirmReset, setConfirmReset] = useState(false)

    // The installed-font list arrives asynchronously after startup, so this is
    // rebuilt on each render instead of memoized at mount: a panel opened during
    // startup would otherwise stay empty and never recover.
    const fontOptions: IDropdownOption[] = [
        { key: SYSTEM_FONT_KEY, text: intl.get("followSystem") },
    ]
    for (const font of availableCardFonts()) {
        fontOptions.push({ key: font.family, text: font.label })
    }

    const customCount = countCustomLayout(layout)
    const previewOptions: IDropdownOption[] = PREVIEW_VIEWS.map(item => ({
        key: item.view,
        text: intl.get(item.key),
    }))
    const resolvedFont = layout.cardFont || intl.get("layout.cardFontFollow")

    const setValue = (key: LayoutNumberKey, value: number) =>
        dispatch(updateLayoutConfig({ [key]: value } as Partial<LayoutConfig>))

    const renderGroup = (group: LayoutGroupDef) => (
        <section key={group.key} className={classes.section}>
            <div className={classes.sectionHead}>
                <h3 className={classes.sectionTitle}>
                    {intl.get(group.titleKey)}
                </h3>
                <DefaultButton
                    text={intl.get("layout.resetGroup")}
                    disabled={!isChanged(layout, group.keys)}
                    onClick={() => dispatch(resetLayoutConfig(group.keys))}
                />
            </div>
            <div className={classes.sectionBody}>
                {group.font ? (
                    <div
                        className={mergeClasses(
                            classes.item,
                            classes.itemWide
                        )}>
                        <div className={classes.itemHead}>
                            <span className={classes.itemLabel}>
                                {intl.get("layout.cardFont")}
                            </span>
                            <span className={classes.itemValue}>
                                {resolvedFont}
                            </span>
                        </div>
                        <Dropdown
                            className={classes.dropdown}
                            options={fontOptions}
                            selectedKey={layout.cardFont || SYSTEM_FONT_KEY}
                            ariaLabel={intl.get("layout.cardFont")}
                            onChange={(_, option) =>
                                dispatch(
                                    updateLayoutConfig({
                                        cardFont:
                                            option.key === SYSTEM_FONT_KEY
                                                ? ""
                                                : String(option.key),
                                    })
                                )
                            }
                        />
                        <span className={classes.hint}>
                            {intl.get("layout.cardFontHint")}
                        </span>
                    </div>
                ) : null}
                {group.items.map(item => (
                    <NumberRow
                        key={item.key}
                        def={item}
                        value={layout[item.key]}
                        onChange={setValue}
                    />
                ))}
            </div>
        </section>
    )

    return (
        <div className={`tab-body ${classes.root}`}>
            <div className={classes.toolbar}>
                <span className={classes.status}>
                    {customCount > 0
                        ? intl.get("layout.statusCustom", {
                              count: customCount,
                          })
                        : intl.get("layout.statusDefault")}
                </span>
                <DefaultButton
                    text={intl.get("layout.resetAll")}
                    disabled={customCount === 0}
                    onClick={() => setConfirmReset(true)}
                />
            </div>
            <span className={classes.hint}>{intl.get("layout.intro")}</span>

            {/* The shared metrics come first: they modulate every view below, so
                reading them before the per-view block matches how they apply. */}
            {GROUPS.filter(group => group.key === "common").map(renderGroup)}

            <section className={classes.section}>
                <div className={classes.previewRow}>
                    <span className={classes.previewLabel}>
                        {intl.get("layout.preview")}
                    </span>
                    <Dropdown
                        className={classes.dropdown}
                        options={previewOptions}
                        selectedKey={previewView}
                        ariaLabel={intl.get("layout.preview")}
                        onChange={(_, option) =>
                            setPreviewView(Number(option.key) as ViewType)
                        }
                    />
                </div>
                <LayoutPreview view={previewView} config={layout} />
                <span className={classes.hint}>
                    {intl.get("layout.previewHint")}
                </span>
            </section>

            {GROUPS.filter(
                // Compare against undefined on purpose: ViewType.Cards is 0, so a
                // truthiness check would keep the cards group visible forever.
                // "common" is rendered above the preview instead, so it is
                // skipped here.
                group =>
                    group.key !== "common" &&
                    (group.view === undefined || group.view === previewView)
            ).map(group => (
                <section key={group.key} className={classes.section}>
                    <div className={classes.sectionHead}>
                        <h3 className={classes.sectionTitle}>
                            {intl.get(group.titleKey)}
                        </h3>
                        <DefaultButton
                            text={intl.get("layout.resetGroup")}
                            disabled={!isChanged(layout, group.keys)}
                            onClick={() =>
                                dispatch(resetLayoutConfig(group.keys))
                            }
                        />
                    </div>
                    <div className={classes.sectionBody}>
                        {group.font ? (
                            <div
                                className={mergeClasses(
                                    classes.item,
                                    classes.itemWide
                                )}>
                                <div className={classes.itemHead}>
                                    <span className={classes.itemLabel}>
                                        {intl.get("layout.cardFont")}
                                    </span>
                                    <span className={classes.itemValue}>
                                        {resolvedFont}
                                    </span>
                                </div>
                                <Dropdown
                                    className={classes.dropdown}
                                    options={fontOptions}
                                    selectedKey={
                                        layout.cardFont || SYSTEM_FONT_KEY
                                    }
                                    ariaLabel={intl.get("layout.cardFont")}
                                    onChange={(_, option) =>
                                        dispatch(
                                            updateLayoutConfig({
                                                cardFont:
                                                    option.key ===
                                                    SYSTEM_FONT_KEY
                                                        ? ""
                                                        : String(option.key),
                                            })
                                        )
                                    }
                                />
                                <span className={classes.hint}>
                                    {intl.get("layout.cardFontHint")}
                                </span>
                            </div>
                        ) : null}
                        {group.items.map(item => (
                            <NumberRow
                                key={item.key}
                                def={item}
                                value={layout[item.key]}
                                onChange={setValue}
                            />
                        ))}
                    </div>
                </section>
            ))}

            <Dialog
                hidden={!confirmReset}
                onDismiss={() => setConfirmReset(false)}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: intl.get("layout.resetTitle"),
                    subText: intl.get("layout.resetBody"),
                }}
                modalProps={{ isBlocking: true }}>
                <DialogFooter>
                    <PrimaryButton
                        text={intl.get("layout.resetConfirm")}
                        onClick={() => {
                            dispatch(resetLayoutConfig())
                            setConfirmReset(false)
                        }}
                    />
                    <DefaultButton
                        text={intl.get("cancel")}
                        onClick={() => setConfirmReset(false)}
                    />
                </DialogFooter>
            </Dialog>
        </div>
    )
}

export default LayoutTab
