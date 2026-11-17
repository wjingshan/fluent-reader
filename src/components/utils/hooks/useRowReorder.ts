import * as React from "react"
import { useCallback, useEffect, useRef } from "react"

export type DropSide = "before" | "after"

export type RowReorderState = {
    /* call from the row's onPointerDown; `extra` lets a multi-select drag carry
       every selected row along */
    start: (event: React.PointerEvent, index: number, extra?: number[]) => void
}

type UseRowReorderOptions = {
    containerRef: React.RefObject<HTMLElement>
    itemCount: number
    disabled?: boolean
    onReorder: (from: number[], insertAt: number) => void
}

/* Reorder with pointer events rather than HTML5 drag-and-drop: the drag can
   start anywhere on the row (including the selection control), it never depends
   on a drop being accepted, it scrolls the list when the pointer reaches an
   edge, and it draws a line where the row will land.

   The feedback is written straight onto the row elements instead of through
   React state: the DataGrid hands its rows fixed props, so a re-render of the
   list does not reach them, and a state-driven indicator would never appear
   while the pointer moves. */

const DRAG_THRESHOLD = 4
const EDGE_SIZE = 28
const SCROLL_STEP = 12
const DRAGGED_OPACITY = "0.45"
const DROP_COLOR = "var(--colorBrandStroke1, #0f6cbd)"

const dropLine = (side: DropSide) =>
    `inset 0 ${side === "before" ? "2px" : "-2px"} 0 0 ${DROP_COLOR}`

function rowElements(container: HTMLElement): HTMLElement[] {
    if (!container) return []
    return Array.from(
        container.querySelectorAll<HTMLElement>('[role="row"]')
    ).filter(row => !row.querySelector('[role="columnheader"]'))
}

/* Move `from` to `insertAt`, where insertAt counts the array without the moving
   items - the way a drop between two rows reads on screen. */
export function moveItems<T>(
    items: T[],
    from: number[],
    insertAt: number
): T[] {
    const moving = items.filter((_, index) => from.includes(index))
    const rest = items.filter((_, index) => !from.includes(index))
    rest.splice(Math.max(0, Math.min(insertAt, rest.length)), 0, ...moving)
    return rest
}

type Session = {
    rows: number[]
    startX: number
    startY: number
    lastX: number
    lastY: number
    active: boolean
}

type Target = { from: number[]; hover: number; side: DropSide }

type Paint = { line: HTMLElement; dragged: HTMLElement[] }

export const useRowReorder = ({
    containerRef,
    itemCount,
    disabled,
    onReorder,
}: UseRowReorderOptions): RowReorderState => {
    const session = useRef<Session>(null)
    const frame = useRef<number>(null)
    const target = useRef<Target>(null)
    const paint = useRef<Paint>({ line: null, dragged: [] })
    const countRef = useRef(itemCount)
    const reorderRef = useRef(onReorder)
    const disabledRef = useRef(disabled)

    countRef.current = itemCount
    reorderRef.current = onReorder
    disabledRef.current = disabled

    const unpaint = useCallback(() => {
        paint.current.dragged.forEach(row => {
            row.style.removeProperty("opacity")
            row.style.removeProperty("cursor")
        })
        if (paint.current.line)
            paint.current.line.style.removeProperty("box-shadow")
        paint.current = { line: null, dragged: [] }
    }, [])

    const apply = useCallback(
        (next: Target) => {
            target.current = next
            unpaint()
            const rows = rowElements(containerRef.current)
            if (!next) return
            const dragged = next.from
                .map(index => rows[index])
                .filter(row => Boolean(row))
            dragged.forEach(row => {
                row.style.opacity = DRAGGED_OPACITY
                row.style.cursor = "grabbing"
            })
            const line = rows[next.hover]
            if (line) line.style.boxShadow = dropLine(next.side)
            paint.current = { line: line || null, dragged }
        },
        [containerRef, unpaint]
    )

    const locate = useCallback(
        (y: number): { index: number; side: DropSide } => {
            const container = containerRef.current
            const rows = rowElements(container)
            if (!container || rows.length === 0) return null
            const box = container.getBoundingClientRect()
            if (y < box.top + EDGE_SIZE) container.scrollTop -= SCROLL_STEP
            else if (y > box.bottom - EDGE_SIZE)
                container.scrollTop += SCROLL_STEP
            for (let index = 0; index < rows.length; index += 1) {
                const rect = rows[index].getBoundingClientRect()
                if (y >= rect.top && y <= rect.bottom) {
                    return {
                        index,
                        side:
                            y < rect.top + rect.height / 2 ? "before" : "after",
                    }
                }
            }
            // a gap between rows: fall back to the closest row centre
            let closest = 0
            let distance = Infinity
            rows.forEach((row, index) => {
                const rect = row.getBoundingClientRect()
                const offset = Math.abs(y - (rect.top + rect.height / 2))
                if (offset < distance) {
                    distance = offset
                    closest = index
                }
            })
            const rect = rows[closest].getBoundingClientRect()
            return {
                index: closest,
                side: y < rect.top + rect.height / 2 ? "before" : "after",
            }
        },
        [containerRef]
    )

    const track = useCallback(
        (y: number) => {
            const current = session.current
            if (!current || !current.active) return
            const spot = locate(y)
            if (!spot || current.rows.includes(spot.index)) return
            const previous = target.current
            if (
                previous &&
                previous.hover === spot.index &&
                previous.side === spot.side
            )
                return
            apply({ from: current.rows, hover: spot.index, side: spot.side })
        },
        [apply, locate]
    )

    const tick = useCallback(() => {
        const current = session.current
        if (!current || !current.active) return
        track(current.lastY)
        frame.current = requestAnimationFrame(tick)
    }, [track])

    function moveHandler(event: PointerEvent) {
        const current = session.current
        if (!current) return
        current.lastX = event.clientX
        current.lastY = event.clientY
        if (current.active) {
            track(event.clientY)
            return
        }
        const dx = Math.abs(event.clientX - current.startX)
        const dy = Math.abs(event.clientY - current.startY)
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return
        current.active = true
        document.body.style.userSelect = "none"
        track(event.clientY)
        frame.current = requestAnimationFrame(tick)
    }

    const finish = useCallback(() => {
        const current = session.current
        session.current = null
        window.removeEventListener("pointermove", moveHandler)
        window.removeEventListener("pointerup", endHandler)
        window.removeEventListener("pointercancel", endHandler)
        window.removeEventListener("blur", endHandler)
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current)
            frame.current = null
        }
        document.body.style.removeProperty("user-select")
        const settled = target.current
        apply(null)
        if (!current || !current.active || !settled) return
        // released well outside the list: treat it as dropping the drag, so an
        // accidental gesture cannot reorder anything
        const container = containerRef.current
        if (container) {
            const box = container.getBoundingClientRect()
            if (
                current.lastY < box.top - EDGE_SIZE ||
                current.lastY > box.bottom + EDGE_SIZE
            )
                return
        }
        // the drag must not also register as a click on the row it began on
        const swallow = (event: Event) => {
            event.preventDefault()
            event.stopPropagation()
        }
        window.addEventListener("click", swallow, true)
        setTimeout(() => window.removeEventListener("click", swallow, true), 0)
        const rest = countRef.current - settled.from.length
        const passed = settled.from.filter(
            index => index < settled.hover
        ).length
        const at =
            settled.side === "before"
                ? settled.hover - passed
                : settled.hover - passed + 1
        reorderRef.current(settled.from, Math.max(0, Math.min(at, rest)))
    }, [apply, containerRef])

    const finishRef = useRef(finish)
    finishRef.current = finish

    function endHandler() {
        finishRef.current()
    }

    const start = useCallback(
        (event: React.PointerEvent, index: number, extra: number[] = []) => {
            if (disabledRef.current || event.button !== 0) return
            if (session.current) finishRef.current()
            const rows = Array.from(new Set([index, ...extra])).sort(
                (a, b) => a - b
            )
            session.current = {
                rows,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                active: false,
            }
            // keep receiving pointer events even when the pointer leaves the
            // row or the window, so the drag always ends
            try {
                event.currentTarget.setPointerCapture(event.pointerId)
            } catch (error) {
                // the pointer is already gone; the window listeners still work
            }
            window.addEventListener("pointermove", moveHandler)
            window.addEventListener("pointerup", endHandler)
            window.addEventListener("pointercancel", endHandler)
            window.addEventListener("blur", endHandler)
        },
        []
    )

    useEffect(
        () => () => {
            window.removeEventListener("pointermove", moveHandler)
            window.removeEventListener("pointerup", endHandler)
            window.removeEventListener("pointercancel", endHandler)
            window.removeEventListener("blur", endHandler)
            if (frame.current !== null) cancelAnimationFrame(frame.current)
            document.body.style.removeProperty("user-select")
            unpaint()
        },
        [unpaint]
    )

    return { start }
}
