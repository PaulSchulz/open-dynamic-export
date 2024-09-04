import type { Logger } from 'pino';
import type { InverterControlLimit } from '../../../coordinator/helpers/inverterController';
import type { LimiterType } from '../../../coordinator/helpers/limiter';
import { writeControlLimit } from '../../../helpers/influxdb';
import { logger as pinoLogger } from '../../../helpers/logger';

// https://www.sapowernetworks.com.au/public/download.jsp?id=328119
export class SapnRELE2WLimiter implements LimiterType {
    private logger: Logger;

    constructor() {
        this.logger = pinoLogger.child({ module: 'SapnRELE2WLimiter' });
    }

    getInverterControlLimit(): InverterControlLimit {
        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset();

        // validate the user is configured for the SA timezone
        if (timezoneOffset !== -570 && timezoneOffset !== -630) {
            throw new Error(
                `Two-way tariff limiter requires the timezone to be set to SA, current timezoneOffset ${timezoneOffset}`,
            );
        }

        const nowHour = now.getHours();

        const limit =
            // if within charge window, zero export
            nowHour >= chargeWindow.startHourOfDay &&
            nowHour < chargeWindow.endHourOfDay
                ? {
                      opModConnect: undefined,
                      opModEnergize: undefined,
                      opModExpLimW: 0,
                      opModGenLimW: undefined,
                  }
                : {
                      opModConnect: undefined,
                      opModEnergize: undefined,
                      opModExpLimW: undefined,
                      opModGenLimW: undefined,
                  };

        writeControlLimit({ limit, name: 'sapnRELE2W' });

        return limit;
    }
}

// The pricing signals and structure are designed to encourage self consumption rather than export during the Solar Sponge window of 10am – 4pm.
const chargeWindow: Window = {
    startHourOfDay: 10,
    endHourOfDay: 16,
};

// In the summer peak of November to March, 5pm – 9pm, customers are encouraged to export into the distribution network to access a credit.
// TODO: reduce load or export battery during reward window
const rewardWindow: {
    months: number[];
    hourOfDay: Window;
} = {
    months: [
        10, // november
        11, // december
        0, // january
        1, // february
        2, // march
    ],
    hourOfDay: {
        startHourOfDay: 16,
        endHourOfDay: 22,
    },
};

type Window = {
    startHourOfDay: number;
    endHourOfDay: number;
};