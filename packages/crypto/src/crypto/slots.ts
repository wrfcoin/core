import dayjs from "dayjs-ext";
import { configManager } from "../managers/config";

class Slots {
    public height: number;
    /**
     * Create a new Slot instance.
     */
    constructor() {
        this.resetHeight();
    }

    /**
     * Get the height we are currently at.
     * @return {Number}
     */
    public getHeight() {
        return this.height;
    }

    /**
     * Set the height we are currently at.
     * @param  {Number} height
     * @return {void}
     */
    public setHeight(height) {
        this.height = height;
    }

    /**
     * Reset the height to the initial value.
     * @return {void}
     */
    public resetHeight() {
        this.height = 1;
    }

    /**
     * Get epoch time relative to beginning epoch time.
     * @param  {Number} time
     * @return {Number}
     */
    public getEpochTime(time?: any) {
        if (time === undefined) {
            time = dayjs().valueOf();
        }

        const start = this.beginEpochTime().valueOf();

        return Math.floor((time - start) / 1000);
    }

    /**
     * Get beginning epoch time.
     * @return {Moment}
     */
    public beginEpochTime() {
        return dayjs(this.getConstant("epoch")).utc();
    }

    /**
     * Get epoch time relative to beginning epoch time.
     * @param  {Number} time
     * @return {Number}
     */
    public getTime(time?) {
        return this.getEpochTime(time);
    }

    /**
     * Get real time from relative epoch time.
     * @param  {Number} epochTime
     * @return {Number}
     */
    public getRealTime(epochTime) {
        if (epochTime === undefined) {
            epochTime = this.getTime();
        }

        const start = Math.floor(this.beginEpochTime().valueOf() / 1000) * 1000;

        return start + epochTime * 1000;
    }

    /**
     * Get the current slot number.
     * @param  {Number} epochTime
     * @return {Number}
     */
    public getSlotNumber(epochTime?) {
        if (epochTime === undefined) {
            epochTime = this.getTime();
        }

        return Math.floor(epochTime / this.getConstant("blocktime"));
    }

    /**
     * Get the current slot time.
     * @param  {Number} slot
     * @return {Number}
     */
    public getSlotTime(slot) {
        return slot * this.getConstant("blocktime");
    }

    /**
     * Get the next slot number.
     * @return {Number}
     */
    public getNextSlot() {
        return this.getSlotNumber() + 1;
    }

    /**
     * Get the last slot number.
     * @param  {Number} nextSlot
     * @return {Number}
     */
    public getLastSlot(nextSlot) {
        return nextSlot + this.getConstant("activeDelegates");
    }

    /**
     * Get constant from height 1.
     * @param  {String} key
     * @return {*}
     */
    public getConstant(key) {
        return configManager.getConstants(this.height)[key];
    }

    /**
     * Checks if forging is allowed
     * @param  {Number} epochTime
     * @return {Boolean}
     */
    public isForgingAllowed(epochTime?: any) {
        if (epochTime === undefined) {
            epochTime = this.getTime();
        }

        const blockTime = this.getConstant("blocktime");

        return epochTime % blockTime < blockTime / 2;
    }
}

const slots = new Slots();
export { slots };
