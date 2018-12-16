import { configManager } from "@arkecosystem/crypto";
import axios from "axios";
import { existsSync, readdirSync, writeFileSync } from "fs-extra";
import Joi from "joi";
import get from "lodash/get";
import set from "lodash/set";
import { basename, extname, resolve } from "path";
import { schema } from "../schema";

class FileLoader {
    /**
     * Make the config instance.
     * @param  {Object} opts
     * @return {Loader}
     */
    public async setUp(opts) {
        if (!opts) {
            throw new Error("Invalid network configuration provided.");
        }

        const { value, error } = Joi.validate(opts, schema);

        if (error) {
            throw error;
        }

        return { config: value, files: await this.createFromDirectory() };
    }

    /**
     * Load and bind the config.
     * @return {void}
     */
    private async createFromDirectory() {
        const files: Record<string, string> = this.getFiles();

        for (const [key, value] of Object.entries(files)) {
            files[key] = require(value);
        }

        await this.buildPeers(files.peers);

        return files;
    }

    /**
     * Get all config files.
     * @return {Object}
     */
    private getFiles(): Record<string, string> {
        const basePath = resolve(process.env.ARK_PATH_CONFIG);

        if (!existsSync(basePath)) {
            throw new Error("An invalid configuration was provided or is inaccessible due to it's security settings.");
        }

        const configTree = {};
        for (const file of readdirSync(basePath)) {
            if ([".js", ".json"].includes(extname(file))) {
                configTree[basename(file, extname(file))] = resolve(basePath, file);
            }
        }

        return configTree;
    }

    /**
     * Build the peer list either from a local file, remote file or object.
     * @param  {String} configFile
     * @return {void}
     */
    private async buildPeers(configFile: any): Promise<void> {
        if (configFile.sources) {
            for (const source of configFile.sources) {
                // Local File...
                if (source.startsWith("/")) {
                    configFile.list = require(source);

                    writeFileSync(configFile, JSON.stringify(configFile, null, 2));

                    break;
                }

                // URL...
                try {
                    const response = await axios.get(source);

                    configFile.list = response.data;

                    writeFileSync(configFile, JSON.stringify(configFile, null, 2));

                    break;
                } catch (error) {
                    //
                }
            }
        }
    }
}

export const fileLoader = new FileLoader();