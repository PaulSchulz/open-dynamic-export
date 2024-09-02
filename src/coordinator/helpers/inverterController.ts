import type { ControlType } from '../../sep2/helpers/controlScheduler';
import {
    Conn,
    OutPFSet_Ena,
    VArPct_Ena,
    WMaxLim_Ena,
    type ControlsModel,
    type ControlsModelWrite,
} from '../../sunspec/models/controls';
import type { MonitoringSample } from './monitoring';
import type { DERControlBase } from '../../sep2/models/derControlBase';
import type { InverterSunSpecConnection } from '../../sunspec/connection/inverter';
import Decimal from 'decimal.js';
import {
    averageNumbersArray,
    numberWithPow10,
    roundToDecimals,
} from '../../helpers/number';
import { getTotalFromPerPhaseMeasurement } from '../../helpers/power';
import { type Logger } from 'pino';
import { logger as pinoLogger } from '../../helpers/logger';
import type { RampRateHelper } from './rampRate';
import type { NameplateModel } from '../../sunspec/models/nameplate';
import type { InverterModel } from '../../sunspec/models/inverter';
import { influxDbWriteApi } from '../../helpers/influxdb';
import { Point } from '@influxdata/influxdb-client';
import type { ControlSystemBase } from './controlSystemBase';

export type SupportedControlTypes = Extract<
    ControlType,
    'opModExpLimW' | 'opModGenLimW' | 'opModEnergize' | 'opModConnect'
>;

type SunSpecData = {
    inverters: {
        inverter: InverterModel;
        nameplate: NameplateModel;
        controls: ControlsModel;
    }[];
    monitoringSample: MonitoringSample;
};

export type ActiveDERControlBaseValues = Pick<
    DERControlBase,
    SupportedControlTypes
>;

type InverterConfiguration =
    | { type: 'deenergize' }
    | {
          type: 'limit';
          currentPowerRatio: number;
          targetSolarPowerRatio: number;
          rampedTargetSolarPowerRatio: number;
      };

const defaultValues = {
    opModGenLimW: Number.MAX_SAFE_INTEGER,
    opModLoadLimW: Number.MAX_SAFE_INTEGER,
    opModExpLimW: 1500,
    opModImpLimW: 1500,
    opModEnergize: true,
    opModConnect: true,
};

export class InverterController {
    private inverterConnections: InverterSunSpecConnection[];
    private cachedSunSpecData: SunSpecData | null = null;
    private applyControl: boolean;
    private logger: Logger;
    private rampRateHelper: RampRateHelper;
    private controlSystems: ControlSystemBase[];

    constructor({
        invertersConnections,
        applyControl,
        rampRateHelper,
        controlSystems,
    }: {
        invertersConnections: InverterSunSpecConnection[];
        applyControl: boolean;
        rampRateHelper: RampRateHelper;
        controlSystems: ControlSystemBase[];
    }) {
        this.logger = pinoLogger.child({ module: 'InverterController' });

        this.applyControl = applyControl;
        this.inverterConnections = invertersConnections;
        this.rampRateHelper = rampRateHelper;
        this.controlSystems = controlSystems;
    }

    updateSunSpecInverterData(data: SunSpecData) {
        this.logger.debug('Received inverter data, updating inverter controls');
        this.cachedSunSpecData = data;

        void this.updateInverterControlValues();
    }

    private getActiveDerControlBaseValues(): ActiveDERControlBaseValues {
        const controlSystemControlBaseValues = this.controlSystems.map(
            (controlSystem) => controlSystem.getActiveDerControlBaseValues(),
        );

        // TODO logic to merge the control base values
        // for now, just return the first one
        return controlSystemControlBaseValues.at(0)!;
    }

    private async updateInverterControlValues() {
        if (!this.cachedSunSpecData) {
            this.logger.warn(
                'Inverter data is not cached, cannot update inverter controls yet. Wait for next loop.',
            );
            return;
        }

        const activeDerControlBaseValues = this.getActiveDerControlBaseValues();

        const inverterConfiguration = calculateInverterConfiguration({
            activeDerControlBaseValues,
            sunSpecData: this.cachedSunSpecData,
            rampRateHelper: this.rampRateHelper,
        });

        this.logger.info(
            {
                activeDerControlBaseValues,
                inverterConfiguration,
            },
            'Updating inverter control values',
        );

        await Promise.all(
            this.inverterConnections.map(async (inverter, index) => {
                // assume the inverter data is in the same order as the connections
                const inverterData = this.cachedSunSpecData?.inverters[index];

                if (!inverterData) {
                    throw new Error('Inverter data not found');
                }

                const writeControlsModel =
                    generateControlsModelWriteFromInverterConfiguration({
                        inverterConfiguration,
                        controlsModel: inverterData.controls,
                    });

                if (this.applyControl) {
                    try {
                        await inverter.writeControlsModel(writeControlsModel);
                    } catch (error) {
                        this.logger.error(
                            error,
                            'Error writing inverter controls value',
                        );
                    }
                }
            }),
        );
    }
}

export function calculateInverterConfiguration({
    activeDerControlBaseValues,
    sunSpecData,
    rampRateHelper,
}: {
    activeDerControlBaseValues: ActiveDERControlBaseValues;
    sunSpecData: SunSpecData;
    rampRateHelper: RampRateHelper;
}): InverterConfiguration {
    const logger = pinoLogger.child({ module: 'calculateDynamicExportConfig' });

    logger.trace(
        {
            activeDerControlBaseValues,
        },
        'activeDerControlBaseValue',
    );

    const energize =
        activeDerControlBaseValues.opModEnergize ?? defaultValues.opModEnergize;
    const connect =
        activeDerControlBaseValues.opModConnect ?? defaultValues.opModConnect;
    const deenergize = energize === false || connect === false;

    const siteWatts = getTotalFromPerPhaseMeasurement(
        sunSpecData.monitoringSample.site.realPower,
    );
    const solarWatts = getTotalFromPerPhaseMeasurement(
        sunSpecData.monitoringSample.der.realPower,
    );

    const exportLimitWatts = activeDerControlBaseValues.opModExpLimW
        ? numberWithPow10(
              activeDerControlBaseValues.opModExpLimW.value,
              activeDerControlBaseValues.opModExpLimW.multiplier,
          )
        : defaultValues.opModExpLimW;

    const generationLimitWatts = activeDerControlBaseValues.opModGenLimW
        ? numberWithPow10(
              activeDerControlBaseValues.opModGenLimW.value,
              activeDerControlBaseValues.opModGenLimW.multiplier,
          )
        : defaultValues.opModGenLimW;

    const exportLimitTargetSolarWatts = calculateTargetSolarWatts({
        exportLimitWatts,
        siteWatts,
        solarWatts,
    });

    // the limits need to be applied together
    // take the lesser of the export limit target solar watts or generation limit
    const targetSolarWatts = Math.min(
        exportLimitTargetSolarWatts,
        generationLimitWatts,
    );

    const currentPowerRatio = getCurrentPowerRatio({
        inverters: sunSpecData.inverters,
        currentSolarWatts: solarWatts,
    });

    const targetSolarPowerRatio = calculateTargetSolarPowerRatio({
        currentPowerRatio,
        currentSolarWatts: solarWatts,
        targetSolarWatts,
    });

    const rampedTargetSolarPowerRatio = rampRateHelper.calculateRampValue({
        currentPowerRatio,
        targetPowerRatio: targetSolarPowerRatio,
    });

    influxDbWriteApi.writePoints([
        new Point('inverterControl')
            .booleanField('deenergize', deenergize)
            .floatField('siteWatts', siteWatts)
            .floatField('solarWatts', solarWatts)
            .floatField('exportLimitWatts', exportLimitWatts)
            .floatField(
                'exportLimitTargetSolarWatts',
                exportLimitTargetSolarWatts,
            )
            .floatField('generationLimitWatts', generationLimitWatts)
            .floatField('targetSolarWatts', targetSolarWatts)
            .floatField('currentPowerRatio', currentPowerRatio)
            .floatField('targetSolarPowerRatio', targetSolarPowerRatio)
            .floatField(
                'rampedTargetSolarPowerRatio',
                rampedTargetSolarPowerRatio,
            ),
    ]);

    logger.trace(
        {
            deenergize,
            siteWatts,
            solarWatts,
            exportLimitWatts,
            exportLimitTargetSolarWatts,
            rampedTargetSolarPowerRatio,
            generationLimitWatts,
            targetSolarWatts,
            currentPowerRatio,
            targetSolarPowerRatio,
        },
        'calculated values',
    );

    if (energize === false || connect === false) {
        return { type: 'deenergize' };
    }

    return {
        type: 'limit',
        currentPowerRatio: roundToDecimals(currentPowerRatio, 4),
        targetSolarPowerRatio: roundToDecimals(targetSolarPowerRatio, 4),
        rampedTargetSolarPowerRatio: roundToDecimals(
            rampedTargetSolarPowerRatio,
            4,
        ),
    };
}

export function generateControlsModelWriteFromInverterConfiguration({
    inverterConfiguration,
    controlsModel,
}: {
    inverterConfiguration: InverterConfiguration;
    controlsModel: ControlsModel;
}): ControlsModelWrite {
    switch (inverterConfiguration.type) {
        case 'deenergize':
            return {
                ...controlsModel,
                Conn: Conn.DISCONNECT,
                // revert Conn in 60 seconds
                // this is a safety measure in case the SunSpec connection is lost
                // we want to revert the inverter to the default which is assumed to be safe
                // we assume we will write another config witin 60 seconds to reset this timeout
                Conn_RvrtTms: 60,
                WMaxLim_Ena: WMaxLim_Ena.DISABLED,
                // set value to 0 to gracefully handle re-energising and calculating target power ratio
                WMaxLimPct: getWMaxLimPctFromTargetSolarPowerRatio({
                    targetSolarPowerRatio: 0,
                    controlsModel,
                }),
                VArPct_Ena: VArPct_Ena.DISABLED,
                OutPFSet_Ena: OutPFSet_Ena.DISABLED,
            };
        case 'limit':
            return {
                ...controlsModel,
                Conn: Conn.CONNECT,
                WMaxLim_Ena: WMaxLim_Ena.ENABLED,
                WMaxLimPct: getWMaxLimPctFromTargetSolarPowerRatio({
                    targetSolarPowerRatio:
                        inverterConfiguration.rampedTargetSolarPowerRatio,
                    controlsModel,
                }),
                // revert WMaxLimtPct in 60 seconds
                // this is a safety measure in case the SunSpec connection is lost
                // we want to revert the inverter to the default which is assumed to be safe
                // we assume we will write another config witin 60 seconds to reset this timeout
                WMaxLimPct_RvrtTms: 60,
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
    return Math.round(
        numberWithPow10(
            Decimal.min(
                new Decimal(targetSolarPowerRatio),
                1, // cap maximum to 1
            )
                .times(100)
                .toNumber(),
            -controlsModel.WMaxLimPct_SF,
        ),
    );
}

export function getCurrentPowerRatio({
    inverters,
    currentSolarWatts,
}: {
    inverters: SunSpecData['inverters'];
    currentSolarWatts: number;
}) {
    return averageNumbersArray(
        inverters.map(({ controls, inverter, nameplate }, invertersIndex) => {
            // if the WMaxLim_Ena is not enabled, we are not yet controlling the inverter
            // we're not sure if the inverter is under any control that is invisible to SunSpec (e.g. export limit) that might be affecting the output
            // so we can't know definitely what the "actual" power ratio is
            // this is a dangerous scenario because if we miscalculate the power ratio at the first instance of control, we might exceed the export limit
            // the most conservative estimate we can make is the current solar / nameplate ratio which assumes a 100% efficiency
            // because it will never be 100% efficient, this means that we should always underestimate the power ratio
            // which is a safe assumption, but we hope future update cycles will find the "correct" power ratio
            if (controls.WMaxLim_Ena !== WMaxLim_Ena.ENABLED) {
                const solarWatts = numberWithPow10(inverter.W, inverter.W_SF);

                const nameplateWatts = numberWithPow10(
                    nameplate.WRtg,
                    nameplate.WRtg_SF,
                );

                const estimatedPowerRatio = Math.min(
                    solarWatts / nameplateWatts,
                    1, // cap maximum to 1 (possible due to inverter overclocking)
                );

                pinoLogger.info(
                    {
                        estimatedPowerRatio,
                        currentSolarWatts,
                        nameplateWatts,
                        invertersIndex,
                    },
                    'WMaxLim_Ena is not enabled, estimated power ratio',
                );

                return estimatedPowerRatio;
            }

            return (
                // the value is expressed from 0-100, divide to get ratio
                numberWithPow10(controls.WMaxLimPct, controls.WMaxLimPct_SF) /
                100
            );
        }),
    );
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
    // edge case if the current power ratio is 0
    // there is no way to calculate the target power ratio because we cannot divide by 0
    // set a hard-coded power ratio
    // hopefully at a future cycle then it will be able to calculate the target power ratio
    if (currentPowerRatio === 0 || isNaN(currentPowerRatio)) {
        if (targetSolarWatts > currentSolarWatts) {
            // if the target is higher than the current, set a hard-coded power ratio of 0.01
            return 0.01;
        } else {
            // if the target is lower than the current, set a hard-coded power ratio of 0
            return 0;
        }
    }

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
