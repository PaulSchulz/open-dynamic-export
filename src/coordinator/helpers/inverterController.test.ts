import { describe, expect, it } from 'vitest';
import {
    calculateTargetSolarPowerRatio,
    calculateTargetSolarWatts,
    getActiveInverterControlLimit,
    getWMaxLimPctFromTargetSolarPowerRatio,
} from './inverterController.js';

describe('calculateTargetSolarPowerRatio', () => {
    it('should calculate target ratio', () => {
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 10000,
            targetSolarWatts: 5000,
        });

        expect(targetPowerRatio).toBe(0.5);
    });

    it('should cap target power ratio above 1.0 to 1.0', () => {
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 10000,
            targetSolarWatts: 15000,
        });

        expect(targetPowerRatio).toBe(1);
    });

    it('should not return target power ratio lower than 0.0', () => {
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 10000,
            targetSolarWatts: 0,
        });

        expect(targetPowerRatio).toBe(0);
    });

    it('avoid floating point errors', () => {
        // these values don't make sense practically but is designed to test floating point errors
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 3,
            targetSolarWatts: 0.27,
        });

        expect(targetPowerRatio).toBe(0.09);
    });

    it('should handle nameplate as 0', () => {
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 0,
            targetSolarWatts: 0,
        });

        expect(targetPowerRatio).toBe(0);
    });

    it('should handle no inverters', () => {
        const targetPowerRatio = calculateTargetSolarPowerRatio({
            nameplateMaxW: 0,
            targetSolarWatts: 0,
        });

        expect(targetPowerRatio).toBe(0);
    });
});

describe('calculateTargetSolarWatts', () => {
    it('should calculate higher target if site is importing', () => {
        const targetSolar = calculateTargetSolarWatts({
            solarWatts: 2000,
            siteWatts: 5000,
            exportLimitWatts: 5000,
        });

        expect(targetSolar).toBe(12000);
    });

    it('should calculate higher target if site is exporting below export limit', () => {
        const targetSolar = calculateTargetSolarWatts({
            solarWatts: 5000,
            siteWatts: -4000,
            exportLimitWatts: 5000,
        });

        expect(targetSolar).toBe(6000);
    });

    it('should calculate lower target if site is exporting above export limit', () => {
        const targetSolar = calculateTargetSolarWatts({
            solarWatts: 8000,
            siteWatts: -7000,
            exportLimitWatts: 5000,
        });

        expect(targetSolar).toBe(6000);
    });

    it('avoid floating point errors', () => {
        // these values don't make sense practically but is designed to test floating point errors
        const targetSolar = calculateTargetSolarWatts({
            solarWatts: 8.13,
            siteWatts: -5.75,
            exportLimitWatts: 0,
        });

        expect(targetSolar).toBe(2.38);
    });
});

describe('getWMaxLimPctFromTargetSolarPowerRatio', () => {
    it('should handle WMaxLimPct_SF -2', () => {
        const WMaxLimPct = getWMaxLimPctFromTargetSolarPowerRatio({
            targetSolarPowerRatio: 1,
            controlsModel: {
                WMaxLimPct_SF: -2,
            },
        });

        expect(WMaxLimPct).toBe(10000);
    });

    it('should handle WMaxLimPct_SF 0', () => {
        const WMaxLimPct = getWMaxLimPctFromTargetSolarPowerRatio({
            targetSolarPowerRatio: 0.5,
            controlsModel: {
                WMaxLimPct_SF: 0,
            },
        });

        expect(WMaxLimPct).toBe(50);
    });

    it('should output whole values', () => {
        const WMaxLimPct = getWMaxLimPctFromTargetSolarPowerRatio({
            targetSolarPowerRatio: 0.55821249,
            controlsModel: {
                WMaxLimPct_SF: -2,
            },
        });

        expect(WMaxLimPct).toBe(5582);
    });
});

describe('getActiveInverterControlLimit', () => {
    it('should return the minimum of all limits', () => {
        const inverterControlLimit = getActiveInverterControlLimit([
            {
                source: 'fixed',
                opModConnect: undefined,
                opModEnergize: undefined,
                opModExpLimW: undefined,
                opModGenLimW: 20000,
                opModImpLimW: 10000,
                opModLoadLimW: 5000,
            },
            {
                source: 'mqtt',
                opModConnect: false,
                opModEnergize: true,
                opModExpLimW: 5000,
                opModGenLimW: 5000,
                opModImpLimW: 5000,
                opModLoadLimW: 5000,
            },
            {
                source: 'csipAus',
                opModConnect: true,
                opModEnergize: false,
                opModExpLimW: 2000,
                opModGenLimW: 10000,
                opModImpLimW: 10000,
                opModLoadLimW: 10000,
            },
        ]);

        expect(inverterControlLimit).toEqual({
            opModConnect: {
                source: 'mqtt',
                value: false,
            },
            opModEnergize: {
                source: 'csipAus',
                value: false,
            },
            opModExpLimW: {
                source: 'csipAus',
                value: 2000,
            },
            opModGenLimW: {
                source: 'mqtt',
                value: 5000,
            },
            opModImpLimW: {
                source: 'mqtt',
                value: 5000,
            },
            opModLoadLimW: {
                source: 'fixed',
                value: 5000,
            },
        } satisfies typeof inverterControlLimit);
    });

    it('should return undefined if all limits are undefined', () => {
        const inverterControlLimit = getActiveInverterControlLimit([
            {
                source: 'fixed',
                opModConnect: undefined,
                opModEnergize: undefined,
                opModExpLimW: undefined,
                opModGenLimW: undefined,
                opModImpLimW: undefined,
                opModLoadLimW: undefined,
            },
            {
                source: 'mqtt',
                opModConnect: undefined,
                opModEnergize: undefined,
                opModExpLimW: 1000,
                opModGenLimW: undefined,
                opModImpLimW: undefined,
                opModLoadLimW: undefined,
            },
        ]);

        expect(inverterControlLimit).toEqual({
            opModConnect: undefined,
            opModEnergize: undefined,
            opModExpLimW: {
                source: 'mqtt',
                value: 1000,
            },
            opModGenLimW: undefined,
            opModImpLimW: undefined,
            opModLoadLimW: undefined,
        } satisfies typeof inverterControlLimit);
    });
});
