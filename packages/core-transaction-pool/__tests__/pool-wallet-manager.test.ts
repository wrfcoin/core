import { fixtures, generators } from "@arkecosystem/core-test-utils";

const { generateTransfers, generateWallets } = generators;
const { blocks2to100, delegates } = fixtures;

import { crypto, models } from "@arkecosystem/crypto";
import bip39 from "bip39";

import { setUpFull, tearDown } from "./__support__/setup";

import { PoolWalletManager } from "../src/pool-wallet-manager";

const { Block } = models;

const arktoshi = 10 ** 8;
let container;
let poolWalletManager;
let blockchain;

beforeAll(async () => {
    container = await setUpFull();
    poolWalletManager = new PoolWalletManager();
    blockchain = container.resolvePlugin("blockchain");
});

afterAll(async () => {
    await tearDown();
});

describe("applyPoolTransactionToSender", () => {
    describe("update the balance", () => {
        it("should only update the balance of the sender", async () => {
            const delegate0 = delegates[0];
            const { publicKey } = crypto.getKeys(bip39.generateMnemonic());
            const newAddress = crypto.getAddress(publicKey);

            const delegateWallet = poolWalletManager.findByAddress(delegate0.address);
            const newWallet = poolWalletManager.findByAddress(newAddress);

            expect(+delegateWallet.balance).toBe(+delegate0.balance);
            expect(+newWallet.balance).toBe(0);

            const amount1 = 123 * 10 ** 8;
            const transfer = generateTransfers("testnet", delegate0.secret, newAddress, amount1, 1)[0];

            delegateWallet.applyTransactionToSender(transfer);

            expect(+delegateWallet.balance).toBe(+delegate0.balance - amount1 - 0.1 * 10 ** 8);
            expect(newWallet.balance.isZero()).toBeTrue();
        });

        it("should only update the balance of the sender with dyn fees", async () => {
            const delegate0 = delegates[1];
            const { publicKey } = crypto.getKeys(bip39.generateMnemonic());
            const newAddress = crypto.getAddress(publicKey);

            const delegateWallet = poolWalletManager.findByAddress(delegate0.address);
            const newWallet = poolWalletManager.findByAddress(newAddress);

            expect(+delegateWallet.balance).toBe(+delegate0.balance);
            expect(+newWallet.balance).toBe(0);

            const amount1 = 123 * 10 ** 8;
            const fee = 10;
            const transfer = generateTransfers("testnet", delegate0.secret, newAddress, amount1, 1, false, fee)[0];

            delegateWallet.applyTransactionToSender(transfer);

            expect(+delegateWallet.balance).toBe(+delegate0.balance - amount1 - fee);
            expect(newWallet.balance.isZero()).toBeTrue();
        });

        it("should not apply chained transfers", async () => {
            const delegate = delegates[7];
            const delegateWallet = poolWalletManager.findByPublicKey(delegate.publicKey);

            const wallets = generateWallets("testnet", 4);
            const poolWallets = wallets.map(w => poolWalletManager.findByAddress(w.address));

            expect(+delegateWallet.balance).toBe(+delegate.balance);
            poolWallets.forEach(w => {
                expect(+w.balance).toBe(0);
            });

            const transfers = [
                {
                    // transfer from delegate to wallet 0
                    from: delegate,
                    to: wallets[0],
                    amount: 100 * arktoshi,
                },
                {
                    // transfer from wallet 0 to delegatej
                    from: wallets[0],
                    to: delegate,
                    amount: 55 * arktoshi,
                },
            ];

            transfers.forEach(t => {
                const transfer = generateTransfers("testnet", t.from.passphrase, t.to.address, t.amount, 1)[0];

                // This is normally refused because it's a cold wallet, but since we want
                // to test if chained transfers are refused, pretent it is not a cold wallet.
                container.resolvePlugin("database").walletManager.findByPublicKey(transfer.senderPublicKey);

                const errors = [];
                if (poolWalletManager.canApply(transfer, errors)) {
                    poolWalletManager.findByPublicKey(transfer.senderPublicKey).applyTransactionToSender(transfer);

                    expect(t.from).toBe(delegate);
                } else {
                    expect(t.from).toBe(wallets[0]);
                    expect(JSON.stringify(errors)).toEqual(
                        `["[PoolWalletManager] Can't apply transaction id:${transfer.id} from sender:${
                            t.from.address
                        }","Insufficient balance in the wallet"]`,
                    );
                }

                container.resolvePlugin("database").walletManager.forgetByPublicKey(transfer.publicKey);
            });

            expect(+delegateWallet.balance).toBe(delegate.balance - (100 + 0.1) * arktoshi);
            expect(poolWallets[0].balance.isZero()).toBeTrue();
        });
    });
});

describe("Apply transactions and block rewards to wallets on new block", () => {
    // tslint:disable-next-line:variable-name
    const __resetToHeight1 = async () => blockchain.removeBlocks(blockchain.getLastHeight() - 1);

    beforeEach(__resetToHeight1);
    afterEach(__resetToHeight1);

    it.each([2 * arktoshi, 0])("should apply forged block reward %i to delegate wallet", async reward => {
        const forgingDelegate = delegates[reward ? 2 : 3]; // use different delegate to have clean initial balance
        const generatorPublicKey = forgingDelegate.publicKey;

        const wallet = generateWallets("testnet", 1)[0];
        const transferAmount = 1234;
        const transferDelegate = delegates[4];
        const transfer = generateTransfers(
            "testnet",
            transferDelegate.passphrase,
            wallet.address,
            transferAmount,
            1,
            true,
        )[0];

        const totalFee = 0.1 * arktoshi;
        const blockWithReward = Object.assign({}, blocks2to100[0], {
            reward,
            generatorPublicKey,
            transactions: [transfer],
            numberOfTransactions: 1,
            totalFee,
        });
        const blockWithRewardVerified = new Block(blockWithReward);
        blockWithRewardVerified.verification.verified = true;

        await blockchain.processBlock(blockWithRewardVerified, () => null);

        const delegateWallet = poolWalletManager.findByPublicKey(generatorPublicKey);

        const poolWallet = poolWalletManager.findByAddress(wallet.address);
        expect(+poolWallet.balance).toBe(transferAmount);

        const transferDelegateWallet = poolWalletManager.findByAddress(transferDelegate.address);
        expect(+transferDelegateWallet.balance).toBe(+transferDelegate.balance - transferAmount - totalFee);

        expect(+delegateWallet.balance).toBe(+forgingDelegate.balance + reward + totalFee); // balance increased by reward + fee
    });
});
