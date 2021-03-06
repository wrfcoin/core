#!/usr/bin/env node

import app from "commander";

import { DelegateRegistration } from "./commands/delegate-registration";
import { MultiSignature } from "./commands/multi-signature";
import { SecondSignature } from "./commands/second-signature";
import { Transfer } from "./commands/transfer";
import { Vote } from "./commands/vote";

// app.version(require("../package.json").version);

const registerCommand = (name, description) => {
    return app
        .command(name)
        .description(description)
        .option("-n, --number <number>", "number of wallets", 10)
        .option("-a, --amount <number>", "initial wallet token amount", 2)
        .option("--transfer-fee <number>", "transfer fee", 0.1)
        .option("--base-url <value>", "base api url")
        .option("--api-port <number>", "base api port", 4003)
        .option("--p2p-port <number>", "base p2p port", 4002)
        .option("-p, --passphrase <value>", "passphrase of initial wallet")
        .option("-s, --second-passphrase <value>", "second passphrase of initial wallet")
        .option("--skip-validation", "skip transaction validations", false)
        .option("-c, --copy", "copy the transactions to the clipboard", false);
};

registerCommand("transfer", "send multiple transactions")
    .option("--flood-attempts <value>", "flood node with same transactions", 0)
    .option("--recipient <value>", "recipient address")
    .option("--skip-second-run", "skip second sending of transactions", false)
    .option("--smart-bridge <value>", "smart-bridge value to use")
    .action(async options => {
        const command = await Transfer.init(options);
        await command.run();
    });

registerCommand("second-signature", "create wallets with second signature")
    .option("--signature-fee <number>", "second signature fee", 5)
    .action(async options => {
        const command = await SecondSignature.init(options);
        await command.run();
    });

registerCommand("delegate-registration", "create multiple delegates")
    .option("--delegate-fee <number>", "delegate registration fee", 25)
    .action(async options => {
        const command = await DelegateRegistration.init(options);
        await command.run();
    });

registerCommand("vote", "create multiple votes for a delegate")
    .option("--vote-fee <number>", "vote fee", 1)
    .option("-d, --delegate <delegate>", "delegate public key")
    .action(async options => {
        const command = await Vote.init(options);
        await command.run();
    });

registerCommand("multi-signature", "create multiple multisig wallets")
    .option("--multisig-fee <number>", "multisig fee", 5)
    .option("-m, --min <number>", "minimum number of signatures per transaction", 2)
    .option("-l, --lifetime <number>", "lifetime of transaction", 72)
    .option("-q, --quantity <number>", "number of signatures per wallet", 3)
    .option("--skip-tests", "skip transaction tests", false)
    .action(async options => {
        const command = await MultiSignature.init(options);
        await command.run();
    });

app.command("*").action(env => {
    app.help();
});

app.parse(process.argv);

if (app.args.length === 0) {
    app.help();
}
