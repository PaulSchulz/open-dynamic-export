import type { ControlsModel } from '../sunspec/models/controls';
import type { InverterModel } from '../sunspec/models/inverter';
import type { MeterModel } from '../sunspec/models/meter';
import {
    getSunSpecTelemetry,
    type SunSpecTelemetry,
} from './telemetry/sunspec';
import type { InverterSunSpecConnection } from '../sunspec/connection/inverter';
import type { MeterSunSpecConnection } from '../sunspec/connection/meter';
import { getAveragePowerRatio } from '../sunspec/helpers/controls';
import EventEmitter from 'events';
import { logger as pinoLogger } from '../logger';

const logger = pinoLogger.child({ module: 'sunspec-data-event-emitter' });

export class SunSpecDataEventEmitter extends EventEmitter<{
    data: [
        {
            invertersData: {
                inverter: InverterModel;
                controls: ControlsModel;
            }[];
            metersData: {
                meter: MeterModel;
            }[];
            telemetry: SunSpecTelemetry;
            currentAveragePowerRatio: number;
        },
    ];
}> {
    private invertersConnections: InverterSunSpecConnection[];
    private metersConnections: MeterSunSpecConnection[];

    constructor({
        invertersConnections,
        metersConnections,
    }: {
        invertersConnections: InverterSunSpecConnection[];
        metersConnections: MeterSunSpecConnection[];
    }) {
        super();

        this.invertersConnections = invertersConnections;
        this.metersConnections = metersConnections;

        void this.run();
    }

    async run() {
        try {
            logger.debug('fetching data from inverter connections');

            // get necessary inverter data
            const invertersData = await Promise.all(
                this.invertersConnections.map(async (inverter) => {
                    return {
                        inverter: await inverter.getInverterModel(),
                        controls: await inverter.getControlsModel(),
                    };
                }),
            );

            logger.debug(invertersData, 'inverters data');

            logger.debug('fetching data from inverter connections');

            // get necessary meter data
            const metersData = await Promise.all(
                this.metersConnections.map(async (meter) => {
                    return {
                        meter: await meter.getMeterModel(),
                    };
                }),
            );

            logger.debug(metersData, 'meters data');

            // calculate telemetry data
            const telemetry = getSunSpecTelemetry({
                inverters: invertersData.map(({ inverter }) => inverter),
                meters: metersData.map(({ meter }) => meter),
            });

            logger.debug(telemetry, 'telemetry');

            // calculate current average inverter power ratio
            const currentAveragePowerRatio = getAveragePowerRatio(
                invertersData.map(({ controls }) => controls),
            );

            logger.debug(
                `current average power ratio: ${currentAveragePowerRatio}`,
            );

            this.emit('data', {
                invertersData,
                metersData,
                telemetry,
                currentAveragePowerRatio,
            });
        } catch (error) {
            logger.error(error, 'Failed to fetch SunSpec data');
        } finally {
            setTimeout(
                () => {
                    void this.run();
                },
                // we execute this loop every 1 second to meet sampling requirements and dynamic export requirements
                // CSIP-AUS requires average readings to be sampled at least every 5 seconds (see SA Power Networks – Dynamic Exports Utility Interconnection Handbook)
                1000,
            );
        }
    }
}