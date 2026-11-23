import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import {
    Button,
    Dialog,
    DialogSurface,
    Dropdown,
    Input,
    Option,
    Switch,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { closeSourceDialog, openManager } from "../../scripts/models/app"
import { urlTest } from "../../scripts/utils"
import {
    RSSSource,
    SourceOpenTarget,
    deleteSource,
    updateSource,
} from "../../scripts/models/source"
import {
    addSourceToGroup,
    removeSourceFromGroup,
} from "../../scripts/models/group"
import { fetchItems } from "../../scripts/models/item"
import { SourceGroup } from "../../schema-types"
import {
    FREQUENCY_OPTIONS,
    avatarColor,
    frequencyLabel,
    relativeTime,
    statusLabel,
    statusOf,
} from "./utils"
import { buildToneMap, groupTone } from "./palette"

const useClasses = makeStyles({
    surface: {
        maxWidth: "468px",
        width: "468px",
        padding: 0,
    },
    head: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "14px 18px 10px",
    },
    avatar: {
        flex: "0 0 34px",
        width: "34px",
        height: "34px",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tokens.colorNeutralForegroundInverted,
        fontWeight: 600,
        fontSize: "15px",
        overflow: "hidden",
        textTransform: "uppercase",
    },
    avatarImage: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
    },
    headMeta: {
        minWidth: 0,
        flexGrow: 1,
    },
    title: {
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: "20px",
        margin: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    subtitle: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    body: {
        padding: "4px 18px 4px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
    },
    stack: {
        display: "flex",
        flexDirection: "column",
    },
    field: {
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        alignItems: "center",
        columnGap: "10px",
        minHeight: "32px",
    },
    fieldLabel: {
        fontSize: tokens.fontSizeBase200,
        lineHeight: "16px",
        color: tokens.colorNeutralForeground2,
    },
    control: {
        width: "100%",
    },
    statusRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginLeft: "110px",
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        minHeight: "20px",
    },
    statusDot: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: tokens.colorPaletteGreenForeground1,
    },
    statusStale: { backgroundColor: tokens.colorPaletteMarigoldForeground1 },
    statusError: { backgroundColor: tokens.colorPaletteRedForeground1 },
    statusHidden: { backgroundColor: tokens.colorNeutralForeground4 },
    notice: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        marginLeft: "110px",
    },
    hint: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        backgroundColor: tokens.colorNeutralBackground3,
        borderRadius: "4px",
        padding: "6px 8px",
    },
    foot: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 18px 16px",
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        marginTop: "10px",
    },
    footSpacer: { flexGrow: 1 },
})

const groupOf = (groups: SourceGroup[], sid: number) =>
    groups.find(g => g.isMultiple && g.sids.includes(sid))

interface FormProps {
    source: RSSSource
    groups: SourceGroup[]
    onDone: () => void
}

const SourceSettingsForm: React.FC<FormProps> = props => {
    const { source, groups } = props
    const classes = useClasses()
    const dispatch = useAppDispatch()
    const tones = useMemo(() => buildToneMap(groups), [groups])
    const [name, setName] = useState(source.name || "")
    const [feedUrl, setFeedUrl] = useState(source.url || "")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setName(source.name || "")
        setFeedUrl(source.url || "")
    }, [source.sid, source.name, source.url])

    const group = groupOf(groups, source.sid)
    const status = statusOf(source, null)

    const commitName = () => {
        const next = name.trim()
        if (!next || next === source.name) {
            setName(source.name || "")
            return
        }
        dispatch(updateSource({ ...source, name: next })).catch(err => {
            setName(source.name || "")
            window.utils.showErrorBox(
                intl.get("settings.writeError"),
                String(err)
            )
        })
    }

    const commitUrl = () => {
        const next = feedUrl.trim()
        if (next === source.url) return
        if (!urlTest(next)) {
            setFeedUrl(source.url || "")
            window.utils.showErrorBox(
                intl.get("sources.badUrl"),
                next,
                intl.get("context.copy")
            )
            return
        }
        dispatch(updateSource({ ...source, url: next })).catch(err =>
            window.utils.showErrorBox(
                intl.get("settings.writeError"),
                String(err)
            )
        )
    }

    const save = (patch: Partial<RSSSource>) => {
        dispatch(updateSource({ ...source, ...patch })).catch(err =>
            window.utils.showErrorBox(
                intl.get("settings.writeError"),
                String(err)
            )
        )
    }

    const commitFrequency = (value: string) => {
        const next = parseInt(value)
        if (next !== source.fetchFrequency) save({ fetchFrequency: next })
    }

    const commitOpenTarget = (value: string) => {
        const next = parseInt(value) as SourceOpenTarget
        if (next !== source.openTarget) save({ openTarget: next })
    }

    const moveToGroup = (value: string) => {
        if (value === "u") {
            if (group) dispatch(removeSourceFromGroup(group.gid, [source.sid]))
            return
        }
        const gid = parseInt(value.replace("g", ""))
        if (!group || group.gid !== gid)
            dispatch(addSourceToGroup(gid, source.sid))
    }

    const refresh = async () => {
        if (busy) return
        setBusy(true)
        try {
            await dispatch(fetchItems(false, [source.sid]))
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        const confirmed = await window.utils.showMessageBox(
            intl.get("subs.deleteTitle"),
            intl.get("sources.deleteWarning", { name: source.name }),
            intl.get("subs.deleteConfirm"),
            intl.get("subs.cancel"),
            true,
            "warning"
        )
        if (!confirmed) return
        await dispatch(deleteSource(source, true))
        props.onDone()
    }

    const finish = () => {
        commitName()
        commitUrl()
        props.onDone()
    }

    return (
        <>
            <div className={classes.head}>
                <div
                    className={classes.avatar}
                    style={{ backgroundColor: avatarColor(source.url || "?") }}>
                    {source.iconurl ? (
                        <img
                            className={classes.avatarImage}
                            src={source.iconurl}
                            alt=""
                        />
                    ) : (
                        (source.name || "?").trim().charAt(0)
                    )}
                </div>
                <div className={classes.headMeta}>
                    <h3 className={classes.title}>
                        {intl.get("subs.dialogTitle")}
                    </h3>
                    <div className={classes.subtitle} title={source.url}>
                        {source.name}
                    </div>
                </div>
                <Button
                    appearance="subtle"
                    size="small"
                    title={intl.get("subs.dialogOpenManager")}
                    icon={<Icon iconName="List" />}
                    onClick={() =>
                        dispatch(openManager(group ? group.gid : null))
                    }
                />
                <Button
                    appearance="subtle"
                    size="small"
                    title={intl.get("subs.refresh")}
                    icon={<Icon iconName="Refresh" />}
                    disabled={busy}
                    onClick={() => void refresh()}
                />
            </div>
            <div className={classes.stack}>
                <div className={classes.body}>
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>
                            {intl.get("sources.name")}
                        </span>
                        <Input
                            className={classes.control}
                            value={name}
                            onChange={(_, data) => setName(data.value)}
                            onBlur={commitName}
                            onKeyDown={e => {
                                if (e.key === "Enter") commitName()
                            }}
                        />
                    </div>
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>URL</span>
                        <Input
                            className={classes.control}
                            value={feedUrl}
                            onChange={(_, data) => setFeedUrl(data.value)}
                            onBlur={commitUrl}
                            onKeyDown={e => {
                                if (e.key === "Enter") commitUrl()
                            }}
                        />
                    </div>
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>
                            {intl.get("subs.group")}
                        </span>
                        <Dropdown
                            className={classes.control}
                            value={
                                group ? group.name : intl.get("subs.ungrouped")
                            }
                            selectedOptions={[group ? `g${group.gid}` : "u"]}
                            onOptionSelect={(_, data) =>
                                moveToGroup(data.optionValue as string)
                            }>
                            <Option value="u" text={intl.get("subs.ungrouped")}>
                                {intl.get("subs.ungrouped")}
                            </Option>
                            {groups
                                .filter(g => g.isMultiple)
                                .map(g => (
                                    <Option
                                        key={g.gid}
                                        value={`g${g.gid}`}
                                        text={g.name}>
                                        <span
                                            style={{
                                                display: "inline-block",
                                                width: "8px",
                                                height: "8px",
                                                borderRadius: "50%",
                                                backgroundColor: groupTone(
                                                    g.gid,
                                                    tones
                                                ).dot,
                                                marginRight: "6px",
                                            }}
                                        />
                                        {g.name}
                                    </Option>
                                ))}
                        </Dropdown>
                    </div>
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>
                            {intl.get("sources.openTarget")}
                        </span>
                        <Dropdown
                            className={classes.control}
                            value={
                                {
                                    [SourceOpenTarget.Local]:
                                        intl.get("sources.rssText"),
                                    [SourceOpenTarget.FullContent]:
                                        intl.get("article.loadFull"),
                                    [SourceOpenTarget.Webpage]: intl.get(
                                        "sources.loadWebpage"
                                    ),
                                    [SourceOpenTarget.External]:
                                        intl.get("openExternal"),
                                }[source.openTarget]
                            }
                            selectedOptions={[String(source.openTarget)]}
                            onOptionSelect={(_, data) =>
                                commitOpenTarget(data.optionValue as string)
                            }>
                            <Option
                                value={String(SourceOpenTarget.Local)}
                                text={intl.get("sources.rssText")}>
                                {intl.get("sources.rssText")}
                            </Option>
                            <Option
                                value={String(SourceOpenTarget.FullContent)}
                                text={intl.get("article.loadFull")}>
                                {intl.get("article.loadFull")}
                            </Option>
                            <Option
                                value={String(SourceOpenTarget.Webpage)}
                                text={intl.get("sources.loadWebpage")}>
                                {intl.get("sources.loadWebpage")}
                            </Option>
                            <Option
                                value={String(SourceOpenTarget.External)}
                                text={intl.get("openExternal")}>
                                {intl.get("openExternal")}
                            </Option>
                        </Dropdown>
                    </div>
                    {!source.serviceRef && (
                        <div className={classes.field}>
                            <span className={classes.fieldLabel}>
                                {intl.get("sources.fetchFrequency")}
                            </span>
                            <Dropdown
                                className={classes.control}
                                value={frequencyLabel(
                                    source.fetchFrequency || 0
                                )}
                                selectedOptions={[
                                    String(source.fetchFrequency || 0),
                                ]}
                                onOptionSelect={(_, data) =>
                                    commitFrequency(data.optionValue as string)
                                }>
                                {FREQUENCY_OPTIONS.map(f => (
                                    <Option
                                        key={f}
                                        value={String(f)}
                                        text={frequencyLabel(f)}>
                                        {frequencyLabel(f)}
                                    </Option>
                                ))}
                            </Dropdown>
                        </div>
                    )}
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>
                            {intl.get("sources.hidden")}
                        </span>
                        <Switch
                            checked={!!source.hidden}
                            onChange={() => save({ hidden: !source.hidden })}
                        />
                    </div>
                    <div className={classes.statusRow}>
                        <span
                            className={mergeClasses(
                                classes.statusDot,
                                status === "stale" && classes.statusStale,
                                status === "error" && classes.statusError,
                                status === "hidden" && classes.statusHidden
                            )}
                        />
                        <span>{statusLabel(status)}</span>
                        <span>·</span>
                        <span>
                            {intl.get("subs.colUnread")} {source.unreadCount || 0}
                        </span>
                        <span>·</span>
                        <span>
                            {intl.get("subs.colUpdated")}{" "}
                            {relativeTime(source.lastFetched)}
                        </span>
                    </div>
                    {source.serviceRef && (
                        <div className={classes.notice}>
                            {intl.get("subs.serviceManaged")}
                        </div>
                    )}
                </div>
                <div className={classes.foot}>
                    {!source.serviceRef && (
                        <Button
                            appearance="subtle"
                            icon={<Icon iconName="Delete" />}
                            onClick={() => void remove()}>
                            {intl.get("subs.delete")}
                        </Button>
                    )}
                    <span className={classes.footSpacer} />
                    <Button appearance="primary" onClick={finish}>
                        {intl.get("subs.dialogFinish")}
                    </Button>
                </div>
            </div>
        </>
    )
}

const SourceSettingsDialog: React.FC = () => {
    const dispatch = useAppDispatch()
    const classes = useClasses()
    const sid = useAppSelector(state => state.app.sourceDialog)
    const sources = useAppSelector(state => state.sources)
    const groups = useAppSelector(state => state.groups)
    const source = sid != null ? sources[sid] : undefined

    return (
        <Dialog
            open={!!source}
            onOpenChange={(_, data) => {
                if (!data.open) dispatch(closeSourceDialog())
            }}>
            <DialogSurface
                className={classes.surface}
                aria-label={intl.get("subs.dialogTitle")}>
                {source ? (
                    <SourceSettingsForm
                        key={source.sid}
                        source={source}
                        groups={groups}
                        onDone={() => dispatch(closeSourceDialog())}
                    />
                ) : null}
            </DialogSurface>
        </Dialog>
    )
}

export default SourceSettingsDialog
