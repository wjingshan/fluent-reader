import * as React from "react"
import { useMemo, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { Button, Input, mergeClasses } from "@fluentui/react-components"
import { useAppDispatch } from "../../scripts/reducer"
import {
    createSourceGroup,
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
    onFilter: (key: string) => void
    onSelectSource: (sid: number) => void
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

const GroupTree: React.FC<GroupTreeProps> = props => {
    const { groups, sources, filterKey, counts, selectedSid } = props
    const dispatch = useAppDispatch()
    const classes = useManagerStyles()
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
    const [editingGid, setEditingGid] = useState<number>(null)
    const [draftName, setDraftName] = useState("")
    const [creating, setCreating] = useState(false)
    const [newName, setNewName] = useState("")

    const multiGroups = useMemo(
        () => groups.filter(g => g.isMultiple),
        [groups]
    )

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
                        filterKey === "ungrouped" && classes.treeItemActive
                    )}
                    onClick={() => props.onFilter("ungrouped")}>
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
                                    active && classes.treeItemActive
                                )}
                                onClick={() =>
                                    props.onFilter(`g:${group.gid}`)
                                }>
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
