// The following values are recommended values sourced from the unit of measure enumeration in IEC 61968-9 [61968]. Other values from the unit of measure enumeration in IEC 61968-9 [61968] MAY be used.
// 0 = Not Applicable (default, if not specified)
// 5 = A (Current in Amperes (RMS))
// 6 = Kelvin (Temperature)
// 23 = Degrees Celsius (Relative temperature)
// 29 = Voltage
// 31 = J (Energy joule)
// 33 = Hz (Frequency)
// 38 = W (Real power in Watts)
// 42 = m3 (Cubic Meter)
// 61 = VA (Apparent power)
// 63 = var (Reactive power)
// 65 = CosTheta (Displacement Power Factor)
// 67 = V² (Volts squared)
// 69 = A² (Amp squared)
// 71 = VAh (Apparent energy)
// 72 = Wh (Real energy in Watt-hours)
// 73 = varh (Reactive energy)
// 106 = Ah (Ampere-hours / Available Charge)
// 119 = ft3 (Cubic Feet)
// 122 = ft3/h (Cubic Feet per Hour)
// 125 = m3/h (Cubic Meter per Hour)
// 128 = US gl (US Gallons)
// 129 = US gl/h (US Gallons per Hour)
// 130 = IMP gl (Imperial Gallons)
// 131 = IMP gl/h (Imperial Gallons per Hour)
// 132 = BTU
// 133 = BTU/h
// 134 = Liter
// 137 = L/h (Liters per Hour)
// 140 = PA(gauge)
// 155 = PA(absolute)
// 169 = Therm
export enum UomType {
    NotApplicable = '0',
    A = '5',
    Kelvin = '6',
    DegreesCelsius = '23',
    Voltage = '29',
    J = '31',
    Hz = '33',
    W = '38',
    CubicMeter = '42',
    VA = '61',
    var = '63',
    CosTheta = '65',
    V2 = '67',
    A2 = '69',
    VAh = '71',
    Wh = '72',
    varh = '73',
    Ah = '106',
    CubicFeet = '119',
    CubicFeetPerHour = '122',
    CubicMeterPerHour = '125',
    USGallons = '128',
    USGallonsPerHour = '129',
    ImperialGallons = '130',
    ImperialGallonsPerHour = '131',
    BTU = '132',
    BTUPerHour = '133',
    Liter = '134',
    LitersPerHour = '137',
    PAGauge = '140',
    PAAbsolute = '155',
    Therm = '169',
}