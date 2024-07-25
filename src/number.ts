export function safeParseIntString(value: string): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Value "${value}" is not a valid number`);
    }
    return parsed;
}

export function safeParseHexString(value: string): number {
    const parsed = parseInt(value, 16);
    if (isNaN(parsed)) {
        throw new Error(`Value "${value}" is not a valid hex`);
    }
    return parsed;
}

export function numberToHex(value: number): string {
    return value.toString(16).toUpperCase();
}

export function numberWithPow10(number: number, pow10: number): number {
    return number * 10 ** pow10;
}
