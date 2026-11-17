import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Time from "../utils/time"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { SourceTextDirection } from "../../scripts/models/source"
import { useCardTranslation } from "../utils/hooks/useCardTranslation"

const useStyles = makeStyles({
    // The static sheet (.compact-card) pins the row to a single 31px line and
    // keeps .data on one line with nowrap. These rules load after it with the
    // same specificity, so they take over and stack the title above the snippet.
    // Height stays stable: each row is clamped to exactly one line with
    // overflow hidden, and the box keeps a 31px floor.
    layout: {
        "height": "auto",
        "minHeight": "31px",
        "boxSizing": "border-box",
        "padding": "4px 34px 4px 9px",
        "alignItems": "center",
        "lineHeight": "18px",
        "& .data": {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            overflow: "hidden",
            minWidth: 0,
            whiteSpace: "normal",
        },
        "& .data .title": {
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: 0,
            lineHeight: "18px",
        },
        "& .data .snippet": {
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "12px",
            lineHeight: "16px",
        },
        "& .info": {
            lineHeight: "18px",
            alignItems: "center",
        },
    },
})

const className = (props: Card.Props) => {
    let cn = ["card", "compact-card"]
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const CompactCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    const { title, snippet, filter } = useCardTranslation(
        props.item,
        props.filter
    )

    return (
        <div
            className={mergeClasses(className(props), classes.layout)}
            {...Card.bindEventsToProps(props)}
            data-iid={props.item._id}
            data-is-focusable>
            <CardInfo source={props.source} item={props.item} hideTime />
            <div className="data">
                <span className="title">
                    <Highlights text={title} filter={filter} title />
                </span>
                <span className="snippet">
                    <Highlights text={snippet} filter={filter} />
                </span>
            </div>
            <Time date={props.item.date} />
            <TranslateButton item={props.item} />
        </div>
    )
}

export default CompactCard
