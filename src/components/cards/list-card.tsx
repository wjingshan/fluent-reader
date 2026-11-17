import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"
import { useTranslation } from "../utils/hooks/useTranslation"

const useStyles = makeStyles({
    // Reserve the top right corner for the translate button, so the source
    // name and time in the info row never run underneath it.
    data: { paddingRight: "26px" },
})

const className = (props: Card.Props) => {
    let cn = ["card", "list-card"]
    if (props.item.hidden) cn.push("hidden")
    if (props.selected) cn.push("selected")
    if (props.viewConfigs & ViewConfigs.FadeRead && props.item.hasRead)
        cn.push("read")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const ListCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    const record = useTranslation(props.item)
    const translated = record?.status === "translated" && record.showTranslation
    const title = translated
        ? record.title || props.item.title
        : props.item.title
    const snippet = translated
        ? record.snippet || props.item.snippet
        : props.item.snippet
    // The current search runs over the feed's own language, so highlight spans
    // are skipped while the translation is shown.
    const filter = translated ? { ...props.filter, search: "" } : props.filter

    return (
        <div
            className={className(props)}
            {...Card.bindEventsToProps(props)}
            data-iid={props.item._id}
            data-is-focusable>
            {props.item.thumb && props.viewConfigs & ViewConfigs.ShowCover ? (
                <div className="head">
                    <img src={props.item.thumb} />
                </div>
            ) : null}
            <div className={mergeClasses("data", classes.data)}>
                <CardInfo source={props.source} item={props.item} />
                <h3 className="title">
                    <Highlights text={title} filter={filter} title />
                </h3>
                {Boolean(props.viewConfigs & ViewConfigs.ShowSnippet) && (
                    <p className="snippet">
                        <Highlights text={snippet} filter={filter} />
                    </p>
                )}
            </div>
            <TranslateButton item={props.item} />
        </div>
    )
}

export default ListCard
