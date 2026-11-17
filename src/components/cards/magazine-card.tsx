import * as React from "react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import TranslateButton from "./translate-button"
import { SourceTextDirection } from "../../scripts/models/source"
import { useCardTranslation } from "../utils/hooks/useCardTranslation"

const className = (props: Card.Props) => {
    let cn = ["card", "magazine-card"]
    if (props.item.hasRead) cn.push("read")
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const MagazineCard: React.FunctionComponent<Card.Props> = props => {
    // The card's 24px padding is empty space, so the button sits in its top
    // right corner without covering either the cover image or the title.
    const { title, snippet, filter } = useCardTranslation(
        props.item,
        props.filter
    )

    return (
        <div
            className={className(props)}
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
