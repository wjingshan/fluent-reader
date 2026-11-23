import * as React from "react"
import { useMemo, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import {
    Button,
    Dropdown,
    Option,
    Switch,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components"
import { useAppDispatch } from "../../scripts/reducer"
import {
    RSSSource,
    SourceOpenTarget,
    SourceFieldPatch,
    updateSourcesPatch,
} from "../../scripts/models/source"
import { SourceGroup } from "../../schema-types"
import { useManagerStyles } from "./styles"
import { groupTone, GroupTone } from "./palette"
import {
    FREQUENCY_OPTIONS,
    frequencyLabel,
    relativeTime,
    statusOf,
} from "./utils"

export interface SelectionInspectorProps {
    sources: RSSSource[]
    groups: SourceGroup[]
    tones?: Map<number, GroupTone>
    errors: Record<number, string>
    onToast: (message: string, undo?: () => void) => void
    onRefresh: () => void
}

type BulkPatch = SourceFieldPatch

const openTargetLabel = (target: SourceOpenTarget) =>
    ({
        [SourceOpenTarget.Local]: intl.get("sources.rssText"),
        [SourceOpenTarget.FullContent]: intl.get("article.loadFull"),
        [SourceOpenTarget.Webpage]: intl.get("sources.loadWebpage"),
        [SourceOpenTarget.External]: intl.get("openExternal"),
    }[target])

const useClasses = makeStyles({
    avatarCount: {
        backgroundColor: tokens.colorBrandBackground,
        fontSize: "13px",
    },
    chipWrap: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
    },
})

const SelectionInspector: React.FC<SelectionInspectorProps> = props => {
    const { sources, groups, errors, onToast, onRefresh } = props
    const m = useManagerStyles()
    const c = useClasses()
    const dispatch = useAppDispatch()
    const [applying, setApplying] = useState(false)

    const summary = useMemo(() => {
        let unread = 0
        let failed = 0
        let stale = 0
        let hidden = 0
        let newest = 0
        let oldest = 0
        for (const source of sources) {
            unread += source.unreadCount || 0
            const status = statusOf(source, errors[source.sid])
            if (status === "error") failed += 1
            if (status === "stale") stale += 1
            if (status === "hidden") hidden += 1
            const time = source.lastFetched
                ? new Date(source.lastFetched).getTime()
                : 0
            if (time > 0) {
                if (!newest || time > newest) newest = time
                if (!oldest || time < oldest) oldest = time
            }
        }
        return { unread, failed, stale, hidden, newest, oldest }
    }, [sources, errors])

    const groupCounts = useMemo(() => {
        const rows = groups
            .filter(group => group.isMultiple)
            .map(group => ({
                gid: group.gid,
                name: group.name,
                count: sources.filter(source =>
                    group.sids.includes(source.sid)
                ).length,
            }))
            .filter(row => row.count > 0)
        const ungrouped = sources.filter(
            source =>
                !groups.some(
                    group =>
                        group.isMultiple && group.sids.includes(source.sid)
                )
        ).length
        return { rows, ungrouped }
    }, [groups, sources])

    const openTargets = sources.map(source => source.openTarget)
    const uniformTarget = openTargets.every(t => t === openTargets[0])
    const frequencies = sources.map(source => source.fetchFrequency || 0)
    const uniformFrequency = frequencies.every(f => f === frequencies[0])
    const allHidden = sources.every(source => Boolean(source.hidden))
    const someHidden = sources.some(source => Boolean(source.hidden))

    const apply = async (patch: BulkPatch) => {
        if (applying) return
        setApplying(true)
        const sids = sources.map(source => source.sid)
        const before = sources.map(source => ({
            sid: source.sid,
            openTarget: source.openTarget,
            fetchFrequency: source.fetchFrequency || 0,
            hidden: Boolean(source.hidden),
        }))
        try {
            const applied = await dispatch(updateSourcesPatch(sids, patch))
            const message =
                applied === sids.length
                    ? intl.get("subs.selectionApplied", { count: applied })
                    : intl.get("subs.selectionAppliedPartial", {
                          count: applied,
                          failed: sids.length - applied,
                      })
            onToast(message, () => {
                for (const entry of before) {
                    void dispatch(
                        updateSourcesPatch([entry.sid], {
                            openTarget: entry.openTarget,
                            fetchFrequency: entry.fetchFrequency,
                            hidden: entry.hidden,
                        })
                    )
                }
            })
        } finally {
            setApplying(false)
        }
    }

    return (
        <div className={mergeClasses(m.pane, m.inspectorPane)}>
            <div className={m.inspectorHead}>
                <div
                    className={mergeClasses(
                        m.avatar,
                        m.inspectorAvatar,
                        c.avatarCount
                    )}>
                    {sources.length}
                </div>
                <div className={m.inspectorMeta}>
                    <div className={m.inspectorTitle}>
                        {intl.get("subs.selectionTitle", {
                            count: sources.length,
                        })}
                    </div>
                    <div className={m.inspectorUrl}>
                        {intl.get("subs.selectionSub", {
                            unread: summary.unread,
                            groups:
                                groupCounts.rows.length +
                                (groupCounts.ungrouped > 0 ? 1 : 0),
                        })}
                    </div>
                </div>
                <Button
                    appearance="subtle"
                    size="small"
                    title={intl.get("subs.bulkRefresh")}
                    icon={<Icon iconName="Refresh" />}
                    onClick={onRefresh}
                />
            </div>
            <div className={m.inspectorScroll}>
                <div className={m.section}>
                    <div className={m.sectionTitle}>
                        <span>{intl.get("subs.selectionSummary")}</span>
                    </div>
                    <div className={m.metrics}>
                        <div className={m.metric}>
                            <div className={m.metricValue}>{summary.unread}</div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.selectionUnread")}
                            </div>
                        </div>
                        <div className={m.metric}>
                            <div
                                className={mergeClasses(
                                    m.metricValue,
                                    summary.failed > 0 &&
                                        m.healthValueDanger
                                )}>
                                {summary.failed}
                            </div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.failed")}
                            </div>
                        </div>
                        <div className={m.metric}>
                            <div
                                className={mergeClasses(
                                    m.metricValue,
                                    summary.stale > 0 &&
                                        m.healthValueWarn
                                )}>
                                {summary.stale}
                            </div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.statusStale")}
                            </div>
                        </div>
                        <div className={m.metric}>
                            <div className={m.metricValue}>
                                {summary.hidden}
                            </div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.statusHidden")}
                            </div>
                        </div>
                        <div className={m.metric}>
                            <div className={m.metricValue}>
                                {summary.newest
                                    ? relativeTime(new Date(summary.newest))
                                    : intl.get("subs.never")}
                            </div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.selectionLatest")}
                            </div>
                        </div>
                        <div className={m.metric}>
                            <div className={m.metricValue}>
                                {summary.oldest
                                    ? relativeTime(new Date(summary.oldest))
                                    : intl.get("subs.never")}
                            </div>
                            <div className={m.metricLabel}>
                                {intl.get("subs.selectionOldest")}
                            </div>
                        </div>
                    </div>
                </div>
                {(groupCounts.rows.length > 0 ||
                    groupCounts.ungrouped > 0) && (
                    <div className={m.section}>
                        <div className={m.sectionTitle}>
                            <span>{intl.get("subs.selectionGroups")}</span>
                        </div>
                        <div className={c.chipWrap}>
                            {groupCounts.rows.map(row => {
                                const tone = groupTone(row.gid, props.tones)
                                return (
                                    <span
                                        key={row.gid}
                                        className={m.groupChip}
                                        style={{
                                            backgroundColor: tone.soft,
                                            borderColor: tone.line,
                                        }}>
                                        <span
                                            className={m.groupDot}
                                            style={{ backgroundColor: tone.dot }}
                                        />
                                        {row.name}
                                        <span
                                            style={{
                                                opacity: 0.7,
                                                fontVariantNumeric:
                                                    "tabular-nums",
                                            }}>
                                            {row.count}
                                        </span>
                                    </span>
                                )
                            })}
                            {groupCounts.ungrouped > 0 && (
                                <span
                                    className={mergeClasses(
                                        m.groupChip,
                                        m.groupChipEmpty
                                    )}>
                                    {intl.get("subs.ungrouped")}
                                    <span
                                        style={{
                                            opacity: 0.7,
                                            fontVariantNumeric: "tabular-nums",
                                        }}>
                                        {groupCounts.ungrouped}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>
                )}
                <div className={m.section}>
                    <div className={m.sectionTitle}>
                        <span>{intl.get("subs.selectionSettings")}</span>
                    </div>
                    <div className={m.fieldRow}>
                        <span className={m.fieldLabel}>
                            {intl.get("sources.openTarget")}
                        </span>
                        <Dropdown
                            className={m.control}
                            disabled={applying}
                            value={
                                uniformTarget
                                    ? openTargetLabel(openTargets[0])
                                    : intl.get("subs.selectionMixed")
                            }
                            selectedOptions={
                                uniformTarget
                                    ? [String(openTargets[0])]
                                    : []
                            }
                            onOptionSelect={(_, data) => {
                                const target = Number(
                                    data.optionValue
                                ) as SourceOpenTarget
                                void apply({ openTarget: target })
                            }}>
                            {[
                                SourceOpenTarget.Local,
                                SourceOpenTarget.FullContent,
                                SourceOpenTarget.Webpage,
                                SourceOpenTarget.External,
                            ].map(target => (
                                <Option
                                    key={target}
                                    value={String(target)}
                                    text={openTargetLabel(target)}>
                                    {openTargetLabel(target)}
                                </Option>
                            ))}
                        </Dropdown>
                    </div>
                    <div className={m.fieldRow}>
                        <span className={m.fieldLabel}>
                            {intl.get("sources.fetchFrequency")}
                        </span>
                        <Dropdown
                            className={m.control}
                            disabled={applying}
                            value={
                                uniformFrequency
                                    ? frequencyLabel(frequencies[0])
                                    : intl.get("subs.selectionMixed")
                            }
                            selectedOptions={
                                uniformFrequency
                                    ? [String(frequencies[0])]
                                    : []
                            }
                            onOptionSelect={(_, data) => {
                                const frequency = Number(data.optionValue) || 0
                                void apply({ fetchFrequency: frequency })
                            }}>
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
                    <div className={m.fieldRow}>
                        <span className={m.fieldLabel}>
                            {intl.get("sources.hidden")}
                        </span>
                        <Switch
                            checked={allHidden}
                            disabled={applying}
                            onChange={(_, data) =>
                                void apply({ hidden: data.checked })
                            }
                        />
                    </div>
                    {!allHidden && someHidden && (
                        <div className={m.notice}>
                            {intl.get("subs.selectionHiddenMixed", {
                                count: sources.filter(source => source.hidden)
                                    .length,
                            })}
                        </div>
                    )}
                </div>
                <div className={m.section}>
                    <div className={m.notice}>
                        {intl.get("subs.selectionHint")}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default SelectionInspector
