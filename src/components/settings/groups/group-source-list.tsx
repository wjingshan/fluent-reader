import * as React from "react"
import { useMemo, useRef } from "react"
import intl from "react-intl-universal"
import {
    createTableColumn,
    DataGrid,
    DataGridBody,
    DataGridCell,
    DataGridHeader,
    DataGridHeaderCell,
    DataGridRow,
    makeStyles,
} from "@fluentui/react-components"
import { Image16Regular } from "@fluentui/react-icons"
import { RSSSource } from "../../../scripts/models/source"
import { moveItems, useRowReorder } from "../../utils/hooks/useRowReorder"
import { useGroupStyles } from "./styles"

const useStyles = makeStyles({
    iconColumn: { flex: "0 0 32px" },
    nameColumn: { flex: "0 0 180px" },
    icon: { width: "16px", height: "16px" },
})

type GroupSourceListProps = {
    sources: RSSSource[]
    selected: Set<number>
    disabled: boolean
    onSelect: (sids: Set<number>) => void
    onReorder: (sids: number[]) => void
}

export function GroupSourceList({
    sources,
    selected,
    disabled,
    onSelect,
    onReorder,
}: GroupSourceListProps) {
    const classes = useGroupStyles()
    const styles = useStyles()
    const scroller = useRef<HTMLDivElement>(null)
    const selectionAnchor = useRef<number>(null)
    const columns = useMemo(
        () => [
            createTableColumn<RSSSource>({
                columnId: "icon",
                renderHeaderCell: () => (
                    <Image16Regular aria-label={intl.get("icon")} />
                ),
                renderCell: source =>
                    source.iconurl && (
                        <img
                            src={source.iconurl}
                            className={styles.icon}
                            alt=""
                        />
                    ),
            }),
            createTableColumn<RSSSource>({
                columnId: "name",
                renderHeaderCell: () => intl.get("name"),
                renderCell: source => source.name,
            }),
            createTableColumn<RSSSource>({
                columnId: "url",
                renderHeaderCell: () => "URL",
                renderCell: source => source.url,
            }),
        ],
        [styles.icon]
    )
    const columnClass = (id: string | number) =>
        id === "icon"
            ? styles.iconColumn
            : id === "name"
            ? styles.nameColumn
            : undefined

    const reorder = useRowReorder({
        containerRef: scroller,
        itemCount: sources.length,
        disabled,
        onReorder: (from, insertAt) =>
            onReorder(
                moveItems(
                    sources.map(source => source.sid),
                    from,
                    insertAt
                )
            ),
    })
    const selectedIndices = sources.reduce(
        (indices, source, index) =>
            selected.has(source.sid) ? [...indices, index] : indices,
        [] as number[]
    )

    function selectSource(
        event: React.MouseEvent,
        sid: number,
        additive = false
    ) {
        if (disabled) return
        const anchorIndex = sources.findIndex(
            source => source.sid === selectionAnchor.current
        )
        const index = sources.findIndex(source => source.sid === sid)
        let next = new Set<number>()
        if (event.shiftKey && anchorIndex >= 0) {
            if (event.ctrlKey || event.metaKey) next = new Set(selected)
            sources
                .slice(
                    Math.min(anchorIndex, index),
                    Math.max(anchorIndex, index) + 1
                )
                .forEach(source => next.add(source.sid))
        } else {
            if (additive || event.ctrlKey || event.metaKey) {
                next = new Set(selected)
                if (next.has(sid)) next.delete(sid)
                else next.add(sid)
            } else next.add(sid)
            selectionAnchor.current = sid
        }
        onSelect(next)
    }

    return (
        <div className={classes.grid} ref={scroller}>
            <DataGrid
                size="small"
                items={sources}
                columns={columns}
                getRowId={source => source.sid}
                selectionMode="multiselect"
                selectedItems={selected}
                onSelectionChange={(_, data) => {
                    if (!disabled) onSelect(data.selectedItems as Set<number>)
                }}>
                <DataGridHeader>
                    <DataGridRow
                        selectionCell={{
                            checkboxIndicator: {
                                "aria-label": intl.get(
                                    "groups.selectAllSources"
                                ),
                            },
                        }}>
                        {({ columnId, renderHeaderCell }) => (
                            <DataGridHeaderCell
                                className={columnClass(columnId)}>
                                {renderHeaderCell()}
                            </DataGridHeaderCell>
                        )}
                    </DataGridRow>
                </DataGridHeader>
                <DataGridBody<RSSSource>>
                    {({ item }) => {
                        const index = sources.indexOf(item)
                        return (
                            <DataGridRow<RSSSource>
                                key={item.sid}
                                className={classes.draggable}
                                selectionCell={{
                                    checkboxIndicator: {
                                        "aria-label": item.name,
                                    },
                                    onClick: event => {
                                        event.stopPropagation()
                                        selectSource(event, item.sid, true)
                                    },
                                }}
                                onClick={event => selectSource(event, item.sid)}
                                onPointerDown={event => {
                                    if (disabled) return
                                    // dragging a selected row carries the whole
                                    // selection; dragging an unselected one only
                                    // moves itself
                                    reorder.start(
                                        event,
                                        index,
                                        selected.has(item.sid)
                                            ? selectedIndices
                                            : []
                                    )
                                }}>
                                {({ columnId, renderCell }) => (
                                    <DataGridCell
                                        className={columnClass(columnId)}
                                        role={
                                            columnId === "name"
                                                ? "rowheader"
                                                : "gridcell"
                                        }>
                                        {renderCell(item)}
                                    </DataGridCell>
                                )}
                            </DataGridRow>
                        )
                    }}
                </DataGridBody>
            </DataGrid>
        </div>
    )
}
