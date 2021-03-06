import { app } from "@arkecosystem/core-container";
import Boom from "boom";
import Hapi from "hapi";
import { transactionsRepository } from "../../../repositories";
import { Controller } from "../shared/controller";

export class TransactionsController extends Controller {
    protected transactionPool: any;

    public constructor() {
        super();

        this.transactionPool = app.resolvePlugin("transactionPool");
    }

    public async index(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        try {
            const data = await request.server.methods.v1.transactions.index(request);

            return super.respondWithCache(data, h);
        } catch (error) {
            return Boom.badImplementation(error);
        }
    }

    public async show(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        try {
            const data = await request.server.methods.v1.transactions.show(request);

            return super.respondWithCache(data, h);
        } catch (error) {
            return Boom.badImplementation(error);
        }
    }

    public async unconfirmed(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        try {
            const pagination = super.paginate(request);

            let transactions = this.transactionPool.getTransactions(pagination.offset, pagination.limit);
            transactions = transactions.map(transaction => ({
                serialized: transaction,
            }));

            return super.respondWith({
                transactions: super.toCollection(request, transactions, "transaction"),
            });
        } catch (error) {
            return Boom.badImplementation(error);
        }
    }

    public async showUnconfirmed(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        try {
            // @ts-ignore
            const transaction = this.transactionPool.getTransaction(request.query.id);

            if (!transaction) {
                return super.respondWith("Transaction not found", true);
            }

            return super.respondWith({
                transaction: super.toResource(
                    request,
                    {
                        serialized: transaction.serialized,
                    },
                    "transaction",
                ),
            });
        } catch (error) {
            return Boom.badImplementation(error);
        }
    }
}
