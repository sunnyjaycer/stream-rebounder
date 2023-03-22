const { assert } = require("chai");

async function flowIntoIntermediateEqualsFlowOut(sf, superToken, sendingAccount, intermediate, receivingAccount) {

    // Get flow from "sendingAccount" to "intermediate"
    let flowInInfo = await sf.cfaV1.getFlow({
        superToken:         superToken.address,
        sender:             sendingAccount.address,
        receiver:           intermediate.address,
        providerOrSigner:   sendingAccount}
    )
    // console.log("Flow In", flowInInfo.flowRate);
    
    // Get flow from "intermediate" to "receivingAccount", assert they're equal 
    let flowOutInfo = await sf.cfaV1.getFlow({
        superToken:         superToken.address,
        sender:             intermediate.address,
        receiver:           receivingAccount.address,
        providerOrSigner:   sendingAccount
    }) 
    // console.log("Flow Out", flowOutInfo.flowRate);

    assert(
        flowInInfo.flowRate == flowOutInfo.flowRate,
        `inbound ${superToken.address} stream to intermediate ${intermediate.address} is not equal on both sides\n
         inflow:  ${flowInInfo.flowRate}\n
         outflow: ${flowOutInfo.flowRate}`
    );

}

module.exports.flowIntoIntermediateEqualsFlowOut = flowIntoIntermediateEqualsFlowOut;