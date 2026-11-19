import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { SourceTextDirection } from "../../scripts/models/source"
import { useCardTranslation } from "../utils/hooks/useCardTranslation"

const useStyles = makeStyles({
    // The cover keeps its 200:160 shape (1.25) as its height moves. The static
    // sheet caps the row at 160px, which is exactly the cover height and would
    // clip the text once the type scales up, so the cap is lifted: the row now
    // follows whichever of cover and text is taller, unchanged at the defaults.
    metrics: {
        "maxHeight": "none",
        "fontFamily": "var(--fr-card-font-family, inherit)",
        "& div.head": {
            width: "calc(var(--fr-magazine-cover-height, 160px) * 1.25)",
            height: "var(--fr-magazine-cover-height, 160px)",
        },
        "& div.head img": {
            width: "calc(var(--fr-magazine-cover-height, 160px) * 1.25)",
            height: "var(--fr-magazine-cover-height, 160px)",
        },
        // Magazine type rides 2px above the shared card title size, so the
        // 18px default is preserved while one slider still moves both.
        "& h3.title": {
            fontSize: "calc(var(--fr-card-title-size, 16px) + 2px)",
            lineHeight: "calc(var(--fr-card-title-size, 16px) + 11px)",
        },
        "& p.snippet": {
            fontSize: "var(--fr-card-snippet-size, 14px)",
            lineHeight: "calc(var(--fr-card-snippet-size, 14px) + 7px)",
        },
    },
})

const className = (props: Card.Props) => {
    let cn = ["card", "magazine-card"]
    if (props.item.hasRead) cn.push("read")
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const MagazineCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    // The card's 24px padding is empty space, so the button sits in its top
    // right corner without covering either the cover image or the title.
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
            {props.item.thumb ? (
                <div className="head">
                    <img src={props.item.thumb} />
                </div>
            ) : null}
            <div className="data">
                <div>
                    <h3 className="title">
                        <Highlights text={title} filter={filter} title />
                    </h3>
                    <p className="snippet">
                        <Highlights text={snippet} filter={filter} />
                    </p>
                </div>
                <CardInfo source={props.source} item={props.item} showCreator />
            </div>
            <TranslateButton item={props.item} />
        </div>
    )
}

export default MagazineCard
