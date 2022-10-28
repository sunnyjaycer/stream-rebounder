const high = "100000";
const med = "90000";
const low = "80000";

async function getProperOp(sf, superToken, operation, rate, streamrebounder, sender) {

    if (operation === "create") {
        
        return sf.cfaV1.createFlow({
            superToken: superToken.address,
            receiver: streamrebounder.address,
            flowRate: rate
        })

    } else if ( operation === "update" ) {

        return sf.cfaV1.updateFlow({
            superToken: superToken.address,
            receiver: streamrebounder.address,
            flowRate: rate
        })

    } else if (operation === "delete") {

        return sf.cfaV1.deleteFlow({
            superToken: superToken.address,
            sender: sender.address,
            receiver: streamrebounder.address,
        })

    } else if (operation === "delete_rogue") {

        return sf.cfaV1.deleteFlow({
            superToken: superToken.address,
            sender: streamrebounder.address,
            receiver: sender.address,
        })
    
    }

}

async function getFlowOps(sf, daix, usdcx, streamrebounder, sender) {

    return {

        daix_create_high: await getProperOp(sf, daix, "create", high, streamrebounder, sender),
        daix_create_med: await getProperOp(sf, daix, "create", med, streamrebounder, sender),
        daix_create_low: await getProperOp(sf, daix, "create", low, streamrebounder, sender),

        daix_update_high: await getProperOp(sf, daix, "update", high, streamrebounder, sender),
        daix_update_med: await getProperOp(sf, daix, "update", med, streamrebounder, sender),
        daix_update_low: await getProperOp(sf, daix, "update", low, streamrebounder, sender),

        daix_delete: await getProperOp(sf, daix, "delete", high, streamrebounder, sender),
        daix_delete_rogue: await getProperOp(sf, daix, "delete_rogue", high, streamrebounder, sender),

        usdcx_create_high: await getProperOp(sf, usdcx, "create", high, streamrebounder, sender),
        usdcx_create_med: await getProperOp(sf, usdcx, "create", med, streamrebounder, sender),
        usdcx_create_low: await getProperOp(sf, usdcx, "create", low, streamrebounder, sender),

        usdcx_update_high: await getProperOp(sf, usdcx, "update", high, streamrebounder, sender),
        usdcx_update_med: await getProperOp(sf, usdcx, "update", med, streamrebounder, sender),
        usdcx_update_low: await getProperOp(sf, usdcx, "update", low, streamrebounder, sender),
        
        usdcx_delete: await getProperOp(sf, usdcx, "delete", high, streamrebounder, sender),
        usdcx_delete_rogue: await getProperOp(sf, usdcx, "delete_rogue", high, streamrebounder, sender)

    }
    
}

module.exports.getFlowOps = getFlowOps;