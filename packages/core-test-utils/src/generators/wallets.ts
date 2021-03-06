import { client, crypto } from "@arkecosystem/crypto";
import bip39 from "bip39";

export const generateWallets = (network, quantity = 10) => {
    network = network || "testnet";
    if (!["testnet", "mainnet", "devnet"].includes(network)) {
        throw new Error("Invalid network");
    }

    client.getConfigManager().setFromPreset("ark", network);

    const wallets = [];
    for (let i = 0; i < quantity; i++) {
        const passphrase = bip39.generateMnemonic();
        const publicKey = crypto.getKeys(passphrase).publicKey;
        const address = crypto.getAddress(publicKey);

        wallets.push({ address, passphrase, publicKey });
    }

    return wallets;
};
