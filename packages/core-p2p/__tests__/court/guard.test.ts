import { app } from "@arkecosystem/core-container";
import dayjs from "dayjs-ext";
import { config } from "../../src/config";
import { offences } from "../../src/court/offences";
import { defaults } from "../../src/defaults";
import { setUp, tearDown } from "../__support__/setup";

const ARK_ENV = process.env.ARK_ENV;

const container = app;

let guard;
let Peer;
let peerMock;

beforeAll(async () => {
    await setUp();

    guard = require("../../dist/court/guard").guard;
    Peer = require("../../dist/peer").Peer;
});

afterAll(async () => {
    await tearDown();
});

beforeEach(async () => {
    guard.monitor.config = defaults;
    guard.monitor.peers = {};

    // this peer is here to be ready for future use in tests (not added to initial peers)
    peerMock = new Peer("1.0.0.99", 4002);
    Object.assign(peerMock, peerMock.headers);
});

describe("Guard", () => {
    describe("isSuspended", () => {
        it("should return true", async () => {
            process.env.ARK_ENV = "false";
            await guard.monitor.acceptNewPeer(peerMock);
            process.env.ARK_ENV = ARK_ENV;

            expect(guard.isSuspended(peerMock)).toBe(true);
        });

        it("should return false because passed", async () => {
            process.env.ARK_ENV = "false";
            await guard.monitor.acceptNewPeer(peerMock);
            guard.suspensions[peerMock.ip].until = dayjs().subtract(1, "minute");
            process.env.ARK_ENV = ARK_ENV;

            expect(guard.isSuspended(peerMock)).toBe(false);
        });

        it("should return false because not suspended", () => {
            expect(guard.isSuspended(peerMock)).toBe(false);
        });
    });

    describe("isRepeatOffender", () => {
        it("should be true if the threshold is met", () => {
            const peer = { offences: [] };

            for (let i = 0; i < 10; i++) {
                peer.offences.push({ weight: 10 });
            }

            expect(guard.isRepeatOffender(peer)).toBeFalse();
        });

        it("should be false if the threshold is not met", () => {
            const peer = { offences: [] };

            for (let i = 0; i < 15; i++) {
                peer.offences.push({ weight: 10 });
            }

            expect(guard.isRepeatOffender(peer)).toBeTrue();
        });
    });

    describe("__determineOffence", () => {
        const convertToMinutes = actual => Math.ceil(actual.diff(dayjs()) / 1000) / 60;

        const dummy = {
            nethash: "d9acd04bde4234a81addb8482333b4ac906bed7be5a9970ce8ada428bd083192",
            version: "2.0.0",
            status: 200,
            state: {},
        };

        it('should return a 1 year suspension for "Blacklisted"', () => {
            guard.config.set("blacklist", ["dummy-ip-addr"]);

            const { until, reason } = guard.__determineOffence({
                nethash: "d9acd04bde4234a81addb8482333b4ac906bed7be5a9970ce8ada428bd083192",
                ip: "dummy-ip-addr",
            });

            expect(convertToMinutes(until)).toBe(525600);
            expect(reason).toBe("Blacklisted");

            guard.config.set("blacklist", []);
        });

        it('should return a 5 minutes suspension for "No Common Blocks"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{
                    commonBlocks: false,
                },
            });

            expect(convertToMinutes(until)).toBe(5);
            expect(reason).toBe("No Common Blocks");
        });

        it('should return a 5 minute suspension for "Invalid Version"', () => {
            const { until, reason } = guard.__determineOffence({
                nethash: "d9acd04bde4234a81addb8482333b4ac906bed7be5a9970ce8ada428bd083192",
                version: "1.0.0",
                status: 200,
                delay: 1000,
            });

            expect(convertToMinutes(until)).toBe(5);
            expect(reason).toBe("Invalid Version");
        });

        it('should return a 10 minutes suspension for "Node is not at height"', () => {
            guard.monitor.getNetworkHeight = jest.fn(() => 154);

            const { until, reason } = guard.__determineOffence({
                ...dummy,
                state: {
                    height: 1,
                },
            });

            expect(convertToMinutes(until)).toBe(10);
            expect(reason).toBe("Node is not at height");
        });

        it('should return a 5 minutes suspension for "Invalid Response Status"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{ status: 201 },
            });

            expect(convertToMinutes(until)).toBe(5);
            expect(reason).toBe("Invalid Response Status");
        });

        it('should return a 2 minutes suspension for "Timeout"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{ delay: -1 },
            });

            expect(convertToMinutes(until)).toBe(2);
            expect(reason).toBe("Timeout");
        });

        it('should return a 1 minutes suspension for "High Latency"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{ delay: 3000 },
            });

            expect(convertToMinutes(until)).toBe(1);
            expect(reason).toBe("High Latency");
        });

        it('should return a 30 seconds suspension for "Blockchain not ready"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{ status: 503 },
            });

            expect(convertToMinutes(until)).toBe(0.5);
            expect(reason).toBe("Blockchain not ready");
        });

        it('should return a 60 seconds suspension for "Rate limit exceeded"', () => {
            const { until, reason } = guard.__determineOffence({
                ...dummy,
                ...{ status: 429 },
            });

            expect(convertToMinutes(until)).toBe(1);
            expect(reason).toBe("Rate limit exceeded");
        });

        it('should return a 10 minutes suspension for "Unknown"', () => {
            const { until, reason } = guard.__determineOffence(dummy);

            expect(convertToMinutes(until)).toBe(10);
            expect(reason).toBe("Unknown");
        });
    });

    describe("__determinePunishment", () => {
        it("should be true if the threshold is met", () => {
            const actual = guard.__determinePunishment({}, offences.REPEAT_OFFENDER);

            expect(actual).toHaveProperty("until");
            expect(actual.until).toBeObject();

            expect(actual).toHaveProperty("reason");
            expect(actual.reason).toBeString();

            expect(actual).toHaveProperty("weight");
            expect(actual.weight).toBeNumber();
        });
    });
});
