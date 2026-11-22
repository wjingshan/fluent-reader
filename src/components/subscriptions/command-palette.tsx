import * as React from "react"
import { useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import { mergeClasses } from "@fluentui/react-components"
import { useManagerStyles } from "./styles"

export interface ManagerCommand {
    id: string
    label: string
    hint?: string
    keys?: string
    run: () => void
}

export interface CommandPaletteProps {
    commands: ManagerCommand[]
    onClose: () => void
}

// Ctrl/Cmd+K palette over the manager. Plain DOM on purpose: it must feel
// instant and must not inherit any focus ring or dropdown behaviour.
const CommandPalette: React.FC<CommandPaletteProps> = props => {
    const classes = useManagerStyles()
    const [query, setQuery] = useState("")
    const [active, setActive] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const needle = query.trim().toLowerCase()
    const items = needle
        ? props.commands.filter(command =>
              `${command.label} ${command.hint || ""}`
                  .toLowerCase()
                  .includes(needle)
          )
        : props.commands

    const clamped = items.length === 0 ? 0 : Math.min(active, items.length - 1)

    // Keep the highlighted row inside the scroll viewport.
    useEffect(() => {
        const node = listRef.current?.children[clamped] as HTMLElement
        node?.scrollIntoView({ block: "nearest" })
    }, [clamped])

    const run = (command?: ManagerCommand) => {
        if (!command) return
        props.onClose()
        command.run()
    }

    return (
        <div
            className={classes.paletteBackdrop}
            onMouseDown={event => {
                if (event.target === event.currentTarget) props.onClose()
            }}>
            <div className={classes.palette}>
                <input
                    ref={inputRef}
                    className={classes.paletteInput}
                    value={query}
                    placeholder={intl.get("subs.commandPlaceholder")}
                    onChange={event => {
                        setQuery(event.target.value)
                        setActive(0)
                    }}
                    onKeyDown={event => {
                        if (event.key === "ArrowDown") {
                            event.preventDefault()
                            event.stopPropagation()
                            setActive(prev =>
                                items.length === 0
                                    ? 0
                                    : (prev + 1) % items.length
                            )
                        } else if (event.key === "ArrowUp") {
                            event.preventDefault()
                            event.stopPropagation()
                            setActive(prev =>
                                items.length === 0
                                    ? 0
                                    : (prev - 1 + items.length) %
                                      items.length
                            )
                        } else if (event.key === "Enter") {
                            event.preventDefault()
                            event.stopPropagation()
                            run(items[clamped])
                        } else if (event.key === "Escape") {
                            event.preventDefault()
                            event.stopPropagation()
                            props.onClose()
                        }
                    }}
                />
                <div className={classes.paletteList} ref={listRef}>
                    {items.length === 0 && (
                        <div className={classes.paletteHint}>
                            {intl.get("subs.commandEmpty")}
                        </div>
                    )}
                    {items.map((command, index) => (
                        <button
                            key={command.id}
                            className={mergeClasses(
                                classes.paletteItem,
                                index === clamped && classes.paletteItemActive
                            )}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => run(command)}>
                            <span>{command.label}</span>
                            {command.hint && (
                                <span className={classes.paletteHint}>
                                    {command.hint}
                                </span>
                            )}
                            {command.keys && (
                                <span className={classes.paletteKey}>
                                    {command.keys}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className={classes.paletteFoot}>
                    {intl.get("subs.cmdHint")}
                </div>
            </div>
        </div>
    )
}

export default CommandPalette
