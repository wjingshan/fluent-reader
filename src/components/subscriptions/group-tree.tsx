import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { Button, Input, mergeClasses } from "@fluentui/react-components"
import { useAppDispatch } from "../../scripts/reducer"
import {
    createSourceGroup,
    reorderSourceGroups,
    updateSourceGroup,
} from "../../scripts/models/group"
import { deleteSourceGroupQuiet } from "../../scripts/models/manager"
import { SourceGroup } from "../../schema-types"
import { SourceState } from "../../scripts/models/source"
import { useManagerStyles } from "./styles"

export interface GroupTreeProps {
    groups: SourceGroup[]
    sources: SourceState
    filterKey: string
    counts: { all: number; ungrouped: number; byGid: Record<number, number> }
    selectedSid: number | null
    dragSids: number[] | null
    // Bumped from the command palette to open the inline "new group" input.
    createSignal?: number
    onFilter: (key: string) => void
    onSelectSource: (sid: number) => void
    onMoveSources: (sids: number[], gid: number | null) => void
}

const GROUP_COLORS = [
    "#0f6cbd",
    "#c94f4f",
    "#6b5bd2",
    "#2f8f6b",
    "#b8791f",
    "#4a6fa5",
    "#a3528f",
    "#3d7d8c",
]

export const groupColor = (gid: number) =>
    GROUP_COLORS[Math.abs(gid) % GROUP_COLORS.length]

// Group reordering uses its own drag type so a group node is never mistaken for
// a source being dropped into a group.
const GROUP_DRAG_TYPE = "application/x-fr-group"

const GroupTree: React.FC<GroupTreeProps> = props => {
    const { groups, sources, filterKey, counts, selectedSid, dragSids } = props
    const dispatch = useAppDispatch()
    const classes = useManagerStyles()
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
    const [editingGid, setEditingGid] = useState<number>(null)
    const [draftName, setDraftName] = useState("")
    const [creating, setCreating] = useState(false)
    const [newName, setNewName] = useState("")
    const [dropKey, setDropKey] = useState<string>(null)
    const [dragGid, setDragGid] = useState<number>(null)
    const [insertMark, setInsertMark] = useState<{
        gid: number
        before: boolean
    }>(null)

    // Command palette "new group" opens the inline composer below the tree.
    useEffect(() => {
        if (props.createSignal) setCreating(true)
    }, [props.createSignal])

    const dropProps = (key: string, gid: number | null) => ({
        onDragOver: (event: React.DragEvent) => {
            // A group being reordered hovers as an insertion line; the root
            // entries (All / Ungrouped) are not valid reorder targets.
            if (event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) {
                if (gid == null || dragGid === gid) {
                    setInsertMark(prev =>
                        prev && prev.gid !== gid ? prev : null
                    )
                    return
                }
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                const rect = event.currentTarget.getBoundingClientRect()
                setInsertMark({
                    gid,
                    before: event.clientY < rect.top + rect.height / 2,
                })
                return
            }
            // A group being reordered must not light up as a drop target for
            // sources.
            const hasPayload =
                dragSids || event.dataTransfer.types.includes("text/plain")
            if (!hasPayload) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            setDropKey(key)
        },
        onDragLeave: () => {
            setDropKey(prev => (prev === key ? null : prev))
        },
        onDrop: (event: React.DragEvent) => {
            event.preventDefault()
            setDropKey(null)
            if (event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) {
                if (gid == null) return
                event.stopPropagation()
                const fromGid =
                    dragGid ??
                    parseInt(event.dataTransfer.getData(GROUP_DRAG_TYPE))
                const before =
                    insertMark?.gid === gid ? insertMark.before : true
                setDragGid(null)
                setInsertMark(null)
                if (Number.isFinite(fromGid)) {
                    applyReorder(fromGid, gid, before)
                }
                return
            }
            let sids = dragSids
            if (!sids) {
                try {
                    const parsed = JSON.parse(
                        event.dataTransfer.getData("text/plain")
                    )
                    if (Array.isArray(parsed)) sids = parsed
                } catch {
                    sids = null
                }
            }
            if (sids && sids.length > 0) {
                props.onMoveSources(sids, gid)
            }
        },
    })

    const multiGroups = useMemo(
        () => groups.filter(g => g.isMultiple),
        [groups]
    )

    // Moves one group before/after another, keeping single-source placeholder
    // groups at their original slots so the persisted order stays complete.
    const applyReorder = (fromGid: number, toGid: number, before: boolean) => {
        if (fromGid === toGid) return
        const list = groups.filter(g => g.isMultiple)
        const moved = list.find(g => g.gid === fromGid)
        if (!moved) return
        const rest = list.filter(g => g.gid !== fromGid)
        let index = rest.findIndex(g => g.gid === toGid)
        if (index < 0) return
        if (!before) index += 1
        rest.splice(index, 0, moved)
        let cursor = 0
        const next = groups.map(group =>
            group.isMultiple ? rest[cursor++] : group
        )
        dispatch(reorderSourceGroups(next))
    }

    // Only the grab/drag lifecycle lives here; the hover and drop handling is
    // merged into dropProps so a node can serve both source drops and reorders.
    const groupDragProps = (group: SourceGroup) => ({
        draggable: editingGid !== group.gid,
        onDragStart: (event: React.DragEvent) => {
            setDragGid(group.gid)
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData(GROUP_DRAG_TYPE, String(group.gid))
        },
        onDragEnd: () => {
            setDragGid(null)
            setInsertMark(null)
        },
    })

    const toggleExpand = (gid: number) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(gid)) next.delete(gid)
            else next.add(gid)
            return next
        })
    }

    const startRename = (group: SourceGroup) => {
        setEditingGid(group.gid)
        setDraftName(group.name)
    }

    const commitRename = (group: SourceGroup) => {
        const name = draftName.trim()
        setEditingGid(null)
        if (name && name !== group.name) {
            dispatch(updateSourceGroup({ ...group, name }))
        }
    }

    const removeGroup = async (group: SourceGroup) => {
        const confirmed = await window.utils.showMessageBox(
            intl.get("subs.groupDeleteTitle"),
            intl.get("subs.groupDeleteWarning", { name: group.name }),
            intl.get("subs.deleteConfirm"),
            intl.get("subs.cancel"),
            true,
            "warning"
        )
        if (confirmed) dispatch(deleteSourceGroupQuiet(group.gid))
    }

    const commitCreate = () => {
        const name = newName.trim()
        if (name) {
            dispatch(createSourceGroup(name))
            setNewName("")
            setCreating(false)
        }
    }

    return (
        <div className={mergeClasses(classes.pane, classes.treePane)}>
            <div className={classes.treeHead}>
                <span>{intl.get("subs.groups")}</span>
                <span>{multiGroups.length}</span>
            </div>
            <div className={classes.treeScroll}>
                <div
                    className={mergeClasses(
                        classes.treeItem,
                        filterKey === "all" && classes.treeItemActive
                    )}
                    onClick={() => props.onFilter("all")}>
                    <span style={{ width: "14px" }} />
                    <span className={classes.treeDot} />
                    <span className={classes.treeLabel}>
                        {intl.get("subs.all")}
                    </span>
                    <span className={classes.treeCount}>{counts.all}</span>
                </div>
                <div
                    className={mergeClasses(
                        classes.treeItem,
                        filterKey === "ungrouped" && classes.treeItemActive,
                        dropKey === "ungrouped" && classes.treeDropTarget
                    )}
                    onClick={() => props.onFilter("ungrouped")}
                    {...dropProps("ungrouped", null)}>
                    <span style={{ width: "14px" }} />
                    <span className={classes.treeDot} />
                    <span className={classes.treeLabel}>
                        {intl.get("subs.ungrouped")}
                    </span>
                    <span className={classes.treeCount}>
                        {counts.ungrouped}
                    </span>
                </div>
                {multiGroups.length > 0 && <div className={classes.treeSep} />}
                {multiGroups.map(group => {
                    const isOpen = expanded.has(group.gid)
                    const active = filterKey === `g:${group.gid}`
                    const members = group.sids
                        .map(sid => sources[sid])
                        .filter(source => source && !source.hidden)
                    return (
                        <React.Fragment key={group.gid}>
                            <div
                                className={mergeClasses(
                                    classes.treeItem,
                                    active && classes.treeItemActive,
                                    dropKey === `g:${group.gid}` &&
                                        classes.treeDropTarget,
                                    dragGid === group.gid &&
                                        classes.treeGroupDragging,
                                    insertMark?.gid === group.gid &&
                                        (insertMark.before
                                            ? classes.treeInsertBefore
                                            : classes.treeInsertAfter)
                                )}
                                onClick={() => props.onFilter(`g:${group.gid}`)}
                                title={intl.get("subs.dragGroupHint")}
                                {...groupDragProps(group)}
                                {...dropProps(`g:${group.gid}`, group.gid)}>
                                <Icon
                                    iconName="ChevronRight"
                                    className={mergeClasses(
                                        classes.treeChevron,
                                        isOpen && classes.treeChevronOpen
                                    )}
                                    onClick={event => {
                                        event.stopPropagation()
                                        toggleExpand(group.gid)
                                    }}
                                />
                                <span
                                    className={classes.treeDot}
                                    style={{
                                        backgroundColor: groupColor(group.gid),
                                    }}
                                />
                                {editingGid === group.gid ? (
                                    <Input
                                        className={classes.treeInput}
                                        value={draftName}
                                        autoFocus
                                        size="small"
                                        appearance="underline"
                                        onChange={(_, data) =>
                                            setDraftName(data.value)
                                        }
                                        onClick={event =>
                                            event.stopPropagation()
                                        }
                                        onBlur={() => commitRename(group)}
                                        onKeyDown={event => {
                                            if (event.key === "Enter")
                                                commitRename(group)
                                            if (event.key === "Escape")
                                                setEditingGid(null)
                                        }}
                                    />
                                ) : (
                                    <span
                                        className={classes.treeLabel}
                                        title={intl.get("subs.renameGroup")}
                                        onDoubleClick={event => {
                                            event.stopPropagation()
                                            startRename(group)
                                        }}>
                                        {group.name}
                                    </span>
                                )}
                                <span className={classes.treeCount}>
                                    {counts.byGid[group.gid] || 0}
                                </span>
                                <Button
                                    appearance="subtle"
                                    size="small"
                                    className={classes.treeIconButton}
                                    title={intl.get("subs.deleteGroup")}
                                    onClick={event => {
                                        event.stopPropagation()
                                        void removeGroup(group)
                                    }}
                                    icon={<Icon iconName="Delete" />}
                                />
                            </div>
                            {isOpen &&
                                members.map(source => (
                                    <div
                                        key={source.sid}
                                        className={mergeClasses(
                                            classes.treeItem,
                                            classes.treeChild,
                                            selectedSid === source.sid &&
                                                classes.treeItemActive
                                        )}
                                        onClick={() => {
                                            props.onFilter(`g:${group.gid}`)
                                            props.onSelectSource(source.sid)
                                        }}>
                                        <span
                                            className={mergeClasses(
                                                classes.treeDot,
                                                classes.avatar
                                            )}
                                            style={{
                                                backgroundColor: groupColor(
                                                    group.gid
                                                ),
                                                width: "18px",
                                                height: "18px",
                                                fontSize: "9px",
                                                opacity: 0.9,
                                            }}>
                                            {source.name?.trim().charAt(0) ||
                                                "?"}
                                        </span>
                                        <span
                                            className={classes.treeChildLabel}
                                            title={source.name}>
                                            {source.name}
                                        </span>
                                        {(source.unreadCount || 0) > 0 && (
                                            <span className={classes.treeCount}>
                                                {source.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            {isOpen && members.length === 0 && (
                                <div
                                    className={mergeClasses(
                                        classes.treeItem,
                                        classes.treeChild
                                    )}>
                                    <span
                                        className={classes.treeChildLabel}
                                        style={{
                                            color: "var(--colorNeutralForeground3)",
                                        }}>
                                        {intl.get("subs.groupEmpty")}
                                    </span>
                                </div>
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
            {creating ? (
                <div className={classes.treeItem}>
                    <span style={{ width: "14px" }} />
                    <Input
                        className={classes.treeInput}
                        value={newName}
                        autoFocus
                        size="small"
                        appearance="underline"
                        placeholder={intl.get("subs.groupName")}
                        onChange={(_, data) => setNewName(data.value)}
                        onKeyDown={event => {
                            if (event.key === "Enter") commitCreate()
                            if (event.key === "Escape") {
                                setCreating(false)
                                setNewName("")
                            }
                        }}
                        onBlur={() => {
                            if (newName.trim()) commitCreate()
                            else setCreating(false)
                        }}
                    />
                </div>
            ) : (
                <Button
                    appearance="subtle"
                    size="small"
                    className={classes.newGroupButton}
                    icon={<Icon iconName="Add" />}
                    onClick={() => setCreating(true)}>
                    {intl.get("subs.newGroup")}
                </Button>
            )}
        </div>
    )
}

export default GroupTree
