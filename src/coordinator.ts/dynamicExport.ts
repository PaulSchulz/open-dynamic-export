import { getTotalFromPerPhaseMeasurement } from '../power';
import type { InverterSunSpecConnection } from '../sunspec/connection/inverter';
import type { MeterSunSpecConnection } from '../sunspec/connection/meter';
import { getAveragePowerRatio } from '../sunspec/helpers/controls';
import { getTelemetryFromSunSpec } from './telemetry/sunspec';

export async function calculateDynamicExportValues({
    exportLimitWatts,
    invertersConnections,
    metersConnections,
}: {
    exportLimitWatts: number;
    invertersConnections: InverterSunSpecConnection[];
    metersConnections: MeterSunSpecConnection[];
}) {
    const invertersData = await Promise.all(
        invertersConnections.map(async (inverter) => {
            return {
                inverter: await inverter.getInverterModel(),
                controls: await inverter.getControlsModel(),
            };
        }),
    );

    const metersData = await Promise.all(
        metersConnections.map(async (meter) => {
            return await meter.getMeterModel();
        }),
    );

    const telemetry = getTelemetryFromSunSpec({
        inverters: invertersData.map(({ inverter }) => inverter),
        meters: metersData,
    });

    const siteWatts = getTotalFromPerPhaseMeasurement(telemetry.realPower.site);
    const solarWatts = getTotalFromPerPhaseMeasurement(telemetry.realPower.der);

    const targetSolarWatts = calculateTargetSolarWatts({
        exportLimitWatts,
        siteWatts,
        solarWatts,
    });

    const currentPowerRatio = getAveragePowerRatio(
        invertersData.map(({ controls }) => controls),
    );

    const targetSolarPowerRatio = calculateTargetSolarPowerRatio({
        currentPowerRatio,
        currentSolarWatts: solarWatts,
        targetSolarWatts,
    });

    return {
        siteWatts,
        solarWatts,
        targetSolarWatts,
        currentPowerRatio,
        targetSolarPowerRatio,
    };
}

export function calculateTargetSolarPowerRatio({
    currentSolarWatts,
    targetSolarWatts,
    currentPowerRatio,
}: {
    currentSolarWatts: number;
    targetSolarWatts: number;
    // the current power ratio expressed as a decimal (0.0-1.0)
    currentPowerRatio: number;
}) {
    const estimatedSolarCapacity = currentSolarWatts / currentPowerRatio;
    const targetPowerRatio = targetSolarWatts / estimatedSolarCapacity;

    // cap the target power ratio to 1.0
    return Math.min(targetPowerRatio, 1);
}

// calculate the target solar power to meet the export limit
// note: this may return a value higher than what the PV/inverter is able to produce
// we don't want to make any assumptions about the max capabilities of the inverter due to overclocking
export function calculateTargetSolarWatts({
    solarWatts,
    siteWatts,
    exportLimitWatts,
}: {
    solarWatts: number;
    // the power usage at the site
    // positive = import power
    // negative = export power
    siteWatts: number;
    exportLimitWatts: number;
}) {
    const changeToMeetExportLimit = -siteWatts + -exportLimitWatts;
    const solarTarget = solarWatts - changeToMeetExportLimit;

    return solarTarget;
}
