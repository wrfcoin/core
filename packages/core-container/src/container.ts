import { createContainer } from "awilix";
import delay from "delay";
import semver from "semver";
import { Environment } from "./environment";
import { PluginRegistrar } from "./registrars/plugin";
import { RemoteLoader } from "./remote-loader";

export class Container {
    public container: any;
    public exitEvents: any;
    public silentShutdown: boolean;
    public hashid: string;
    public env: Environment;
    public plugins: any;
    public shuttingDown: boolean;
    public version: string;
    public isReady: boolean = false;

    /**
     * Create a new container instance.
     * @constructor
     */
    constructor() {
        this.container = createContainer();
        this.exitEvents = ["SIGINT", "exit"];

        /**
         * May be used by CLI programs to suppress the shutdown
         * messages.
         */
        this.silentShutdown = false;

        /**
         * The git commit hash of the repository. Used during development to
         * easily idenfity nodes based on their commit hash and version.
         */
        try {
            this.hashid = require("child_process")
                .execSync("git rev-parse --short=8 HEAD")
                .toString()
                .trim();
        } catch (e) {
            this.hashid = "unknown";
        }
    }

    /**
     * Set up the app.
     * @param  {String} version
     * @param  {Object} variables
     * @param  {Object} options
     * @return {void}
     */
    public async setUp(version, variables, options: any = {}) {
        this.__registerExitHandler();

        this.setVersion(version);

        if (variables.remote) {
            const remoteLoader = new RemoteLoader(variables);
            await remoteLoader.setUp();
        }

        this.env = new Environment(variables);
        this.env.setUp();

        if (options.skipPlugins) {
            return;
        }

        // TODO: Move this out eventually - not really the responsibility of the container
        this.plugins = new PluginRegistrar(this, options);
        await this.plugins.setUp();

        this.isReady = true;
    }

    /**
     * Tear down the app.
     * @return {Promise}
     */
    public async tearDown() {
        await this.plugins.tearDown();

        this.isReady = false;
    }

    /**
     * Add a new registration.
     * @param  {string} key
     * @return {Object}
     * @throws {Error}
     */
    public register(name, resolver) {
        try {
            return this.container.register(name, resolver);
        } catch (err) {
            throw new Error(err.message);
        }
    }

    /**
     * Resolve a registration.
     * @param  {string} key
     * @return {Object}
     * @throws {Error}
     */
    public resolve(key) {
        try {
            return this.container.resolve(key);
        } catch (err) {
            throw new Error(err.message);
        }
    }

    /**
     * Resolve a plugin.
     * @param  {string} key
     * @return {Object}
     * @throws {Error}
     */
    public resolvePlugin(key) {
        try {
            return this.container.resolve(key).plugin;
        } catch (err) {
            return null;
        }
    }

    /**
     * Resolve the options of a plugin. Available before a plugin mounts.
     * @param  {string} key
     * @return {Object}
     * @throws {Error}
     */
    public resolveOptions(key) {
        try {
            return this.container.resolve(key).options;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Determine if the given registration exists.
     * @param  {String}  key
     * @return {Boolean}
     */
    public has(key) {
        try {
            this.container.resolve(key);

            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Force the container to exit and print the given message and associated error.
     * @param  {String} message
     * @param  {Error} error
     * @return {void}
     */
    public forceExit(message, error = null) {
        this.exit(1, message, error);
    }

    /**
     * Exit the container with the given exitCode, message and associated error.
     * @param  {Number} exitCode
     * @param  {String} message
     * @param  {Error} error
     * @return {void}
     */
    public exit(exitCode, message, error = null) {
        this.shuttingDown = true;

        const logger = this.resolvePlugin("logger");
        logger.error(":boom: Container force shutdown :boom:");
        logger.error(message);

        if (error) {
            logger.error(error.stack);
        }

        process.exit(exitCode);
    }

    /**
     * Get the application git commit hash.
     * @throws {String}
     */
    public getHashid() {
        return this.hashid;
    }

    /**
     * Get the application version.
     * @throws {String}
     */
    public getVersion() {
        return this.version;
    }

    /**
     * Set the application version.
     * @param  {String} version
     * @return {void}
     */
    public setVersion(version) {
        if (!semver.valid(version)) {
            this.forceExit(
                // tslint:disable-next-line:max-line-length
                `The provided version ("${version}") is invalid. Please check https://semver.org/ and make sure you follow the spec.`,
            );
        }

        this.version = version;
    }

    /**
     * Handle any exit signals.
     * @return {void}
     */
    public __registerExitHandler() {
        const handleExit = async () => {
            if (this.shuttingDown) {
                return;
            }

            this.shuttingDown = true;

            const logger = this.resolvePlugin("logger");
            logger.suppressConsoleOutput(this.silentShutdown);
            logger.info("Ark Core is trying to gracefully shut down to avoid data corruption :pizza:");

            try {
                const database = this.resolvePlugin("database");
                if (database) {
                    const emitter = this.resolvePlugin("event-emitter");

                    // Notify plugins about shutdown
                    emitter.emit("shutdown");

                    // Wait for event to be emitted and give time to finish
                    await delay(1000);

                    // Save dirty wallets
                    await database.saveWallets(false);
                }
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.error(error.stack);
            }

            await this.plugins.tearDown();

            process.exit();
        };

        // Handle exit events
        this.exitEvents.forEach(eventType => process.on(eventType, handleExit));
    }
}
