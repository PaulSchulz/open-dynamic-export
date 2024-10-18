import { type InverterData } from '../inverterData.js';
import type { Result } from '../../helpers/result.js';
import { ConnectStatus } from '../../sep2/models/connectStatus.js';
import { OperationalModeStatus } from '../../sep2/models/operationModeStatus.js';
import { DERTyp } from '../../sunspec/models/nameplate.js';
import { InverterDataPollerBase } from '../inverterDataPollerBase.js';
import { type InverterConfiguration } from '../../coordinator/helpers/inverterController.js';
import type { Config } from '../../helpers/config.js';
import { withRetry } from '../../helpers/withRetry.js';
import { writeLatency } from '../../helpers/influxdb.js';
import type { SmaConnection } from '../../modbus/connection/sma.js';
import { getSmaConnection } from '../../modbus/connections.js';
import {
    SmaCore1InverterControlFstStop,
    SmaCore1InverterControlWModCfgWMod,
    type SmaCore1InverterControl2,
    type SmaCore1InverterControlModels,
} from '../../modbus/models/smaCore1InverterControl.js';
import { numberWithPow10 } from '../../helpers/number.js';
import { Decimal } from 'decimal.js';
import type { SmaCore1InverterModels } from '../../modbus/models/smaCore1Inverter.js';
import type { SmaCore1GridMsModels } from '../../modbus/models/smaCore1GridMs.js';
import type { SmaCore1Nameplate } from '../../modbus/models/smaCore1Nameplate.js';
import {
    SmaCore1OperationGriSwStt,
    type SmaCore1Operation,
} from '../../modbus/models/smaCore1Operation.js';

export class SmaInverterDataPoller extends InverterDataPollerBase {
    private smaConnection: SmaConnection;
    private cachedControlsModel: SmaCore1InverterControlModels | null = null;
    private sunSpecInverterIndex: number;

    constructor({
        smaInverterConfig,
        inverterIndex,
        applyControl,
    }: {
        smaInverterConfig: Extract<
            Config['inverters'][number],
            { type: 'sma' }
        >;
        inverterIndex: number;
        applyControl: boolean;
    }) {
        super({
            name: 'SmaInverterDataPoller',
            pollingIntervalMs: 200,
            applyControl,
            inverterIndex,
        });

        this.smaConnection = getSmaConnection(smaInverterConfig);
        this.sunSpecInverterIndex = inverterIndex;

        void this.startPolling();
    }

    override async getInverterData(): Promise<Result<InverterData>> {
        try {
            return await withRetry(
                async () => {
                    const start = performance.now();

                    const gridMsModel =
                        await this.smaConnection.getGridMsModel();

                    writeLatency({
                        field: 'SmaInverterDataPoller',
                        duration: performance.now() - start,
                        tags: {
                            inverterIndex: this.sunSpecInverterIndex.toString(),
                            model: 'gridMs',
                        },
                    });

                    const nameplateModel =
                        await this.smaConnection.getNameplateModel();

                    writeLatency({
                        field: 'SmaInverterDataPoller',
                        duration: performance.now() - start,
                        tags: {
                            inverterIndex: this.sunSpecInverterIndex.toString(),
                            model: 'nameplate',
                        },
                    });

                    const inverterModel =
                        await this.smaConnection.getInverterModel();

                    writeLatency({
                        field: 'SmaInverterDataPoller',
                        duration: performance.now() - start,
                        tags: {
                            inverterIndex: this.sunSpecInverterIndex.toString(),
                            model: 'inverter',
                        },
                    });

                    const operationModel =
                        await this.smaConnection.getOperationModel();

                    writeLatency({
                        field: 'SmaInverterDataPoller',
                        duration: performance.now() - start,
                        tags: {
                            inverterIndex: this.sunSpecInverterIndex.toString(),
                            model: 'operation',
                        },
                    });

                    const inverterControlsModel =
                        await this.smaConnection.getInverterControlModel();

                    writeLatency({
                        field: 'SmaInverterDataPoller',
                        duration: performance.now() - start,
                        tags: {
                            inverterIndex: this.sunSpecInverterIndex.toString(),
                            model: 'inverterControl',
                        },
                    });

                    const models: InverterModels = {
                        inverter: inverterModel,
                        nameplate: nameplateModel,
                        operation: operationModel,
                        gridMs: gridMsModel,
                        inverterControl: inverterControlsModel,
                    };

                    const end = performance.now();
                    const duration = end - start;

                    this.logger.trace(
                        { duration, models },
                        'Got inverter data',
                    );

                    this.cachedControlsModel = inverterControlsModel;

                    const inverterData = generateInverterData(models);

                    return {
                        success: true,
                        value: inverterData,
                    };
                },
                {
                    attempts: 3,
                    delayMilliseconds: 100,
                    functionName: 'get inverter data',
                },
            );
        } catch (error) {
            this.logger.error(error, 'Failed to get inverter data');

            return {
                success: false,
                error: new Error(
                    `Error loading inverter data: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ),
            };
        }
    }

    override onDestroy(): void {
        this.smaConnection.client.close(() => {});
    }

    override async onControl(
        inverterConfiguration: InverterConfiguration,
    ): Promise<void> {
        if (!this.cachedControlsModel) {
            return;
        }

        const writeControlsModel = gemerateSmaCore1InverterControl2({
            inverterConfiguration,
        });

        if (this.applyControl) {
            try {
                const desiredWModCfg_WMod =
                    SmaCore1InverterControlWModCfgWMod.ExternalSetting;

                // only change WModCfg_WMod if the value is not already set
                // this register cannot be written cyclically so it should only be written if necessary
                if (
                    this.cachedControlsModel.WModCfg_WMod !==
                    desiredWModCfg_WMod
                ) {
                    await this.smaConnection.writeInverterControlModel1({
                        WModCfg_WMod: desiredWModCfg_WMod,
                    });
                }

                await this.smaConnection.writeInverterControlModel2(
                    writeControlsModel,
                );
            } catch (error) {
                this.logger.error(
                    error,
                    'Error writing inverter controls value',
                );
            }
        }
    }
}

type InverterModels = {
    inverter: SmaCore1InverterModels;
    nameplate: SmaCore1Nameplate;
    operation: SmaCore1Operation;
    gridMs: SmaCore1GridMsModels;
    inverterControl: SmaCore1InverterControlModels;
};

export function generateInverterData({
    inverter,
    gridMs,
    operation,
}: InverterModels): InverterData {
    return {
        date: new Date(),
        inverter: {
            realPower: gridMs.TotW,
            reactivePower:
                gridMs.VAr_phsA +
                (gridMs.VAr_phsB ?? 0) +
                (gridMs.VAr_phsC ?? 0),
            voltagePhaseA: gridMs.PhV_phsA,
            voltagePhaseB: gridMs.PhV_phsB,
            voltagePhaseC: gridMs.PhV_phsC,
            frequency: gridMs.Hz,
        },
        nameplate: {
            type: DERTyp.PV,
            maxW: inverter.WLim,
            maxVA: inverter.VAMaxOutRtg,
            maxVar: inverter.VArMaxQ1Rtg,
        },
        settings: {
            maxW: inverter.WLim,
            maxVA: inverter.VAMaxOutRtg,
            maxVar: inverter.VArMaxQ1Rtg,
        },
        status: generateInverterDataStatus({ operation }),
    };
}

export function generateInverterDataStatus({
    operation,
}: {
    operation: SmaCore1Operation;
}): InverterData['status'] {
    return {
        operationalModeStatus:
            operation.GriSwStt === SmaCore1OperationGriSwStt.Closed
                ? OperationalModeStatus.OperationalMode
                : OperationalModeStatus.Off,
        genConnectStatus:
            operation.GriSwStt === SmaCore1OperationGriSwStt.Closed
                ? ConnectStatus.Available |
                  ConnectStatus.Connected |
                  ConnectStatus.Operating
                : (0 as ConnectStatus),
    };
}

export function gemerateSmaCore1InverterControl2({
    inverterConfiguration,
}: {
    inverterConfiguration: InverterConfiguration;
}): SmaCore1InverterControl2 {
    switch (inverterConfiguration.type) {
        case 'disconnect':
            return {
                FstStop: SmaCore1InverterControlFstStop.Stop,
                WModCfg_WCtlComCfg_WNomPrc: 0,
            };
        case 'limit':
            return {
                FstStop: SmaCore1InverterControlFstStop.Stop,
                // value in % with two decimal places
                WModCfg_WCtlComCfg_WNomPrc: Math.round(
                    numberWithPow10(
                        Decimal.min(
                            new Decimal(
                                inverterConfiguration.targetSolarPowerRatio,
                            ),
                            1, // cap maximum to 1
                        )
                            .times(100)
                            .toNumber(),
                        2,
                    ),
                ),
            };
    }
}