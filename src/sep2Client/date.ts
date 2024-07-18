import { safeParseIntString } from '../number';

export function stringIntToDate(value: string): Date {
    const valueInt = safeParseIntString(value);
    return new Date(valueInt * 1000);
}