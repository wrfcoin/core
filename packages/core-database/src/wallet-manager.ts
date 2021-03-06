import { app } from "@arkecosystem/core-container";
import { roundCalculator } from "@arkecosystem/core-utils";
import { constants, crypto, formatArktoshi, models } from "@arkecosystem/crypto";
import pluralize from "pluralize";

const { Wallet } = models;
const { TRANSACTION_TYPES } = constants;

export class WalletManager {
    public logger: any;
    public config: any;

    public networkId: number;
    public byAddress: { [key: string]: any };
    public byPublicKey: { [key: string]: any };
    public byUsername: { [key: string]: any };

    /**
     * Create a new wallet manager instance.
     * @constructor
     */
    constructor() {
        this.config = app.resolvePlugin("config");
        this.logger = app.resolvePlugin("logger");

        this.networkId = this.config ? this.config.network.pubKeyHash : 0x17;
        this.reset();
    }

    /**
     * Reset the wallets index.
     * @return {void}
     */
    public reset() {
        this.byAddress = {};
        this.byPublicKey = {};
        this.byUsername = {};
    }

    /**
     * Get all wallets by address.
     * @return {Array}
     */
    public all() {
        return Object.values(this.byAddress);
    }

    /**
     * Get all wallets by publicKey.
     * @return {Array}
     */
    public allByPublicKey() {
        return Object.values(this.byPublicKey);
    }

    /**
     * Get all wallets by username.
     * @return {Array}
     */
    public allByUsername() {
        return Object.values(this.byUsername);
    }

    /**
     * Find a wallet by the given address.
     * @param  {String} address
     * @return {Wallet}
     */
    public findByAddress(address) {
        if (!this.byAddress[address]) {
            this.byAddress[address] = new Wallet(address);
        }

        return this.byAddress[address];
    }

    /**
     * Find a wallet by the given public key.
     * @param  {String} publicKey
     * @return {Wallet}
     */
    public findByPublicKey(publicKey) {
        if (!this.byPublicKey[publicKey]) {
            const address = crypto.getAddress(publicKey, this.networkId);

            const wallet = this.findByAddress(address);
            wallet.publicKey = publicKey;
            this.byPublicKey[publicKey] = wallet;
        }

        return this.byPublicKey[publicKey];
    }

    /**
     * Find a wallet by the given username.
     * @param  {String} username
     * @return {Wallet}
     */
    public findByUsername(username) {
        return this.byUsername[username];
    }

    /**
     * Set wallet by address.
     * @param {String} address
     * @param {Wallet} wallet
     * @param {void}
     */
    public setByAddress(address, wallet) {
        this.byAddress[address] = wallet;
    }

    /**
     * Set wallet by publicKey.
     * @param {String} publicKey
     * @param {Wallet} wallet
     * @param {void}
     */
    public setByPublicKey(publicKey, wallet) {
        this.byPublicKey[publicKey] = wallet;
    }

    /**
     * Set wallet by username.
     * @param {String} username
     * @param {Wallet} wallet
     * @param {void}
     */
    public setByUsername(username, wallet) {
        this.byUsername[username] = wallet;
    }

    /**
     * Remove wallet by address.
     * @param {String} address
     * @param {void}
     */
    public forgetByAddress(address) {
        delete this.byAddress[address];
    }

    /**
     * Remove wallet by publicKey.
     * @param {String} publicKey
     * @param {void}
     */
    public forgetByPublicKey(publicKey) {
        delete this.byPublicKey[publicKey];
    }

    /**
     * Remove wallet by username.
     * @param {String} username
     * @param {void}
     */
    public forgetByUsername(username) {
        delete this.byUsername[username];
    }

    /**
     * Index the given wallets.
     * @param  {Array} wallets
     * @return {void}
     */
    public index(wallets) {
        for (const wallet of wallets) {
            this.reindex(wallet);
        }
    }

    /**
     * Reindex the given wallet.
     * @param  {Wallet} wallet
     * @return {void}
     */
    public reindex(wallet) {
        if (wallet.address) {
            this.byAddress[wallet.address] = wallet;
        }

        if (wallet.publicKey) {
            this.byPublicKey[wallet.publicKey] = wallet;
        }

        if (wallet.username) {
            this.byUsername[wallet.username] = wallet;
        }
    }

    public clear() {
        Object.values(this.byAddress).forEach(wallet => {
            wallet.dirty = false;
        });
    }

    /**
     * Load a list of all active delegates.
     * @param  {Number} maxDelegates
     * @return {Array}
     */
    public loadActiveDelegateList(maxDelegates, height) {
        if (height > 1 && height % maxDelegates !== 1) {
            throw new Error("Trying to build delegates outside of round change");
        }

        const { round } = roundCalculator.calculateRound(height, maxDelegates);
        let delegates = this.allByUsername();

        if (delegates.length < maxDelegates) {
            throw new Error(
                `Expected to find ${maxDelegates} delegates but only found ${
                    delegates.length
                }. This indicates an issue with the genesis block & delegates.`,
            );
        }

        const equalVotesMap = new Map();

        delegates = delegates
            .sort((a, b) => {
                const diff = b.voteBalance.comparedTo(a.voteBalance);

                if (diff === 0) {
                    if (!equalVotesMap.has(a.voteBalance.toFixed())) {
                        equalVotesMap.set(a.voteBalance.toFixed(), new Set());
                    }

                    const set = equalVotesMap.get(a.voteBalance.toFixed());
                    set.add(a);
                    set.add(b);

                    if (a.publicKey === b.publicKey) {
                        throw new Error(
                            `The balance and public key of both delegates are identical! Delegate "${
                                a.username
                            }" appears twice in the list.`,
                        );
                    }

                    return a.publicKey.localeCompare(b.publicKey, "en");
                }

                return diff;
            })
            .map((delegate, i) => {
                const rate = i + 1;
                this.byUsername[delegate.username].rate = rate;
                return { ...{ round }, ...delegate, rate };
            })
            .slice(0, maxDelegates);

        for (const [voteBalance, set] of equalVotesMap.entries()) {
            const values: any[] = Array.from(set.values());
            if (delegates.includes(values[0])) {
                const mapped = values.map(v => `${v.username} (${v.publicKey})`);
                this.logger.warn(
                    `Delegates ${JSON.stringify(mapped, null, 4)} have a matching vote balance of ${formatArktoshi(
                        voteBalance,
                    )}`,
                );
            }
        }

        this.logger.debug(`Loaded ${delegates.length} active ${pluralize("delegate", delegates.length)}`);

        return delegates;
    }

    /**
     * Build vote balances of all delegates.
     * NOTE: Only called during SPV.
     * @return {void}
     */
    public buildVoteBalances() {
        Object.values(this.byPublicKey).forEach(voter => {
            if (voter.vote) {
                const delegate = this.byPublicKey[voter.vote];
                delegate.voteBalance = delegate.voteBalance.plus(voter.balance);
            }
        });
    }

    /**
     * Remove non-delegate wallets that have zero (0) balance from memory.
     * @return {void}
     */
    public purgeEmptyNonDelegates() {
        Object.values(this.byPublicKey).forEach(wallet => {
            if (this.__canBePurged(wallet)) {
                delete this.byPublicKey[wallet.publicKey];
                delete this.byAddress[wallet.address];
            }
        });
    }

    /**
     * Apply the given block to a delegate.
     * @param  {Block} block
     * @return {void}
     */
    public applyBlock(block) {
        const generatorPublicKey = block.data.generatorPublicKey;

        let delegate = this.byPublicKey[block.data.generatorPublicKey];

        if (!delegate) {
            const generator = crypto.getAddress(generatorPublicKey, this.networkId);

            if (block.data.height === 1) {
                delegate = new Wallet(generator);
                delegate.publicKey = generatorPublicKey;

                this.reindex(delegate);
            } else {
                this.logger.debug(`Delegate by address: ${this.byAddress[generator]}`);

                if (this.byAddress[generator]) {
                    this.logger.info("This look like a bug, please report :bug:");
                }

                throw new Error(`Could not find delegate with publicKey ${generatorPublicKey}`);
            }
        }

        const appliedTransactions = [];

        try {
            block.transactions.forEach(transaction => {
                this.applyTransaction(transaction);
                appliedTransactions.push(transaction);
            });

            const applied = delegate.applyBlock(block.data);

            // If the block has been applied to the delegate, the balance is increased
            // by reward + totalFee. In which case the vote balance of the
            // delegate's delegate has to be updated.
            if (applied && delegate.vote) {
                const increase = block.data.reward.plus(block.data.totalFee);
                const votedDelegate = this.byPublicKey[delegate.vote];
                votedDelegate.voteBalance = votedDelegate.voteBalance.plus(increase);
            }
        } catch (error) {
            this.logger.error("Failed to apply all transactions in block - reverting previous transactions");
            // Revert the applied transactions from last to first
            for (let i = appliedTransactions.length - 1; i >= 0; i--) {
                this.revertTransaction(appliedTransactions[i]);
            }

            // TODO: should revert the delegate applyBlock ?
            // TBC: whatever situation `delegate.applyBlock(block.data)` is never applied

            throw error;
        }
    }

    /**
     * Remove the given block from a delegate.
     * @param  {Block} block
     * @return {void}
     */
    public async revertBlock(block) {
        const delegate = this.byPublicKey[block.data.generatorPublicKey];

        if (!delegate) {
            app.forceExit(
                `Failed to lookup generator '${block.data.generatorPublicKey}' of block '${block.data.id}'. :skull:`,
            );
        }

        const revertedTransactions = [];

        try {
            // Revert the transactions from last to first
            for (let i = block.transactions.length - 1; i >= 0; i--) {
                const transaction = block.transactions[i];
                this.revertTransaction(transaction);
                revertedTransactions.push(transaction);
            }

            const reverted = delegate.revertBlock(block.data);

            // If the block has been reverted, the balance is decreased
            // by reward + totalFee. In which case the vote balance of the
            // delegate's delegate has to be updated.
            if (reverted && delegate.vote) {
                const decrease = block.data.reward.plus(block.data.totalFee);
                const votedDelegate = this.byPublicKey[delegate.vote];
                votedDelegate.voteBalance = votedDelegate.voteBalance.minus(decrease);
            }
        } catch (error) {
            this.logger.error(error.stack);

            revertedTransactions.reverse().forEach(transaction => this.applyTransaction(transaction));

            throw error;
        }
    }

    /**
     * Apply the given transaction to a delegate.
     * @param  {Transaction} transaction
     * @return {Transaction}
     */
    public applyTransaction(transaction) {
        const { data } = transaction;
        const { type, asset, recipientId, senderPublicKey } = data;

        const sender = this.findByPublicKey(senderPublicKey);
        const recipient = this.findByAddress(recipientId);
        const errors = [];

        // specific verifications / adjustments depending on transaction type
        if (
            type === TRANSACTION_TYPES.DELEGATE_REGISTRATION &&
            this.byUsername[asset.delegate.username.toLowerCase()]
        ) {
            this.logger.error(
                `Can't apply transaction ${
                    data.id
                }: delegate name '${asset.delegate.username.toLowerCase()}' already taken.`,
            );
            throw new Error(`Can't apply transaction ${data.id}: delegate name already taken.`);

            // NOTE: We use the vote public key, because vote transactions
            // have the same sender and recipient
        } else if (type === TRANSACTION_TYPES.VOTE && !this.__isDelegate(asset.votes[0].slice(1))) {
            this.logger.error(`Can't apply vote transaction ${data.id}: delegate ${asset.votes[0]} does not exist.`);
            throw new Error(`Can't apply transaction ${data.id}: delegate ${asset.votes[0]} does not exist.`);
        } else if (type === TRANSACTION_TYPES.SECOND_SIGNATURE) {
            data.recipientId = "";
        }

        // handle exceptions / verify that we can apply the transaction to the sender
        if (this.__isException(data)) {
            this.logger.warn(`Transaction ${data.id} forcibly applied because it has been added as an exception.`);
        } else if (!sender.canApply(data, errors)) {
            this.logger.error(
                `Can't apply transaction id:${data.id} from sender:${sender.address} due to ${JSON.stringify(errors)}`,
            );
            this.logger.debug(`Audit: ${JSON.stringify(sender.auditApply(data), null, 2)}`);
            throw new Error(`Can't apply transaction ${data.id}`);
        }

        sender.applyTransactionToSender(data);

        if (type === TRANSACTION_TYPES.DELEGATE_REGISTRATION) {
            this.reindex(sender);
        }

        if (recipient && type === TRANSACTION_TYPES.TRANSFER) {
            recipient.applyTransactionToRecipient(data);
        }

        this._updateVoteBalances(sender, recipient, data);

        return transaction;
    }

    /**
     * Updates the vote balances of the respective delegates of sender and recipient.
     * If the transaction is not a vote...
     *    1. fee + amount is removed from the sender's delegate vote balance
     *    2. amount is added to the recipient's delegate vote balance
     *
     * in case of a vote...
     *    1. the full sender balance is added to the sender's delegate vote balance
     *
     * If revert is set to true, the operations are reversed (plus -> minus, minus -> plus).
     * @param  {Wallet} sender
     * @param  {Wallet} recipient
     * @param  {Transaction} transaction
     * @param  {Boolean} revert
     * @return {Transaction}
     */
    public _updateVoteBalances(sender, recipient, transaction, revert = false) {
        // TODO: multipayment?
        if (transaction.type !== TRANSACTION_TYPES.VOTE) {
            // Update vote balance of the sender's delegate
            if (sender.vote) {
                const delegate = this.findByPublicKey(sender.vote);
                const total = transaction.amount.plus(transaction.fee);
                delegate.voteBalance = revert ? delegate.voteBalance.plus(total) : delegate.voteBalance.minus(total);
            }

            // Update vote balance of recipient's delegate
            if (recipient && recipient.vote) {
                const delegate = this.findByPublicKey(recipient.vote);
                delegate.voteBalance = revert
                    ? delegate.voteBalance.minus(transaction.amount)
                    : delegate.voteBalance.plus(transaction.amount);
            }
        } else {
            const vote = transaction.asset.votes[0];
            const delegate = this.findByPublicKey(vote.substr(1));

            if (vote.startsWith("+")) {
                delegate.voteBalance = revert
                    ? delegate.voteBalance.minus(sender.balance)
                    : delegate.voteBalance.plus(sender.balance);
            } else {
                delegate.voteBalance = revert
                    ? delegate.voteBalance.plus(sender.balance.plus(transaction.fee))
                    : delegate.voteBalance.minus(sender.balance.plus(transaction.fee));
            }
        }
    }

    /**
     * Remove the given transaction from a delegate.
     * @param  {Transaction} transaction
     * @return {Transaction}
     */
    public revertTransaction(transaction) {
        const { type, data } = transaction;
        const sender = this.findByPublicKey(data.senderPublicKey); // Should exist
        const recipient = this.byAddress[data.recipientId];

        sender.revertTransactionForSender(data);

        // removing the wallet from the delegates index
        if (type === TRANSACTION_TYPES.DELEGATE_REGISTRATION) {
            delete this.byUsername[data.asset.delegate.username];
        }

        if (recipient && type === TRANSACTION_TYPES.TRANSFER) {
            recipient.revertTransactionForRecipient(data);
        }

        // Revert vote balance updates
        this._updateVoteBalances(sender, recipient, data, true);

        return data;
    }

    /**
     * Checks if a given publicKey is a registered delegate
     * @param {String} publicKey
     */
    public __isDelegate(publicKey) {
        const delegateWallet = this.byPublicKey[publicKey];

        if (delegateWallet && delegateWallet.username) {
            return !!this.byUsername[delegateWallet.username];
        }

        return false;
    }

    /**
     * Determine if the wallet can be removed from memory.
     * @param  {Object} wallet
     * @return {Boolean}
     */
    public __canBePurged(wallet) {
        return wallet.balance.isZero() && !wallet.secondPublicKey && !wallet.multisignature && !wallet.username;
    }

    /**
     * Determine if the given transaction is an exception.
     * @param  {Object} transaction
     * @return {Boolean}
     */
    public __isException(transaction) {
        if (!this.config) {
            return false;
        }

        if (!Array.isArray(this.config.network.exceptions.transactions)) {
            return false;
        }

        return this.config.network.exceptions.transactions.includes(transaction.id);
    }
}
