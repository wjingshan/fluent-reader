import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import {
    Button,
    Input,
    Spinner,
    mergeClasses,
} from "@fluentui/react-components"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { addSource } from "../../scripts/models/source"
import { importOPML, exportOPML } from "../../scripts/models/group"
import { urlTest } from "../../scripts/utils"
import { closeManager } from "../../scripts/models/app"
import { useManagerStyles } from "./styles"
import { ManagerRow, statusOf } from "./utils"
import GroupTree from "./group-tree"
import SourceTable, { ManagerSort } from "./source-table"
import SourceInspector from "./source-inspector"

const SubscriptionManager: React.FC = () => {
    const dispatch = useAppDispatch()
    const classes = useManagerStyles()
    const app = useAppSelector(state => state.app)
    const sources = useAppSelector(state => state.sources)
    const groups = useAppSelector(state => state.groups)
    const [query, setQuery] = useState("")
    const [filterKey, setFilterKey] = useState("all")
    const [sort, setSort] = useState<ManagerSort>("updated")
    const [currentSid, setCurrentSid] = useState<number>(null)
    const [addUrl, setAddUrl] = useState("")
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        if (!app.manager.display) return
        if (app.manager.focusGid != null) {
            setFilterKey(`g:${app.manager.focusGid}`)
        }
    }, [app.manager.display, app.manager.focusGid])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") dispatch(closeManager())
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [dispatch])

    const groupBySid = useMemo(() => {
        const map = new Map<number, typeof groups[number]>()
        groups
            .filter(g => g.isMultiple)
            .forEach(group => group.sids.forEach(sid => map.set(sid, group)))
        return map
    }, [groups])

    const allSources = useMemo(
        () => Object.values(sources).filter(source => source),
        [sources]
    )

    const rows = useMemo(() => {
        const visible = allSources.filter(source => !source.hidden)
        const needle = query.trim().toLowerCase()
        let list = visible
        if (filterKey === "ungrouped") {
            list = visible.filter(source => !groupBySid.has(source.sid))
        } else if (filterKey === "stale") {
            list = visible.filter(source => statusOf(source) === "stale")
        } else if (filterKey === "hidden") {
            list = allSources.filter(source => source.hidden)
        } else if (filterKey.startsWith("g:")) {
            const gid = parseInt(filterKey.slice(2))
            list = visible.filter(
                source => groupBySid.get(source.sid)?.gid === gid
            )
        }
        const matched = needle
            ? list.filter(source => {
                  const group = groupBySid.get(source.sid)
                  return (
                      (source.name || "").toLowerCase().includes(needle) ||
                      (source.url || "").toLowerCase().includes(needle) ||
                      (group?.name || "").toLowerCase().includes(needle)
                  )
              })
            : list
        const updatedAt = (row: ManagerRow) =>
            row.source.lastFetched
                ? new Date(row.source.lastFetched).getTime()
                : 0
        const result: ManagerRow[] = matched.map(source => ({
            source,
            group: groupBySid.get(source.sid) || null,
        }))
        result.sort((a, b) => {
            if (sort === "name") {
                return (a.source.name || "").localeCompare(b.source.name || "")
            }
            if (sort === "unread") {
                return (b.source.unreadCount || 0) - (a.source.unreadCount || 0)
            }
            return updatedAt(b) - updatedAt(a)
        })
        return result
    }, [allSources, filterKey, groupBySid, query, sort])

    const counts = useMemo(() => {
        const visible = allSources.filter(source => !source.hidden)
        const byGid: Record<number, number> = {}
        groups
            .filter(g => g.isMultiple)
            .forEach(group => {
                byGid[group.gid] = group.sids.filter(
                    sid => sources[sid] && !sources[sid].hidden
                ).length
            })
        return {
            all: allSources.filter(source => !source.hidden).length,
            ungrouped: visible.filter(source => !groupBySid.has(source.sid))
                .length,
            stale: visible.filter(source => statusOf(source) === "stale")
                .length,
            hidden: allSources.length - visible.length,
            byGid,
        }
    }, [allSources, groupBySid, groups, sources])

    useEffect(() => {
        if (!rows.some(row => row.source.sid === currentSid)) {
            setCurrentSid(rows.length > 0 ? rows[0].source.sid : null)
        }
    }, [rows, currentSid])

    if (!app.manager.display) return null

    const selectedSource = currentSid != null ? sources[currentSid] : null
    const staleCount = counts.stale

    const submitAdd = async () => {
        const url = addUrl.trim()
        if (!urlTest(url) || adding) return
        setAdding(true)
        try {
            const sid = await dispatch(addSource(url))
            setAddUrl("")
            if (sid != null) {
                setFilterKey("all")
                setCurrentSid(sid)
            }
        } catch (err) {
            // addSource already surfaces the failure to the user.
        } finally {
            setAdding(false)
        }
    }

    return (
        <div className={classes.root}>
            <div className={classes.header}>
                <Button
                    appearance="subtle"
                    className={classes.backButton}
                    icon={<Icon iconName="Back" />}
                    onClick={() => dispatch(closeManager())}>
                    {intl.get("subs.back")}
                </Button>
                <div className={classes.titles}>
                    <div className={classes.title}>
                        {intl.get("subs.title")}
                    </div>
                    <div className={classes.subtitle}>
                        {intl.get("subs.stats", {
                            feeds: counts.all,
                            groups: groups.filter(g => g.isMultiple).length,
                        })}
                        {staleCount > 0 &&
                            intl.get("subs.staleStat", { count: staleCount })}
                    </div>
                </div>
                <div className={classes.headerActions}>
                    {app.fetchingItems && <Spinner size="tiny" />}
                    <Input
                        className={classes.search}
                        size="small"
                        value={query}
                        placeholder={intl.get("subs.search")}
                        contentBefore={<Icon iconName="Search" />}
                        onChange={(_, data) => setQuery(data.value)}
                    />
                    <Button
                        appearance="subtle"
                        icon={<Icon iconName="Import" />}
                        onClick={() => dispatch(importOPML())}>
                        {intl.get("sources.import")}
                    </Button>
                    <Button
                        appearance="subtle"
                        icon={<Icon iconName="Download" />}
                        onClick={() => dispatch(exportOPML())}>
                        {intl.get("sources.export")}
                    </Button>
                    <Button
                        appearance="subtle"
                        icon={<Icon iconName="Cancel" />}
                        title={intl.get("subs.back")}
                        onClick={() => dispatch(closeManager())}
                    />
                </div>
            </div>
            <div className={classes.addBar}>
                <Input
                    className={classes.addInput}
                    value={addUrl}
                    placeholder={intl.get("subs.addPlaceholder")}
                    onChange={(_, data) => setAddUrl(data.value)}
                    onKeyDown={event => {
                        if (event.key === "Enter") void submitAdd()
                    }}
                />
                <Button
                    appearance="primary"
                    disabled={!urlTest(addUrl.trim()) || adding}
                    icon={<Icon iconName="Add" />}
                    onClick={() => void submitAdd()}>
                    {intl.get("subs.addConfirm")}
                </Button>
            </div>
            <div className={classes.body}>
                <GroupTree
                    groups={groups}
                    sources={sources}
                    filterKey={filterKey}
                    counts={counts}
                    selectedSid={currentSid}
                    onFilter={setFilterKey}
                    onSelectSource={setCurrentSid}
                />
                <div className={classes.pane}>
                    <SourceTable
                        rows={rows}
                        filterKey={filterKey}
                        sort={sort}
                        counts={counts}
                        currentSid={currentSid}
                        onFilter={setFilterKey}
                        onSort={setSort}
                        onSelect={setCurrentSid}
                    />
                </div>
                {selectedSource ? (
                    <SourceInspector
                        source={selectedSource}
                        groups={groups}
                        onDeleted={() => setCurrentSid(null)}
                    />
                ) : (
                    <div
                        className={mergeClasses(
                            classes.pane,
                            classes.inspectorPane
                        )}>
                        <div className={classes.placeholder}>
                            <Icon iconName="Info" />
                            <span>{intl.get("subs.inspector")}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default SubscriptionManager
