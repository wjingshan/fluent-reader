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
import { SourceGroup } from "../../../schema-types"
import { SourceState } from "../../../scripts/models/source"
import { moveItems, useRowReorder } from "../../utils/hooks/useRowReorder"
import { useGroupStyles } from "./styles"

const useStyles = makeStyles({
    narrow: { flex: "0 0 80px" },
})

type GroupListProps = {
    groups: SourceGroup[]
    sources: SourceState
    selectedGid: number
    disabled: boolean
    onSelect: (gid: number) => void
    onEdit: (gid: number) => void
    onReorder: (groups: SourceGroup[]) => void
}

export function GroupList({
    groups,
    sources,
    selectedGid,
    disabled,
    onSelect,
    onEdit,
    onReorder,
}: GroupListProps) {
    const classes = useGroupStyles()
    const styles = useStyles()
    const scroller = useRef<HTMLDivElement>(null)
    const name = (group: SourceGroup) =>
        group.isMultiple ? group.name : sources[group.sids[0]]?.name || ""
    const columns = useMemo(
        () => [
            createTableColumn<SourceGroup>({
                columnId: "type",
                renderHeaderCell: () => intl.get("groups.type"),
                renderCell: group =>
                    intl.get(
                        group.isMultiple ? "groups.group" : "groups.source"
                    ),
            }),
            createTableColumn<SourceGroup>({
                columnId: "capacity",
                renderHeaderCell: () => intl.get("groups.capacity"),
                renderCell: group =>
                    group.isMultiple ? group.sids.length : "",
            }),
            createTableColumn<SourceGroup>({
                columnId: "name",
                renderHeaderCell: () => intl.get("name"),
                renderCell: name,
            }),
        ],
        [sources]
    )

    const reorder = useRowReorder({
        containerRef: scroller,
        itemCount: groups.length,
        disabled,
        onReorder: (from, insertAt) => {
            onReorder(moveItems(groups, from, insertAt))
            onSelect(null)
        },
    })

    return (
        <div className={classes.grid} ref={scroller}>
            <DataGrid
                size="small"
                items={groups}
                columns={columns}
                getRowId={group => group.gid}
                selectionMode="single"
                selectedItems={
                    new Set(selectedGid === null ? [] : [selectedGid])
                }
                onSelectionChange={(_, data) => {
                    if (disabled) return
                    const gid = data.selectedItems.values().next().value
                    onSelect(gid === undefined ? null : Number(gid))
                }}>
                <DataGridHeader>
                    <DataGridRow>
                        {({ columnId, renderHeaderCell }) => (
                            <DataGridHeaderCell
                                className={
                                    columnId !== "name"
                                        ? styles.narrow
                                        : undefined
                                }>
                                {renderHeaderCell()}
                            </DataGridHeaderCell>
                        )}
                    </DataGridRow>
                </DataGridHeader>
                <DataGridBody<SourceGroup>>
                    {({ item }) => {
                        const index = groups.indexOf(item)
                        return (
                            <DataGridRow<SourceGroup>
                                key={item.gid}
                                className={classes.draggable}
                                selectionCell={{
                                    radioIndicator: {
                                        "aria-label": name(item),
                                    },
                                }}
                                onPointerDown={event =>
                                    !disabled && reorder.start(event, index)
                                }
                                onDoubleClick={() => {
                                    if (!disabled && item.isMultiple)
                                        onEdit(item.gid)
                                }}
                                onKeyDown={event => {
                                    if (
                                        event.key === "Enter" &&
                                        !disabled &&
                                        item.isMultiple
                                    ) {
                                        event.preventDefault()
                                        onEdit(item.gid)
                                    }
                                }}>
                                {({ columnId, renderCell }) => (
                                    <DataGridCell
                                        className={
                                            columnId !== "name"
                                                ? styles.narrow
                                                : undefined
                                        }
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
