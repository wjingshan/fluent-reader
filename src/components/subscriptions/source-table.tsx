import * as React from "react"
import intl from "react-intl-universal"
import {
    Checkbox,
    Dropdown,
    Option,
    mergeClasses,
} from "@fluentui/react-components"
import { useManagerStyles } from "./styles"
import { groupColor } from "./group-tree"
import {
    avatarColor,
    ManagerRow,
    relativeTime,
    statusLabel,
    statusOf,
} from "./utils"

export type ManagerSort = "updated" | "name" | "unread"

export interface SourceTableProps {
    rows: ManagerRow[]
    filterKey: string
    sort: ManagerSort
    counts: {
        all: number
        ungrouped: number
        stale: number
        hidden: number
        never: number
    }
    currentSid: number | null
    selected: Set<number>
    dragging: boolean
    onFilter: (key: string) => void
    onSort: (sort: ManagerSort) => void
    onSelect: (sid: number) => void
    onToggleSelect: (sid: number, shiftKey: boolean) => void
    onToggleAll: () => void
    onDragStartRow: (sid: number, event: React.DragEvent) => void
    onDragEndRow: () => void
}

const SourceTable: React.FC<SourceTableProps> = props => {
    const { rows, filterKey, sort, counts, currentSid, selected } = props
    const classes = useManagerStyles()

    const chips: {
        key: string
        label: string
        count: number
        danger?: boolean
    }[] = [
        { key: "all", label: intl.get("subs.all"), count: counts.all },
        {
            key: "ungrouped",
            label: intl.get("subs.ungrouped"),
            count: counts.ungrouped,
        },
        { key: "stale", label: intl.get("subs.stale"), count: counts.stale },
        { key: "hidden", label: intl.get("subs.hidden"), count: counts.hidden },
    ]

    const sortLabel = {
        updated: intl.get("subs.sortUpdated"),
        name: intl.get("subs.sortName"),
        unread: intl.get("subs.sortUnread"),
    }[sort]

    const allChecked =
        rows.length > 0 && rows.every(row => selected.has(row.source.sid))
    const someChecked = rows.some(row => selected.has(row.source.sid))

    const showHealth = filterKey === "stale" || filterKey === "never"
    const healthCards = [
        { key: "all", label: intl.get("subs.all"), value: counts.all },
        {
            key: "stale",
            label: intl.get("subs.stale"),
            value: counts.stale,
            warn: true,
        },
        {
            key: "never",
            label: intl.get("subs.never"),
            value: counts.never,
            warn: true,
        },
        { key: "hidden", label: intl.get("subs.hidden"), value: counts.hidden },
    ]

    return (
        <>
            <div className={classes.filters}>
                {chips.map(chip => (
                    <button
                        key={chip.key}
                        className={mergeClasses(
                            classes.chip,
                            filterKey === chip.key && classes.chipActive
                        )}
                        onClick={() => props.onFilter(chip.key)}>
                        {chip.label}
                        <span className={classes.chipCount}>{chip.count}</span>
                    </button>
                ))}
                <div className={classes.sortWrap}>
                    <span>{intl.get("subs.sort")}</span>
                    <Dropdown
                        className={classes.sortDropdown}
                        size="small"
                        value={sortLabel}
                        selectedOptions={[sort]}
                        onOptionSelect={(_, data) =>
                            props.onSort(data.optionValue as ManagerSort)
                        }>
                        <Option
                            value="updated"
                            text={intl.get("subs.sortUpdated")}>
                            {intl.get("subs.sortUpdated")}
                        </Option>
                        <Option value="name" text={intl.get("subs.sortName")}>
                            {intl.get("subs.sortName")}
                        </Option>
                        <Option
                            value="unread"
                            text={intl.get("subs.sortUnread")}>
                            {intl.get("subs.sortUnread")}
                        </Option>
                    </Dropdown>
                </div>
            </div>
            {showHealth && (
                <div className={classes.healthCards}>
                    {healthCards.map(card => (
                        <button
                            key={card.key}
                            className={mergeClasses(
                                classes.healthCard,
                                filterKey === card.key &&
                                    classes.healthCardActive
                            )}
                            onClick={() => props.onFilter(card.key)}>
                            <span
                                className={mergeClasses(
                                    classes.healthValue,
                                    card.warn &&
                                        card.value > 0 &&
                                        classes.healthValueWarn
                                )}>
                                {card.value}
                            </span>
                            <span className={classes.healthLabel}>
                                {card.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <div className={classes.tableScroll}>
                <div className={classes.tableHead}>
                    <Checkbox
                        className={classes.rowCheckbox}
                        checked={
                            allChecked ? true : someChecked ? "mixed" : false
                        }
                        onChange={() => props.onToggleAll()}
                        title={intl.get("subs.selectAll")}
                    />
                    <button
                        className={mergeClasses(
                            classes.thButton,
                            sort === "name" && classes.thSorted
                        )}
                        onClick={() => props.onSort("name")}>
                        {intl.get("subs.sortName")} / URL
                        {sort === "name" && <span>↑</span>}
                    </button>
                    <span>{intl.get("subs.colGroup")}</span>
                    <button
                        className={mergeClasses(
                            classes.thButton,
                            classes.thButtonRight,
                            sort === "unread" && classes.thSorted
                        )}
                        onClick={() => props.onSort("unread")}>
                        {intl.get("subs.colUnread")}
                        {sort === "unread" && <span>↓</span>}
                    </button>
                    <button
                        className={mergeClasses(
                            classes.thButton,
                            classes.thButtonRight,
                            sort === "updated" && classes.thSorted
                        )}
                        onClick={() => props.onSort("updated")}>
                        {intl.get("subs.colUpdated")}
                        {sort === "updated" && <span>↓</span>}
                    </button>
                    <span>{intl.get("subs.colStatus")}</span>
                </div>
                {rows.length === 0 ? (
                    <div className={classes.empty}>
                        <div className={classes.emptyTitle}>
                            {intl.get("subs.empty")}
                        </div>
                        <div>{intl.get("subs.emptyHint")}</div>
                    </div>
                ) : (
                    rows.map(row => {
                        const source = row.source
                        const status = statusOf(source)
                        const unread = source.unreadCount || 0
                        const isChecked = selected.has(source.sid)
                        return (
                            <div
                                key={source.sid}
                                className={mergeClasses(
                                    classes.row,
                                    source.sid === currentSid &&
                                        classes.rowActive,
                                    isChecked && classes.rowSelected,
                                    props.dragging &&
                                        isChecked &&
                                        classes.rowDragging
                                )}
                                draggable
                                onDragStart={event =>
                                    props.onDragStartRow(source.sid, event)
                                }
                                onDragEnd={props.onDragEndRow}
                                onClick={() => props.onSelect(source.sid)}>
                                <Checkbox
                                    className={classes.rowCheckbox}
                                    checked={isChecked}
                                    onClick={event => {
                                        event.stopPropagation()
                                        props.onToggleSelect(
                                            source.sid,
                                            event.shiftKey
                                        )
                                    }}
                                    onChange={() => undefined}
                                />
                                <div className={classes.feed}>
                                    <div
                                        className={classes.avatar}
                                        style={{
                                            backgroundColor: avatarColor(
                                                source.url || source.name || "?"
                                            ),
                                        }}>
                                        {source.iconurl ? (
                                            <img
                                                className={classes.avatarImage}
                                                src={source.iconurl}
                                                alt=""
                                            />
                                        ) : (
                                            (source.name || "?")
                                                .trim()
                                                .charAt(0)
                                        )}
                                    </div>
                                    <div className={classes.feedMeta}>
                                        <span
                                            className={classes.feedName}
                                            title={source.name}>
                                            {source.name}
                                        </span>
                                        <span
                                            className={classes.feedUrl}
                                            title={source.url}>
                                            {source.url}
                                        </span>
                                    </div>
                                </div>
                                {row.group ? (
                                    <span
                                        className={classes.groupChip}
                                        title={row.group.name}>
                                        <span
                                            className={classes.groupDot}
                                            style={{
                                                backgroundColor: groupColor(
                                                    row.group.gid
                                                ),
                                            }}
                                        />
                                        {row.group.name}
                                    </span>
                                ) : (
                                    <span
                                        className={mergeClasses(
                                            classes.groupChip,
                                            classes.groupChipEmpty
                                        )}>
                                        {intl.get("subs.ungrouped")}
                                    </span>
                                )}
                                <span
                                    className={mergeClasses(
                                        classes.unread,
                                        unread === 0 && classes.unreadZero
                                    )}>
                                    {unread === 0 ? "—" : unread}
                                </span>
                                <span className={classes.updated}>
                                    {relativeTime(source.lastFetched)}
                                </span>
                                <span
                                    className={mergeClasses(
                                        classes.status,
                                        status === "stale" &&
                                            classes.statusStale,
                                        status === "hidden" &&
                                            classes.statusHidden
                                    )}>
                                    <span
                                        className={mergeClasses(
                                            classes.statusDot,
                                            status === "stale" &&
                                                classes.statusStaleDot,
                                            status === "hidden" &&
                                                classes.statusHiddenDot
                                        )}
                                    />
                                    {statusLabel(status)}
                                </span>
                            </div>
                        )
                    })
                )}
            </div>
            <div className={classes.listFoot}>
                <span>
                    {rows.length} / {counts.all + counts.hidden}
                </span>
                <span>{intl.get("subs.dragHint")}</span>
            </div>
        </>
    )
}

export default SourceTable
