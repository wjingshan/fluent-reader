import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { SourceTextDirection } from "../../scripts/models/source"
import { useCardTranslation } from "../utils/hooks/useCardTranslation"

const useStyles = makeStyles({
    // The cover fills the card's top edge, so pinning the button to the card
    // corner would sit on the image. It rides in the meta row instead, which
    // keeps room on its right so the source name and time stay clear, and it
    // never touches the title below.
    layout: {
        "& .meta": {
            position: "relative",
            paddingRight: "28px",
        },
        // Cover cards slide their text up by the cover height on hover; the
        // button has to travel with the row, or it would end up over the
        // snippet that just moved up.
        "&.transform:hover .meta > button": {
            transform: "translateY(-144px)",
            transition: "transform ease-out 0.12s",
        },
    },
})

const className = (props: Card.Props) => {
    let cn = ["card", "default-card"]
    if (props.item.snippet && props.item.thumb) cn.push("transform")
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const DefaultCard: React.FunctionComponent<Card.Props> = props => {
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
            {props.item.thumb ? (
                <img className="bg" src={props.item.thumb} />
            ) : null}
            <div className="bg"></div>
            {props.item.thumb ? (
                <img className="head" src={props.item.thumb} />
            ) : null}
            <div className="meta">
                <CardInfo source={props.source} item={props.item} />
                <TranslateButton item={props.item} />
            </div>
            <h3 className="title">
                <Highlights text={title} filter={filter} title />
            </h3>
            <p className={"snippet" + (props.item.thumb ? "" : " show")}>
                <Highlights text={snippet} filter={filter} />
            </p>
        </div>
    )
}

export default DefaultCard
