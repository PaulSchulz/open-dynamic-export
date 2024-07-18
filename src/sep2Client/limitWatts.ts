import { safeParseIntString } from '../number';
import { assertString } from './assert';

export type LimitWatts = {
    value: number;
    powerOfTenMultiplier: number;
    watts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLimitWattsXmlObject(xmlObject: any): LimitWatts {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    const value = safeParseIntString(assertString(xmlObject['value'][0]));
    const powerOfTenMultiplier = safeParseIntString(
        assertString(xmlObject['multiplier'][0]),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    return {
        value,
        powerOfTenMultiplier,
        watts: value * 10 ** powerOfTenMultiplier,
    };
}