import Decimal from 'decimal.js';
import { getTotalFromPerPhaseMeasurement } from '../power';
import type { SunSpecTelemetry } from './telemetry/sunspec';
import type { ControlsModel } from '../sunspec/models/controls';
import {
    OutPFSet_Ena,
    VArPct_Ena,
    WMaxLim_Ena,
} from '../sunspec/models/controls';
import { Conn, type ControlsModelWrite } from '../sunspec/models/controls';
import type { DERControlBase } from '../sep2/models/derControlBase';
import { numberWithPow10 } from '../number';

export function generateControlsModelWriteFromDynamicExportConfig({
    config,
    controlsModel,
}: {
    config: DynamicExportConfig;
    controlsModel: ControlsModel;
}): ControlsModelWrite {
    switch (config.type) {
        case 'deenergize':
            return {
                ...controlsModel,
                Conn: Conn.DISCONNECT,
                WMaxLim_Ena: WMaxLim_Ena.DISABLED,
                VArPct_Ena: VArPct_Ena.DISABLED,
                OutPFSet_Ena: OutPFSet_Ena.DISABLED,
            };
        case 'limit':
            return {
                ...controlsModel,
                Conn: Conn.CONNECT,
                WMaxLim_Ena: WMaxLim_Ena.ENABLED,
                WMaxLimPct: getWMaxLimPctFromTargetSolarPowerRatio({
                    targetSolarPowerRatio: config.targetSolarPowerRatio,
                    controlsModel,
                }),
                VArPct_Ena: VArPct_Ena.DISABLED,
                OutPFSet_Ena: OutPFSet_Ena.DISABLED,
            };
    }
}

export function getWMaxLimPctFromTargetSolarPowerRatio({
    targetSolarPowerRatio,
    controlsModel,
}: {
    targetSolarPowerRatio: number;
    controlsModel: Pick<ControlsModel, 'WMaxLimPct_SF'>;
}) {
    return numberWithPow10(
        new Decimal(targetSolarPowerRatio).times(100).toNumber(),
        -controlsModel.WMaxLimPct_SF,
    );
}

type DynamicExportConfig =
    | { type: 'deenergize' }
    | {
          type: 'limit';
          targetSolarPowerRatio: number;
      };

export function calculateDynamicExportConfig({
    activeDerControlBase,
    telemetry,
    currentAveragePowerRatio,
}: {
    activeDerControlBase: DERControlBase | null;
    telemetry: SunSpecTelemetry;
    currentAveragePowerRatio: number;
}): DynamicExportConfig {
    if (activeDerControlBase?.opModEnergize === false) {
        return { type: 'deenergize' };
    }

    const siteWatts = getTotalFromPerPhaseMeasurement(telemetry.realPower.site);
    const solarWatts = getTotalFromPerPhaseMeasurement(telemetry.realPower.der);

    const exportLimitWatts = activeDerControlBase?.opModExpLimW
        ? numberWithPow10(
              activeDerControlBase.opModExpLimW.value,
              activeDerControlBase.opModExpLimW.multiplier,
          )
        : // fallback to universal default of 1500W
          1500;

    const targetSolarWatts = calculateTargetSolarWatts({
        exportLimitWatts,
        siteWatts,
        solarWatts,
    });

    const targetSolarPowerRatio = calculateTargetSolarPowerRatio({
        currentPowerRatio: currentAveragePowerRatio,
        currentSolarWatts: solarWatts,
        targetSolarWatts,
    });

    console.log('calculateDynamicExportConfig', {
        siteWatts,
        solarWatts,
        targetSolarWatts,
        currentPowerRatio: currentAveragePowerRatio,
        targetSolarPowerRatio,
    });

    return {
        type: 'limit',
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
    const estimatedSolarCapacity = new Decimal(currentSolarWatts).div(
        currentPowerRatio,
    );
    const targetPowerRatio = new Decimal(targetSolarWatts).div(
        estimatedSolarCapacity,
    );

    // cap the target power ratio to 1.0
    return targetPowerRatio.clamp(0, 1).toNumber();
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
    const changeToMeetExportLimit = new Decimal(-siteWatts).plus(
        -exportLimitWatts,
    );
    const solarTarget = new Decimal(solarWatts).sub(changeToMeetExportLimit);

    return solarTarget.toNumber();
}
