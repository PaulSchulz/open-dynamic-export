import {
    numberNullableWithPow10,
    numberWithPow10,
    sumNumbersArray,
    sumNumbersNullableArray,
} from '../../number';
import { type NameplateModel } from '../models/nameplate';

export function getNameplateMetrics(nameplate: NameplateModel) {
    return {
        DERTyp: nameplate.DERTyp,
        WRtg: numberWithPow10(nameplate.WRtg, nameplate.WRtg_SF),
        VARtg: numberWithPow10(nameplate.VARtg, nameplate.VARtg_SF),
        VArRtgQ1: numberWithPow10(nameplate.VArRtgQ1, nameplate.VArRtg_SF),
        VArRtgQ2: numberNullableWithPow10(
            nameplate.VArRtgQ2,
            nameplate.VArRtg_SF,
        ),
        VArRtgQ3: numberNullableWithPow10(
            nameplate.VArRtgQ3,
            nameplate.VArRtg_SF,
        ),
        VArRtgQ4: numberWithPow10(nameplate.VArRtgQ4, nameplate.VArRtg_SF),
        ARtg: numberWithPow10(nameplate.ARtg, nameplate.ARtg_SF),
        PFRtgQ1: numberWithPow10(nameplate.PFRtgQ1, nameplate.PFRtg_SF),
        PFRtgQ2: numberNullableWithPow10(nameplate.PFRtgQ2, nameplate.PFRtg_SF),
        PFRtgQ3: numberNullableWithPow10(nameplate.PFRtgQ3, nameplate.PFRtg_SF),
        PFRtgQ4: numberWithPow10(nameplate.PFRtgQ4, nameplate.PFRtg_SF),
        WHRtg:
            nameplate.WHRtg && nameplate.WHRtg_SF
                ? numberWithPow10(nameplate.WHRtg, nameplate.WHRtg_SF)
                : null,
        AhrRtg:
            nameplate.AhrRtg && nameplate.AhrRtg_SF
                ? numberWithPow10(nameplate.AhrRtg, nameplate.AhrRtg_SF)
                : null,
        MaxChaRte:
            nameplate.MaxChaRte && nameplate.MaxChaRte_SF
                ? numberWithPow10(nameplate.MaxChaRte, nameplate.MaxChaRte_SF)
                : null,
        MaxDisChaRte:
            nameplate.MaxDisChaRte && nameplate.MaxDisChaRte_SF
                ? numberWithPow10(
                      nameplate.MaxDisChaRte,
                      nameplate.MaxDisChaRte_SF,
                  )
                : null,
    };
}

export function getAggregatedNameplateMetrics(nameplates: NameplateModel[]) {
    const metrics = nameplates.map(getNameplateMetrics);

    const firstNameplate = metrics.at(0);
    if (!firstNameplate) {
        throw new Error('At least one nameplate must be provided');
    }

    const DERTyp = firstNameplate.DERTyp;

    if (metrics.some((metric) => metric.DERTyp !== DERTyp)) {
        throw new Error('Different DERTyp detected across nameplates');
    }

    return {
        DERTyp,
        WRtg: sumNumbersArray(metrics.map((metric) => metric.WRtg)),
        VARtg: sumNumbersArray(metrics.map((metric) => metric.VARtg)),
        VArRtgQ1: sumNumbersArray(metrics.map((metric) => metric.VArRtgQ1)),
        VArRtgQ2: sumNumbersNullableArray(
            metrics.map((metric) => metric.VArRtgQ2),
        ),
        VArRtgQ3: sumNumbersNullableArray(
            metrics.map((metric) => metric.VArRtgQ3),
        ),
        VArRtgQ4: sumNumbersArray(metrics.map((metric) => metric.VArRtgQ4)),
        ARtg: sumNumbersArray(metrics.map((metric) => metric.ARtg)),
        PFRtgQ1: sumNumbersArray(metrics.map((metric) => metric.PFRtgQ1)),
        PFRtgQ2: sumNumbersNullableArray(
            metrics.map((metric) => metric.PFRtgQ2),
        ),
        PFRtgQ3: sumNumbersNullableArray(
            metrics.map((metric) => metric.PFRtgQ3),
        ),
        PFRtgQ4: sumNumbersArray(metrics.map((metric) => metric.PFRtgQ4)),
        WHRtg: sumNumbersNullableArray(metrics.map((metric) => metric.WHRtg)),
        AhrRtg: sumNumbersNullableArray(metrics.map((metric) => metric.AhrRtg)),
        MaxChaRte: sumNumbersNullableArray(
            metrics.map((metric) => metric.MaxChaRte),
        ),
        MaxDisChaRte: sumNumbersNullableArray(
            metrics.map((metric) => metric.MaxDisChaRte),
        ),
    };
}