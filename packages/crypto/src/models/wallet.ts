import { TRANSACTION_TYPES } from "../constants";
import { crypto } from "../crypto/crypto";
import { transactionHandler } from "../handlers/transactions";
import { configManager } from "../managers/config";
import { Bignum, formatArktoshi } from "../utils";

/**
 * TODO copy some parts to ArkDocs
 * @classdesc This class holds the wallet data, verifies it and applies the
 * transaction and blocks to it
 *
 * Wallet attributes that are stored on the db:
 *   - address
 *   - publicKey
 *   - secondPublicKey
 *   - balance
 *   - vote
 *   - username (name, if the wallet is a delegate)
 *   - voteBalance (number of votes if the wallet is a delegate)
 *   - producedBlocks
 *   - missedBlocks
 *
 * This other attributes are not stored on the db:
 *   - multisignature
 *   - lastBlock (last block applied or `null``)
 *   - dirty
 */
export class Wallet {
    public address: any;
    public publicKey: any;
    public secondPublicKey: any;
    public balance: any;
    public vote: any;
    public voted: boolean;
    public username: any;
    public lastBlock: any;
    public voteBalance: any;
    public multisignature: any;
    public dirty: boolean;
    public producedBlocks: number;
    public missedBlocks: number;
    public forgedFees: any;
    public forgedRewards: any;

    /**
     * @constructor
     * @param  {String} address
     */
    constructor(address) {
        this.address = address;
        this.publicKey = null;
        this.secondPublicKey = null;
        this.balance = Bignum.ZERO;
        this.vote = null;
        this.voted = false;
        this.username = null;
        this.lastBlock = null;
        this.voteBalance = Bignum.ZERO;
        this.multisignature = null;
        this.dirty = true;
        this.producedBlocks = 0;
        this.missedBlocks = 0;
        this.forgedFees = Bignum.ZERO;
        this.forgedRewards = Bignum.ZERO;
    }

    /**
     * Check if can apply a transaction to the wallet.
     * @param  {Transaction} transaction
     * @param {Array} errors
     * @return {Boolean}
     */
    public canApply(transaction, errors) {
        return transactionHandler.canApply(this, transaction, errors);
    }

    /**
     * Apply the specified transaction to this wallet.
     * @param  {Transaction} transaction
     * @return {Boolean}
     */
    public apply(transaction) {
        return transactionHandler.apply(this, transaction);
    }

    /**
     * Revert the specified transaction from this wallet.
     * @param  {Transaction} transaction
     * @return {Boolean}
     */
    public revert(transaction) {
        return transactionHandler.revert(this, transaction);
    }

    /**
     * Associate this wallet as the sender of a transaction.
     * @param {Transaction} transaction
     */
    public applyTransactionToSender(transaction) {
        return transactionHandler.applyTransactionToSender(this, transaction);
    }

    /**
     * Remove this wallet as the sender of a transaction.
     * @param {Transaction} transaction
     */
    public revertTransactionForSender(transaction) {
        return transactionHandler.revertTransactionForSender(this, transaction);
    }

    /**
     * Add transaction balance to this wallet.
     * @param {Transaction} transaction
     */
    public applyTransactionToRecipient(transaction) {
        return transactionHandler.applyTransactionToRecipient(this, transaction);
    }

    /**
     * Remove transaction balance from this wallet.
     * @param {Transaction} transaction
     */
    public revertTransactionForRecipient(transaction) {
        return transactionHandler.revertTransactionForRecipient(this, transaction);
    }

    /**
     * Add block data to this wallet.
     * @param {Block} block
     * @returns {Boolean}
     */
    public applyBlock(block) {
        this.dirty = true;

        if (
            block.generatorPublicKey === this.publicKey ||
            crypto.getAddress(block.generatorPublicKey) === this.address
        ) {
            this.balance = this.balance.plus(block.reward).plus(block.totalFee);

            // update stats
            this.producedBlocks++;
            this.forgedFees = this.forgedFees.plus(block.totalFee);
            this.forgedRewards = this.forgedRewards.plus(block.reward);
            this.lastBlock = block;
            return true;
        }

        return false;
    }

    /**
     * Remove block data from this wallet.
     * @param {Block} block
     */
    public revertBlock(block) {
        this.dirty = true;

        if (
            block.generatorPublicKey === this.publicKey ||
            crypto.getAddress(block.generatorPublicKey) === this.address
        ) {
            this.balance = this.balance.minus(block.reward).minus(block.totalFee);

            // update stats
            this.forgedFees = this.forgedFees.minus(block.totalFee);
            this.forgedRewards = this.forgedRewards.minus(block.reward);
            this.lastBlock = block;
            this.producedBlocks--;

            // TODO: get it back from database?
            this.lastBlock = null;
            return true;
        }

        return false;
    }

    /**
     * Verify the wallet.
     * @param  {Transaction} transaction
     * @param  {String}      signature
     * @param  {String}      publicKey
     * @return {Boolean}
     */
    public verify(transaction, signature, publicKey) {
        const hash = crypto.getHash(transaction, true, true);
        return crypto.verifyHash(hash, signature, publicKey);
    }

    /**
     * Verify multi-signatures for the wallet.
     * @param  {Transaction}    transaction
     * @param  {MultiSignature} multisignature
     * @return {Boolean}
     */
    public verifySignatures(transaction, multisignature) {
        if (!transaction.signatures || transaction.signatures.length < multisignature.min) {
            return false;
        }

        const keysgroup = multisignature.keysgroup.map(publicKey =>
            publicKey.startsWith("+") ? publicKey.slice(1) : publicKey,
        );
        const signatures = Object.values(transaction.signatures);

        let valid = 0;
        for (const publicKey of keysgroup) {
            const signature = this.__verifyTransactionSignatures(transaction, signatures, publicKey);
            if (signature) {
                signatures.splice(signatures.indexOf(signature), 1);
                valid++;
                if (valid === multisignature.min) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Audit the specified transaction.
     * @param  {Transaction} transaction
     * @return {[type]}
     */
    public auditApply(transaction) {
        const audit = [];

        if (this.multisignature) {
            audit.push({
                Mutisignature: this.verifySignatures(transaction, this.multisignature),
            });
        } else {
            audit.push({
                "Remaining amount": +this.balance
                    .minus(transaction.amount)
                    .minus(transaction.fee)
                    .toFixed(),
            });
            audit.push({ "Signature validation": crypto.verify(transaction) });
            // TODO: this can blow up if 2nd phrase and other transactions are in the wrong order
            if (this.secondPublicKey) {
                audit.push({
                    "Second Signature Verification": crypto.verifySecondSignature(transaction, this.secondPublicKey),
                });
            }
        }

        if (transaction.type === TRANSACTION_TYPES.TRANSFER) {
            audit.push({ Transfer: true });
        }

        if (transaction.type === TRANSACTION_TYPES.SECOND_SIGNATURE) {
            audit.push({ "Second public key": this.secondPublicKey });
        }

        if (transaction.type === TRANSACTION_TYPES.DELEGATE_REGISTRATION) {
            const username = transaction.asset.delegate.username;
            audit.push({ "Current username": this.username });
            audit.push({ "New username": username });
        }

        if (transaction.type === TRANSACTION_TYPES.VOTE) {
            audit.push({ "Current vote": this.vote });
            audit.push({ "New vote": transaction.asset.votes[0] });
        }

        if (transaction.type === TRANSACTION_TYPES.MULTI_SIGNATURE) {
            const keysgroup = transaction.asset.multisignature.keysgroup;
            audit.push({ "Multisignature not yet registered": !this.multisignature });
            audit.push({
                "Multisignature enough keys": keysgroup.length >= transaction.asset.multisignature.min,
            });
            audit.push({
                "Multisignature all keys signed": keysgroup.length === transaction.signatures.length,
            });
            audit.push({
                "Multisignature verification": this.verifySignatures(transaction, transaction.asset.multisignature),
            });
        }

        if (transaction.type === TRANSACTION_TYPES.IPFS) {
            audit.push({ IPFS: true });
        }

        if (transaction.type === TRANSACTION_TYPES.TIMELOCK_TRANSFER) {
            audit.push({ Timelock: true });
        }

        if (transaction.type === TRANSACTION_TYPES.MULTI_PAYMENT) {
            const amount = transaction.asset.payments.reduce((a, p) => a.plus(p.amount), Bignum.ZERO);
            audit.push({ "Multipayment remaining amount": amount });
        }

        if (transaction.type === TRANSACTION_TYPES.DELEGATE_RESIGNATION) {
            audit.push({ "Resignate Delegate": this.username });
        }

        if (transaction.type === TRANSACTION_TYPES.DELEGATE_RESIGNATION) {
            audit.push({ "Resignate Delegate": this.username });
        }

        if (!Object.values(TRANSACTION_TYPES).includes(transaction.type)) {
            audit.push({ "Unknown Type": true });
        }

        return audit;
    }

    /**
     * Get formatted wallet address and balance as string.
     * @return {String}
     */
    public toString() {
        return `${this.address} (${formatArktoshi(this.balance)})`;
    }

    /**
     * Goes through signatures to check if public key matches. Can also remove valid signatures.
     * @param  {Transaction} transaction
     * @param  {String[]} signatures
     * @param  {String} publicKey
     * @return {Boolean}
     */
    public __verifyTransactionSignatures(transaction, signatures, publicKey) {
        for (const signature of signatures) {
            if (this.verify(transaction, signature, publicKey)) {
                return signature;
            }
        }

        return false;
    }
}
