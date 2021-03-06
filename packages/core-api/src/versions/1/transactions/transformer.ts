import { app } from "@arkecosystem/core-container";
import { bignumify } from "@arkecosystem/core-utils";
import { crypto, models } from "@arkecosystem/crypto";

export function transformTransactionLegacy(model) {
    const config = app.resolvePlugin("config");
    const blockchain = app.resolvePlugin("blockchain");

    const data: any = new models.Transaction(model.serialized.toString("hex"));

    return {
        id: data.id,
        blockid: model.blockId,
        type: data.type,
        timestamp: data.timestamp,
        amount: +bignumify(data.amount).toFixed(),
        fee: +bignumify(data.fee).toFixed(),
        recipientId: data.recipientId,
        senderId: crypto.getAddress(data.senderPublicKey, config.network.pubKeyHash),
        senderPublicKey: data.senderPublicKey,
        vendorField: data.vendorField,
        signature: data.signature,
        signSignature: data.signSignature,
        signatures: data.signatures,
        asset: data.asset || {},
        confirmations: model.block ? blockchain.getLastBlock().data.height - model.block.height : 0,
    };
}
