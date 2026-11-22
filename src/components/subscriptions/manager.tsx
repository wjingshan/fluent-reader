import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import {
    Button,
    Dropdown,
    Input,
    Option,
    Spinner,
    mergeClasses,
} from "@fluentui/react-components"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import {
    addSource,
    toggleSourceHidden,
    RSSSource,
} from "../../scripts/models/source"
import {
    importOPML,
    exportOPML,
    reorderSourceGroups,
    createSourceGroup,
} from "../../scripts/models/group"
import { fetchItems } from "../../scripts/models/item"
import {
    moveSourcesToGroup,
    deleteSourcesQuiet,
} from "../../scripts/models/manager"
import { urlTest } from "../../scripts/utils"
import { closeManager, openManager } from "../../scripts/models/app"
import { useManagerStyles } from "./styles"
import { ManagerRow, statusOf } from "./utils"
import GroupTree from "./group-tree"
import SourceTable, { ManagerSort } from "./source-table"
import SourceInspector from "./source-inspector"
import CommandPalette, { ManagerCommand } from "./command-palette"

const TOAST_MS = 6000

interface ToastState {
    message: string
    undo?: () => void
}

const SubscriptionManager: React.FC = () => {
    const dispatch = useAppDispatch()
    const classes = useManagerStyles()
    const app = useAppSelector(state => state.app)
    const sources = useAppSelector(state => state.sources)
    const groups = useAppSelector(state => state.groups)
    const fetchErrors = useAppSelector(state => state.app.fetchErrors)
    const [query, setQuery] = useState("")
    const [filterKey, setFilterKey] = useState("all")
    const [sort, setSort] = useState<ManagerSort>("updated")
    const [currentSid, setCurrentSid] = useState<number>(null)
    const [addUrl, setAddUrl] = useState("")
    const [adding, setAdding] = useState(false)
    const [selected, setSelected] = useState<Set<number>>(() => new Set())
    const [anchorSid, setAnchorSid] = useState<number>(null)
    const [dragSids, setDragSids] = useState<number[]>(null)
    const [pendingDelete, setPendingDelete] = useState<Set<number>>(
        () => new Set()
    )
    const [bulkNewGroup, setBulkNewGroup] = useState(false)
    const [bulkGroupName, setBulkGroupName] = useState("")
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [treeCreateSignal, setTreeCreateSignal] = useState(0)
    const searchRef = useRef<any>(null)
    const addRef = useRef<any>(null)
    const [toast, setToast] = useState<ToastState>(null)
    const toastCommitRef = useRef<() => void>(null)
    const toastTimerRef = useRef<number>(null)

    // Finalize the visible toast: run its deferred commit (e.g. the actual
    // deletion) unless it is being undone.
    const finalizeToast = useCallback(() => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current)
            toastTimerRef.current = null
        }
        const commit = toastCommitRef.current
        toastCommitRef.current = null
        setToast(null)
        if (commit) commit()
    }, [])

    const showToast = useCallback(
        (message: string, opts: { undo?: () => void; commit?: () => void }) => {
            finalizeToast()
            toastCommitRef.current = opts.commit || null
            setToast({ message, undo: opts.undo })
            toastTimerRef.current = window.setTimeout(
                finalizeToast,
                TOAST_MS
            ) as unknown as number
        },
        [finalizeToast]
    )

    const undoToast = () => {
        const undo = toast?.undo
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current)
            toastTimerRef.current = null
        }
        toastCommitRef.current = null
        setToast(null)
        if (undo) undo()
    }

    useEffect(() => finalizeToast, [finalizeToast])

    const closeAll = useCallback(() => {
        finalizeToast()
        dispatch(closeManager())
    }, [dispatch, finalizeToast])

    useEffect(() => {
        if (!app.manager.display) return
        if (app.manager.focusGid != null) {
            setFilterKey(`g:${app.manager.focusGid}`)
        }
    }, [app.manager.display, app.manager.focusGid])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (paletteOpen) {
                    setPaletteOpen(false)
                    return
                }
                if (selected.size > 0) {
                    setSelected(new Set())
                    return
                }
                closeAll()
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [closeAll, selected.size, paletteOpen])

    // Global shortcuts: Ctrl/Cmd+Shift+M opens the manager from anywhere,
    // Ctrl/Cmd+K opens the palette, Ctrl/Cmd+F jumps to the search box.
    useEffect(() => {
        const onShortcut = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey
            if (!mod) return
            const key = event.key.toLowerCase()
            if (event.shiftKey && key === "m") {
                event.preventDefault()
                void dispatch(openManager())
                return
            }
            if (!app.manager.display) return
            if (key === "k") {
                event.preventDefault()
                setPaletteOpen(prev => !prev)
            } else if (key === "f") {
                event.preventDefault()
                searchRef.current?.focus()
            }
        }
        window.addEventListener("keydown", onShortcut)
        return () => window.removeEventListener("keydown", onShortcut)
    }, [dispatch, app.manager.display])

    const groupBySid = useMemo(() => {
        const map = new Map<number, typeof groups[number]>()
        groups
            .filter(g => g.isMultiple)
            .forEach(group => group.sids.forEach(sid => map.set(sid, group)))
        return map
    }, [groups])

    const multiGroups = useMemo(
        () => groups.filter(g => g.isMultiple),
        [groups]
    )

    const allSources = useMemo(
        () =>
            Object.values(sources).filter(
                source => source && !pendingDelete.has(source.sid)
            ),
        [sources, pendingDelete]
    )

    // Drop selections whose sources no longer exist.
    useEffect(() => {
        setSelected(prev => {
            const next = new Set(
                [...prev].filter(sid => sources[sid] && !pendingDelete.has(sid))
            )
            return next.size === prev.size ? prev : next
        })
    }, [sources, pendingDelete])

    const rows = useMemo(() => {
        const visible = allSources.filter(source => !source.hidden)
        const needle = query.trim().toLowerCase()
        let list = visible
        if (filterKey === "ungrouped") {
            list = visible.filter(source => !groupBySid.has(source.sid))
        } else if (filterKey === "failed") {
            list = visible.filter(source => Boolean(fetchErrors[source.sid]))
        } else if (filterKey === "stale") {
            list = visible.filter(
                source =>
                    statusOf(source, fetchErrors[source.sid]) === "stale"
            )
        } else if (filterKey === "never") {
            list = visible.filter(source => !source.lastFetched)
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
    }, [allSources, filterKey, groupBySid, query, sort, fetchErrors])

    // While a selection is active, freeze the row order: background fetches
    // keep updating lastFetched, and re-sorting mid-selection would move
    // checkboxes under the pointer.
    const frozenOrderRef = useRef<number[]>(null)
    const orderedRows = useMemo(() => {
        if (selected.size === 0) {
            frozenOrderRef.current = null
            return rows
        }
        if (!frozenOrderRef.current) {
            frozenOrderRef.current = rows.map(row => row.source.sid)
        }
        const pos = new Map(
            frozenOrderRef.current.map((sid, index) => [sid, index])
        )
        return [...rows].sort(
            (a, b) =>
                (pos.get(a.source.sid) ?? Number.MAX_SAFE_INTEGER) -
                (pos.get(b.source.sid) ?? Number.MAX_SAFE_INTEGER)
        )
    }, [rows, selected.size])

    const counts = useMemo(() => {
        const visible = allSources.filter(source => !source.hidden)
        const byGid: Record<number, number> = {}
        multiGroups.forEach(group => {
            byGid[group.gid] = group.sids.filter(
                sid =>
                    sources[sid] &&
                    !sources[sid].hidden &&
                    !pendingDelete.has(sid)
            ).length
        })
        return {
            all: visible.length,
            ungrouped: visible.filter(source => !groupBySid.has(source.sid))
                .length,
            stale: visible.filter(
                source =>
                    statusOf(source, fetchErrors[source.sid]) === "stale"
            ).length,
            never: visible.filter(source => !source.lastFetched).length,
            failed: visible.filter(source => Boolean(fetchErrors[source.sid]))
                .length,
            hidden: allSources.length - visible.length,
            byGid,
        }
    }, [
        allSources,
        groupBySid,
        multiGroups,
        sources,
        pendingDelete,
        fetchErrors,
    ])

    useEffect(() => {
        if (!rows.some(row => row.source.sid === currentSid)) {
            setCurrentSid(rows.length > 0 ? rows[0].source.sid : null)
        }
    }, [rows, currentSid])

    const commands = useMemo<ManagerCommand[]>(() => {
        const list: ManagerCommand[] = [
            {
                id: "search",
                label: intl.get("subs.cmdSearch"),
                keys: "Ctrl+F",
                run: () => searchRef.current?.focus(),
            },
            {
                id: "add",
                label: intl.get("subs.cmdAdd"),
                run: () => addRef.current?.focus(),
            },
            {
                id: "import",
                label: intl.get("subs.cmdImport"),
                run: () => void dispatch(importOPML()),
            },
            {
                id: "export",
                label: intl.get("subs.cmdExport"),
                run: () => void dispatch(exportOPML()),
            },
            {
                id: "refreshAll",
                label: intl.get("subs.cmdRefreshAll"),
                run: () => dispatch(fetchItems(false, null)),
            },
            {
                id: "filterAll",
                label: intl.get("subs.cmdFilterAll"),
                run: () => setFilterKey("all"),
            },
            {
                id: "filterUngrouped",
                label: intl.get("subs.cmdFilterUngrouped"),
                run: () => setFilterKey("ungrouped"),
            },
            {
                id: "filterFailed",
                label: intl.get("subs.cmdFilterFailed"),
                run: () => setFilterKey("failed"),
            },
            {
                id: "filterStale",
                label: intl.get("subs.cmdFilterStale"),
                run: () => setFilterKey("stale"),
            },
            {
                id: "filterHidden",
                label: intl.get("subs.cmdFilterHidden"),
                run: () => setFilterKey("hidden"),
            },
            {
                id: "newGroup",
                label: intl.get("subs.cmdNewGroup"),
                run: () => setTreeCreateSignal(prev => prev + 1),
            },
            {
                id: "close",
                label: intl.get("subs.cmdClose"),
                keys: "Esc",
                run: closeAll,
            },
        ]
        if (selected.size > 0) {
            list.splice(5, 0, {
                id: "refreshSelected",
                label: intl.get("subs.cmdRefreshSelected"),
                hint: intl.get("subs.selectedCount", { count: selected.size }),
                run: () => dispatch(fetchItems(true, [...selected])),
            })
        }
        multiGroups.forEach(group => {
            list.push({
                id: `g${group.gid}`,
                label: `${intl.get("subs.cmdGroupPrefix")}：${group.name}`,
                hint: String(group.sids.length),
                run: () => setFilterKey(`g:${group.gid}`),
            })
        })
        return list
    }, [selected, multiGroups, dispatch, closeAll])

    if (!app.manager.display) return null

    const selectedSource = currentSid != null ? sources[currentSid] : null
    const staleCount = counts.stale
    const failedCount = counts.failed

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

    /* ---------- selection ---------- */

    const toggleSelect = (sid: number, shiftKey: boolean) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (shiftKey && anchorSid != null) {
                const ids = orderedRows.map(row => row.source.sid)
                const from = ids.indexOf(anchorSid)
                const to = ids.indexOf(sid)
                if (from !== -1 && to !== -1) {
                    const [lo, hi] = from < to ? [from, to] : [to, from]
                    for (let i = lo; i <= hi; i += 1) next.add(ids[i])
                    return next
                }
            }
            if (next.has(sid)) next.delete(sid)
            else next.add(sid)
            return next
        })
        setAnchorSid(sid)
    }

    const toggleAll = () => {
        const ids = orderedRows.map(row => row.source.sid)
        const allChecked = ids.length > 0 && ids.every(sid => selected.has(sid))
        setSelected(prev => {
            const next = new Set(prev)
            ids.forEach(sid => {
                if (allChecked) next.delete(sid)
                else next.add(sid)
            })
            return next
        })
    }

    /* ---------- bulk actions ---------- */

    const moveSelected = (
        sids: number[],
        gid: number | null,
        knownName?: string
    ) => {
        const snapshot = dispatch(moveSourcesToGroup(sids, gid))
        if (!snapshot) return
        // A group created moments ago is not in this render's closure yet, so
        // callers may pass the name they just typed.
        const targetName =
            gid === null
                ? null
                : knownName ?? (groups.find(g => g.gid === gid)?.name || "")
        showToast(
            gid === null
                ? intl.get("subs.movedUngroupedToast", { count: sids.length })
                : intl.get("subs.movedToast", {
                      count: sids.length,
                      name: targetName,
                  }),
            { undo: () => dispatch(reorderSourceGroups(snapshot)) }
        )
    }

    const bulkSetHidden = async (hide: boolean) => {
        for (const sid of [...selected]) {
            const source = sources[sid]
            if (source && Boolean(source.hidden) !== hide) {
                await dispatch(toggleSourceHidden(source))
            }
        }
    }

    const bulkRefresh = () => {
        dispatch(fetchItems(true, [...selected]))
    }

    // Create a group on the fly and move the current selection into it.
    const createGroupAndMove = () => {
        const name = bulkGroupName.trim()
        if (!name || selected.size === 0) return
        const gid = dispatch(createSourceGroup(name))
        setBulkNewGroup(false)
        setBulkGroupName("")
        if (gid != null) moveSelected([...selected], gid, name)
    }

    const bulkDelete = () => {
        const sids = [...selected]
        const doomed: RSSSource[] = sids
            .map(sid => sources[sid])
            .filter(Boolean)
        if (doomed.length === 0) return
        setSelected(new Set())
        setPendingDelete(prev => new Set([...prev, ...sids]))
        showToast(intl.get("subs.deletedToast", { count: doomed.length }), {
            undo: () => {
                setPendingDelete(prev => {
                    const next = new Set(prev)
                    sids.forEach(sid => next.delete(sid))
                    return next
                })
            },
            commit: () => {
                setPendingDelete(prev => {
                    const next = new Set(prev)
                    sids.forEach(sid => next.delete(sid))
                    return next
                })
                void dispatch(deleteSourcesQuiet(doomed))
            },
        })
    }

    /* ---------- drag & drop ---------- */

    const onDragStartRow = (sid: number, event: React.DragEvent) => {
        const sids =
            selected.has(sid) && selected.size > 0 ? [...selected] : [sid]
        setDragSids(sids)
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", JSON.stringify(sids))
    }

    const onMoveSources = (sids: number[], gid: number | null) => {
        setDragSids(null)
        moveSelected(sids, gid)
    }

    const selectedHiddenVisible = filterKey === "hidden"

    return createPortal(
        <div className={classes.root}>
            <div className={classes.header}>
                <Button
                    appearance="subtle"
                    className={classes.backButton}
                    icon={<Icon iconName="Back" />}
                    onClick={closeAll}>
                    {intl.get("subs.back")}
                </Button>
                <div className={classes.titles}>
                    <div className={classes.title}>
                        {intl.get("subs.title")}
                    </div>
                    <div className={classes.subtitle}>
                        {intl.get("subs.stats", {
                            feeds: counts.all,
                            groups: multiGroups.length,
                        })}
                        {staleCount > 0 &&
                            intl.get("subs.staleStat", { count: staleCount })}
                        {failedCount > 0 &&
                            intl.get("subs.failedStat", { count: failedCount })}
                    </div>
                </div>
                <div className={classes.headerActions}>
                    {app.fetchingItems && <Spinner size="tiny" />}
                    <Input
                        ref={searchRef}
                        className={classes.search}
                        size="small"
                        value={query}
                        placeholder={intl.get("subs.search")}
                        contentBefore={<Icon iconName="Search" />}
                        onChange={(_, data) => setQuery(data.value)}
                    />
                    <Button
                        appearance="subtle"
                        icon={<Icon iconName="CommandPrompt" />}
                        title={intl.get("subs.shortcutHint")}
                        onClick={() => setPaletteOpen(true)}
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
                        onClick={closeAll}
                    />
                </div>
            </div>
            <div className={classes.addBar}>
                <Input
                    ref={addRef}
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
                    dragSids={dragSids}
                    createSignal={treeCreateSignal}
                    onFilter={setFilterKey}
                    onSelectSource={setCurrentSid}
                    onMoveSources={onMoveSources}
                />
                <div className={classes.pane}>
                    <SourceTable
                        rows={orderedRows}
                        filterKey={filterKey}
                        sort={sort}
                        counts={counts}
                        currentSid={currentSid}
                        selected={selected}
                        dragging={dragSids != null}
                        fetchErrors={fetchErrors}
                        onFilter={setFilterKey}
                        onSort={setSort}
                        onSelect={setCurrentSid}
                        onToggleSelect={toggleSelect}
                        onToggleAll={toggleAll}
                        onDragStartRow={onDragStartRow}
                        onDragEndRow={() => setDragSids(null)}
                    />
                    {selected.size > 0 && (
                        <div className={classes.bulkBar}>
                            <span className={classes.bulkCount}>
                                {intl.get("subs.selectedCount", {
                                    count: selected.size,
                                })}
                            </span>
                            {bulkNewGroup ? (
                                <>
                                    <Input
                                        className={classes.bulkMoveDropdown}
                                        size="small"
                                        autoFocus
                                        value={bulkGroupName}
                                        placeholder={intl.get("subs.groupName")}
                                        onChange={(_, data) =>
                                            setBulkGroupName(data.value)
                                        }
                                        onKeyDown={event => {
                                            if (event.key === "Enter")
                                                createGroupAndMove()
                                            if (event.key === "Escape") {
                                                setBulkNewGroup(false)
                                                setBulkGroupName("")
                                            }
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        appearance="primary"
                                        disabled={!bulkGroupName.trim()}
                                        onClick={createGroupAndMove}>
                                        {intl.get("subs.newGroupAndMove")}
                                    </Button>
                                    <Button
                                        size="small"
                                        appearance="subtle"
                                        onClick={() => {
                                            setBulkNewGroup(false)
                                            setBulkGroupName("")
                                        }}>
                                        {intl.get("subs.cancel")}
                                    </Button>
                                </>
                            ) : (
                                <Dropdown
                                    size="small"
                                    className={classes.bulkMoveDropdown}
                                    value={intl.get("subs.moveTo")}
                                    selectedOptions={[]}
                                    onOptionSelect={(_, data) => {
                                        if (!data.optionValue) return
                                        if (data.optionValue === "__new__") {
                                            setBulkNewGroup(true)
                                            return
                                        }
                                        moveSelected(
                                            [...selected],
                                            data.optionValue === "ungrouped"
                                                ? null
                                                : parseInt(data.optionValue)
                                        )
                                    }}>
                                    <Option
                                        value="ungrouped"
                                        text={intl.get("subs.ungrouped")}>
                                        {intl.get("subs.ungrouped")}
                                    </Option>
                                    {multiGroups.map(group => (
                                        <Option
                                            key={group.gid}
                                            value={String(group.gid)}
                                            text={group.name}>
                                            {group.name}
                                        </Option>
                                    ))}
                                    <Option
                                        value="__new__"
                                        text={intl.get("subs.newGroupHere")}>
                                        {intl.get("subs.newGroupHere")}
                                    </Option>
                                </Dropdown>
                            )}
                            {selectedHiddenVisible ? (
                                <Button
                                    size="small"
                                    appearance="subtle"
                                    icon={<Icon iconName="View" />}
                                    onClick={() => void bulkSetHidden(false)}>
                                    {intl.get("subs.bulkShow")}
                                </Button>
                            ) : (
                                <Button
                                    size="small"
                                    appearance="subtle"
                                    icon={<Icon iconName="Hide" />}
                                    onClick={() => void bulkSetHidden(true)}>
                                    {intl.get("subs.bulkHide")}
                                </Button>
                            )}
                            <Button
                                size="small"
                                appearance="subtle"
                                icon={<Icon iconName="Refresh" />}
                                onClick={bulkRefresh}>
                                {intl.get("subs.bulkRefresh")}
                            </Button>
                            <Button
                                size="small"
                                appearance="subtle"
                                className={classes.dangerButton}
                                icon={<Icon iconName="Delete" />}
                                onClick={bulkDelete}>
                                {intl.get("subs.bulkDelete")}
                            </Button>
                            <span className={classes.bulkSpacer} />
                            <Button
                                size="small"
                                appearance="subtle"
                                onClick={() => setSelected(new Set())}>
                                {intl.get("subs.clearSelection")}
                            </Button>
                        </div>
                    )}
                </div>
                {selectedSource ? (
                    <SourceInspector
                        source={selectedSource}
                        groups={groups}
                        error={fetchErrors[selectedSource.sid]}
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
            {paletteOpen && (
                <CommandPalette
                    commands={commands}
                    onClose={() => setPaletteOpen(false)}
                />
            )}
            {toast && (
                <div className={classes.toast}>
                    <span>{toast.message}</span>
                    {toast.undo && (
                        <button
                            className={classes.toastUndo}
                            onClick={undoToast}>
                            {intl.get("subs.undo")}
                        </button>
                    )}
                    <button
                        className={classes.toastClose}
                        title={intl.get("subs.dismiss")}
                        onClick={finalizeToast}>
                        <Icon iconName="Cancel" />
                    </button>
                </div>
            )}
        </div>,
        // Portal next to #root (inside the FluentProvider) so the manager keeps
        // the v9 theme variables while staying above the reader layout.
        document.getElementById("root")?.parentElement ?? document.body
    )
}

export default SubscriptionManager
