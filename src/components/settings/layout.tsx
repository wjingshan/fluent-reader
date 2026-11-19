import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
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
    TextField,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    countCustomLayout,
    DEFAULT_LAYOUT_CONFIG,
    LAYOUT_RANGES,
    LayoutConfig,
    LayoutNumberKey,
    sanitizeHexColor,
    ViewType,
} from "../../schema-types"
import { resetLayoutConfig, updateLayoutConfig } from "../../scripts/models/app"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { availableCardFonts, findPreviewThumb } from "../../scripts/layout"
import LayoutPreview from "./layout/preview"

const SYSTEM_FONT_KEY = "__system__"
const CUSTOM_COLOR_KEY = "__custom__"

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
    colorRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    swatch: {
        width: "20px",
        height: "20px",
        borderRadius: "3px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        flexShrink: 0,
        // Diagonals stand in for "no colour": the card follows the theme.
        backgroundImage:
            "repeating-linear-gradient(45deg, var(--neutralLight) 0 4px, var(--neutralLighter) 4px 8px)",
    },
    colorField: { width: "140px" },
})

type LayoutItemDef = {
    key: LayoutNumberKey
    labelKey: string
    // Suffix after the number; pixels unless the setting counts something else.
    unitKey?: string
    hintKey?: string
    // Shown instead of "0 <unit>" when zero has a special meaning.
    zeroKey?: string
}

type LayoutGroupDef = {
    key: string
    titleKey: string
    items: LayoutItemDef[]
    // The card font picker belongs to the shared group only.
    font?: boolean
    // The magazine background picker, likewise magazine-only.
    background?: boolean
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
            {
                key: "cardsColumnWidth",
                labelKey: "layout.cardsCardWidth",
                hintKey: "layout.cardsCardWidthHint",
            },
        ],
        keys: ["cardsColumnWidth"],
    },
    {
        key: "list",
        titleKey: "layout.groupList",
        view: ViewType.List,
        items: [
            { key: "listCoverHeight", labelKey: "layout.listCoverHeight" },
            { key: "listTitleSize", labelKey: "layout.listTitleSize" },
            {
                key: "listSnippetLines",
                labelKey: "layout.listSnippetLines",
                unitKey: "layout.unitLines",
                hintKey: "layout.listSnippetLinesHint",
            },
        ],
        keys: ["listCoverHeight", "listTitleSize", "listSnippetLines"],
    },
    {
        key: "magazine",
        titleKey: "layout.groupMagazine",
        view: ViewType.Magazine,
        background: true,
        items: [
            {
                key: "magazineCoverHeight",
                labelKey: "layout.magazineCoverHeight",
            },
            {
                key: "magazineInset",
                labelKey: "layout.magazineInset",
                hintKey: "layout.magazineInsetHint",
            },
        ],
        keys: ["magazineCoverHeight", "magazineInset", "magazineBackground"],
    },
    {
        key: "compact",
        titleKey: "layout.groupCompact",
        view: ViewType.Compact,
        items: [
            { key: "compactRowHeight", labelKey: "layout.compactRowHeight" },
            {
                key: "compactSnippetLines",
                labelKey: "layout.compactSnippetLines",
                unitKey: "layout.unitLines",
                hintKey: "layout.compactSnippetLinesHint",
            },
        ],
        keys: ["compactRowHeight", "compactSnippetLines"],
    },
    {
        key: "waterfall",
        titleKey: "layout.groupWaterfall",
        view: ViewType.Customized,
        items: [
            {
                key: "waterfallMinColumnWidth",
                labelKey: "layout.waterfallTileWidth",
                hintKey: "layout.waterfallTileWidthHint",
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
    // Zero can carry a meaning of its own ("no limit"), which a bare "0 列"
    // would hide.
    const format = (n: number) =>
        def.zeroKey && n === 0 ? intl.get(def.zeroKey) : `${n} ${unit}`
    return (
        <div className={classes.item}>
            <div className={classes.itemHead}>
                <span className={classes.itemLabel}>{label}</span>
                <span className={classes.itemValue}>
                    {format(value)}
                    {" · "}
                    {intl.get("layout.defaultHint", {
                        value: format(defaultValue),
                    })}
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

/** Theme-following value, i.e. an empty string. */
const THEME_BACKGROUND = ""
// Sentinel keys: the dropdown needs a non-empty id for "no colour", exactly like
// the font picker needs one for "follow the system font".
const THEME_COLOR_KEY = "__theme__"

// Quick picks, chosen to stay readable in both themes and to cover the usual
// needs without sending anyone to a colour wheel.
const BACKGROUND_PRESETS = [
    "#ffffff",
    "#f5f5f5",
    "#f7f2e8",
    "#1f1f1f",
    "#2b2b2b",
]

type BackgroundRowProps = {
    value: string
    onChange: (value: string) => void
}

/**
 * A v8 Dropdown of presets plus a hex field.
 *
 * A full `ColorPicker` was the other option: it is a ~300px spectrum panel that
 * opens in a Callout, it cannot express "unset" (which is what "follow the
 * theme" means here), and inside this three-column sheet it would dominate the
 * whole magazine section. Presets plus an exact hex field keep the section the
 * same weight as the other rows, stay keyboard-usable without a popup, and let
 * "no colour" be its own option, which the theme needs.
 */
function BackgroundRow({ value, onChange }: BackgroundRowProps) {
    const classes = useStyles()
    // The field keeps its own text so a half-typed value ("#ff") can survive
    // while only a complete one is committed.
    const [draft, setDraft] = useState(value)
    // Picking "custom" changes nothing yet, only how the dropdown reads: it must
    // not snap back to the preset it was showing.
    const [customMode, setCustomMode] = useState(
        !!value && !BACKGROUND_PRESETS.includes(value)
    )
    const committed = useRef(value)
    useEffect(() => {
        // Only follow changes that came from elsewhere (group / page reset).
        if (committed.current !== value) {
            committed.current = value
            setDraft(value)
            setCustomMode(!!value && !BACKGROUND_PRESETS.includes(value))
        }
    }, [value])

    const options: IDropdownOption[] = [
        {
            key: THEME_COLOR_KEY,
            text: intl.get("layout.magazineBackgroundTheme"),
        },
    ]
    for (const color of BACKGROUND_PRESETS) {
        options.push({ key: color, text: color })
    }
    options.push({
        key: CUSTOM_COLOR_KEY,
        text: intl.get("layout.magazineBackgroundCustom"),
    })
    const isPreset = BACKGROUND_PRESETS.includes(value)
    const selectedKey = !value
        ? THEME_COLOR_KEY
        : customMode || !isPreset
        ? CUSTOM_COLOR_KEY
        : value

    const commit = (next: string) => {
        committed.current = next
        onChange(next)
    }

    return (
        <div className={mergeClasses(classes.item, classes.itemWide)}>
            <div className={classes.itemHead}>
                <span className={classes.itemLabel}>
                    {intl.get("layout.magazineBackground")}
                </span>
                <span className={classes.itemValue}>
                    {value || intl.get("layout.magazineBackgroundTheme")}
                </span>
            </div>
            <div className={classes.colorRow}>
                <span
                    className={classes.swatch}
                    style={value ? { backgroundColor: value } : undefined}
                />
                <Dropdown
                    className={classes.dropdown}
                    options={options}
                    selectedKey={selectedKey}
                    ariaLabel={intl.get("layout.magazineBackground")}
                    onChange={(_, option) => {
                        const key = String(option.key)
                        if (key === CUSTOM_COLOR_KEY) {
                            setCustomMode(true)
                            return
                        }
                        setCustomMode(false)
                        setDraft(key === THEME_COLOR_KEY ? "" : key)
                        commit(key === THEME_COLOR_KEY ? THEME_BACKGROUND : key)
                    }}
                />
                <TextField
                    className={classes.colorField}
                    value={draft}
                    placeholder="#rrggbb"
                    ariaLabel={intl.get("layout.magazineBackgroundHex")}
                    onChange={(_, next) => {
                        setDraft(next)
                        const parsed = sanitizeHexColor(next)
                        if (!next.trim()) {
                            setCustomMode(false)
                            commit(THEME_BACKGROUND)
                        } else if (parsed) {
                            setCustomMode(!BACKGROUND_PRESETS.includes(parsed))
                            commit(parsed)
                        }
                    }}
                    onGetErrorMessage={() =>
                        draft.trim() && !sanitizeHexColor(draft)
                            ? intl.get("layout.magazineBackgroundInvalid")
                            : ""
                    }
                />
            </div>
            <span className={classes.hint}>
                {intl.get("layout.magazineBackgroundHint")}
            </span>
        </div>
    )
}

const LayoutTab: React.FC = () => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const layout = useAppSelector(state => state.app.layout)
    const currentView = useAppSelector(state => state.page.viewType)
    const items = useAppSelector(state => state.items)
    // The newest article that carries a thumbnail stands in for every view in
    // the preview; recomputed only when the item map itself changes.
    const previewThumb = useMemo(() => findPreviewThumb(items), [items])
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
                {group.background ? (
                    <BackgroundRow
                        value={layout.magazineBackground}
                        onChange={value =>
                            dispatch(
                                updateLayoutConfig({
                                    magazineBackground: value,
                                })
                            )
                        }
                    />
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
                <LayoutPreview
                    view={previewView}
                    config={layout}
                    thumb={previewThumb}
                />
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
            ).map(renderGroup)}

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
