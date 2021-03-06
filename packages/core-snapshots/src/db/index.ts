import { app } from "@arkecosystem/core-container";
import { migrations, plugin } from "@arkecosystem/core-database-postgres";
import promise from "bluebird";

import { queries } from "./queries";
import { rawQuery } from "./utils";
import { columns } from "./utils/column-set";

const logger = app.resolvePlugin("logger");

class Database {
    public db: any;
    public pgp: any;
    public isSharedConnection: boolean;
    public blocksColumnSet: any;
    public transactionsColumnSet: any;

    public async make(connection) {
        if (connection) {
            this.db = connection.db;
            this.pgp = connection.pgp;
            this.__createColumnSets();
            this.isSharedConnection = true;
            logger.info("Snapshots: reusing core-database-postgres connection from running core");
            return this;
        }

        try {
            const pgp = require("pg-promise")({ promiseLib: promise });
            this.pgp = pgp;

            const options: any = plugin.defaults.connection;
            options.idleTimeoutMillis = 100;

            this.db = pgp(options);
            this.__createColumnSets();
            await this.__runMigrations();
            logger.info("Snapshots: Database connected");
            this.isSharedConnection = false;
            return this;
        } catch (error) {
            app.forceExit("Error while connecting to postgres", error);
            return null;
        }
    }

    public async getLastBlock() {
        return this.db.oneOrNone(queries.blocks.latest);
    }

    public async getBlockByHeight(height) {
        return this.db.oneOrNone(queries.blocks.findByHeight, { height });
    }

    public async truncateChain() {
        const tables = ["wallets", "rounds", "transactions", "blocks"];
        logger.info("Truncating tables: wallets, rounds, transactions, blocks");
        try {
            for (const table of tables) {
                await this.db.none(queries.truncate(table));
            }

            return this.getLastBlock();
        } catch (error) {
            app.forceExit("Truncate chain error", error);
        }
    }

    public async rollbackChain(height) {
        const config = app.resolvePlugin("config");
        const maxDelegates = config.getConstants(height).activeDelegates;
        const currentRound = Math.floor(height / maxDelegates);
        const lastBlockHeight = currentRound * maxDelegates;
        const lastRemainingBlock = await this.getBlockByHeight(lastBlockHeight);

        try {
            if (lastRemainingBlock) {
                await Promise.all([
                    this.db.none(queries.truncate("wallets")),
                    this.db.none(queries.transactions.deleteFromTimestamp, {
                        timestamp: lastRemainingBlock.timestamp,
                    }),
                    this.db.none(queries.blocks.deleteFromHeight, {
                        height: lastRemainingBlock.height,
                    }),
                    this.db.none(queries.rounds.deleteFromRound, { round: currentRound }),
                ]);
            }
        } catch (error) {
            logger.error(error);
        }

        return this.getLastBlock();
    }

    public async getExportQueries(startHeight, endHeight) {
        const startBlock = await this.getBlockByHeight(startHeight);
        const endBlock = await this.getBlockByHeight(endHeight);

        if (!startBlock || !endBlock) {
            app.forceExit(
                "Wrong input height parameters for building export queries. Blocks at height not found in db.",
            );
        }
        return {
            blocks: rawQuery(this.pgp, queries.blocks.heightRange, {
                start: startBlock.height,
                end: endBlock.height,
            }),
            transactions: rawQuery(this.pgp, queries.transactions.timestampRange, {
                start: startBlock.timestamp,
                end: endBlock.timestamp,
            }),
        };
    }

    public getTransactionsBackupQuery(startTimestamp) {
        return rawQuery(this.pgp, queries.transactions.timestampHigher, {
            start: startTimestamp,
        });
    }

    public getColumnSet(tableName) {
        switch (tableName) {
            case "blocks":
                return this.blocksColumnSet;
            case "transactions":
                return this.transactionsColumnSet;
            default:
                throw new Error("Invalid table name");
        }
    }

    public close() {
        if (!this.isSharedConnection) {
            logger.debug("Closing snapshots-cli database connection");
            this.db.$pool.end();
            this.pgp.end();
        }
    }

    public __createColumnSets() {
        this.blocksColumnSet = new this.pgp.helpers.ColumnSet(columns.blocks, {
            table: "blocks",
        });
        this.transactionsColumnSet = new this.pgp.helpers.ColumnSet(columns.transactions, { table: "transactions" });
    }

    public async __runMigrations() {
        for (const migration of migrations) {
            await this.db.none(migration);
        }
    }
}

export const database = new Database();
