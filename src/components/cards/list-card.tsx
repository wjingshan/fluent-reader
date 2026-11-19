import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"
import { useCardTranslation } from "../utils/hooks/useCardTranslation"

const useStyles = makeStyles({
    // Reserve the top right corner for the translate button, so the source
    // name and time in the info row never run underneath it.
    data: { paddingRight: "26px" },
    // The cover stays square, so only one number drives it. Type sizes keep
    // their original leading (+4px for the title, +4px for the snippet).
    metrics: {
        "fontFamily": "var(--fr-card-font-family, inherit)",
        "& div.head": {
            width: "var(--fr-list-cover-height, 80px)",
            height: "var(--fr-list-cover-height, 80px)",
        },
        "& div.head img": {
            width: "var(--fr-list-cover-height, 80px)",
            height: "var(--fr-list-cover-height, 80px)",
        },
        "& h3.title": {
            fontSize: "var(--fr-list-title-size, 14px)",
            lineHeight: "calc(var(--fr-list-title-size, 14px) + 4px)",
        },
        "& p.snippet": {
            fontSize: "calc(var(--fr-card-snippet-size, 14px) - 2px)",
            lineHeight: "calc(var(--fr-card-snippet-size, 14px) + 2px)",
        },
    },
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
    const { title, snippet, filter } = useCardTranslation(
        props.item,
        props.filter
    )

    return (
        <div
            className={mergeClasses(className(props), classes.metrics)}
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
