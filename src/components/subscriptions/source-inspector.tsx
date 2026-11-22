import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import {
    Button,
    Dropdown,
    Input,
    Option,
    Switch,
    mergeClasses,
} from "@fluentui/react-components"
import { useAppDispatch } from "../../scripts/reducer"
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
import { useManagerStyles } from "./styles"
import { avatarColor, relativeTime, statusLabel, statusOf } from "./utils"
import { groupColor } from "./group-tree"

export interface SourceInspectorProps {
    source: RSSSource
    groups: SourceGroup[]
    error?: string
    onDeleted: () => void
}

const FREQUENCIES = [0, 15, 30, 60, 120, 180, 360, 720, 1440]

const frequencyLabel = (frequency: number) => {
    switch (frequency) {
        case 15:
        case 30:
            return intl.get("time.minute", { m: frequency })
        case 60:
        case 120:
        case 180:
        case 360:
        case 720:
            return intl.get("time.hour", { h: frequency / 60 })
        case 1440:
            return intl.get("time.day", { d: 1 })
        default:
            return intl.get("sources.unlimited")
    }
}

const groupOf = (groups: SourceGroup[], sid: number) =>
    groups.find(g => g.isMultiple && g.sids.includes(sid))

const SourceInspector: React.FC<SourceInspectorProps> = props => {
    const { source, groups } = props
    const dispatch = useAppDispatch()
    const classes = useManagerStyles()
    const [name, setName] = useState(source.name || "")
    const [feedUrl, setFeedUrl] = useState(source.url || "")
    const [retrying, setRetrying] = useState(false)

    useEffect(() => {
        setName(source.name || "")
        setFeedUrl(source.url || "")
    }, [source.sid])

    const group = groupOf(groups, source.sid)
    const error = props.error
    const status = statusOf(source, error)

    const retry = async () => {
        if (retrying) return
        setRetrying(true)
        try {
            await dispatch(fetchItems(false, [source.sid]))
        } finally {
            setRetrying(false)
        }
    }

    const commitName = () => {
        const next = name.trim()
        if (!next || next === source.name) {
            setName(source.name || "")
            return
        }
        dispatch(updateSource({ ...source, name: next }))
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

    const commitFrequency = (value: string) => {
        const next = parseInt(value)
        if (next !== source.fetchFrequency) {
            dispatch(updateSource({ ...source, fetchFrequency: next }))
        }
    }

    const commitOpenTarget = (value: string) => {
        const next = parseInt(value) as SourceOpenTarget
        if (next !== source.openTarget) {
            dispatch(updateSource({ ...source, openTarget: next }))
        }
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
        props.onDeleted()
    }

    return (
        <div className={mergeClasses(classes.pane, classes.inspectorPane)}>
            <div className={classes.inspectorHead}>
                <div
                    className={mergeClasses(
                        classes.avatar,
                        classes.inspectorAvatar
                    )}
                    style={{
                        backgroundColor: avatarColor(source.url || "?"),
                    }}>
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
                <div className={classes.inspectorMeta}>
                    <div className={classes.inspectorTitle}>{source.name}</div>
                    <div className={classes.inspectorUrl} title={source.url}>
                        {source.url}
                    </div>
                </div>
                <Button
                    appearance="subtle"
                    size="small"
                    title={error ? intl.get("subs.retry") : intl.get("subs.refresh")}
                    icon={<Icon iconName="Refresh" />}
                    disabled={retrying}
                    onClick={() => void retry()}
                />
            </div>
            <div className={classes.inspectorScroll}>
                {error && (
                    <div className={classes.section}>
                        <div className={classes.errorBox}>
                            <div className={classes.errorTitle}>
                                <Icon iconName="ErrorBadge" />
                                {intl.get("subs.errorTitle")}
                            </div>
                            <div className={classes.errorText}>{error}</div>
                            <div className={classes.errorText}>
                                {intl.get("subs.errorHint")}
                            </div>
                            <div className={classes.errorActions}>
                                <Button
                                    size="small"
                                    appearance="primary"
                                    icon={<Icon iconName="Refresh" />}
                                    disabled={retrying}
                                    onClick={() => void retry()}>
                                    {retrying
                                        ? intl.get("subs.retrying")
                                        : intl.get("subs.retry")}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                {source.serviceRef && (
                    <div className={classes.section}>
                        <div className={classes.notice}>
                            {intl.get("subs.serviceManaged")}
                        </div>
                    </div>
                )}
                <div className={classes.section}>
                    <div className={classes.sectionTitle}>
                        <span>{intl.get("subs.inspector")}</span>
                        <span
                            className={mergeClasses(
                                classes.status,
                                status === "stale" && classes.statusStale,
                                status === "error" && classes.statusError,
                                status === "hidden" && classes.statusHidden
                            )}>
                            <span
                                className={mergeClasses(
                                    classes.statusDot,
                                    status === "stale" &&
                                        classes.statusStaleDot,
                                    status === "error" &&
                                        classes.statusErrorDot,
                                    status === "hidden" &&
                                        classes.statusHiddenDot
                                )}
                            />
                            {statusLabel(status)}
                        </span>
                    </div>
                    <div className={classes.field}>
                        <span className={classes.fieldLabel}>
                            {intl.get("sources.name")}
                        </span>
                        <Input
                            className={classes.control}
                            value={name}
                            onChange={(_, data) => setName(data.value)}
                            onBlur={commitName}
                            onKeyDown={event => {
                                if (event.key === "Enter") commitName()
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
                            onKeyDown={event => {
                                if (event.key === "Enter") commitUrl()
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
                            disabled={
                                !group && groups.every(g => !g.isMultiple)
                            }
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
                                            className={classes.groupDot}
                                            style={{
                                                backgroundColor: groupColor(
                                                    g.gid
                                                ),
                                                marginRight: "6px",
                                            }}
                                        />
                                        {g.name}
                                    </Option>
                                ))}
                        </Dropdown>
                    </div>
                </div>
                <div className={classes.section}>
                    <div className={classes.fieldRow}>
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
                        <div className={classes.fieldRow}>
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
                                {FREQUENCIES.map(f => (
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
                    <div className={classes.fieldRow}>
                        <span className={classes.fieldLabel}>
                            {intl.get("sources.hidden")}
                        </span>
                        <Switch
                            checked={!!source.hidden}
                            onChange={() =>
                                dispatch(
                                    updateSource({
                                        ...source,
                                        hidden: !source.hidden,
                                    })
                                )
                            }
                        />
                    </div>
                </div>
                <div className={classes.section}>
                    <div className={classes.sectionTitle}>
                        {intl.get("subs.dataSection")}
                    </div>
                    <div className={classes.metrics}>
                        <div className={classes.metric}>
                            <div className={classes.metricValue}>
                                {source.unreadCount || 0}
                            </div>
                            <div className={classes.metricLabel}>
                                {intl.get("subs.colUnread")}
                            </div>
                        </div>
                        <div className={classes.metric}>
                            <div className={classes.metricValue}>
                                {relativeTime(source.lastFetched)}
                            </div>
                            <div className={classes.metricLabel}>
                                {intl.get("subs.colUpdated")}
                            </div>
                        </div>
                    </div>
                </div>
                {!source.serviceRef && (
                    <div className={classes.section}>
                        <Button
                            className={classes.dangerButton}
                            appearance="outline"
                            icon={<Icon iconName="Delete" />}
                            onClick={() => void remove()}>
                            {intl.get("subs.delete")}
                        </Button>
                        <span className={classes.notice}>
                            {intl.get("sources.deleteWarning")}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default SourceInspector
