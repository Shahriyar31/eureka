// SPDX-License-Identifier: GPL-2.0-or-later
// Offline unit conversion: "10 km to mi", "5kg in lb", "100 f to c", "1.5 gb to mb", "90 min to h".

// factor to the base unit of each kind (temperature is handled separately)
const UNITS = {
    length: {m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048,
        in: 0.0254, nmi: 1852},
    mass: {kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318},
    volume: {l: 1, ml: 0.001, cl: 0.01, dl: 0.1, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473,
        cup: 0.2365882365, floz: 0.0295735295625},
    time: {s: 1, ms: 0.001, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600},
    data: {b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4},
    speed: {'m/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444},
    area: {m2: 1, km2: 1e6, cm2: 1e-4, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336},
};
const ALIASES = {
    meter: 'm', meters: 'm', metre: 'm', kilometer: 'km', kilometers: 'km', mile: 'mi', miles: 'mi', foot: 'ft',
    feet: 'ft', inch: 'in', inches: 'in', yard: 'yd', yards: 'yd', kilogram: 'kg', kilograms: 'kg', kilo: 'kg',
    kilos: 'kg', gram: 'g', grams: 'g', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz',
    liter: 'l', liters: 'l', litre: 'l', gallon: 'gal', gallons: 'gal', second: 's', seconds: 's', sec: 's',
    minute: 'min', minutes: 'min', mins: 'min', hour: 'h', hours: 'h', hr: 'h', day: 'd', days: 'd', week: 'wk',
    weeks: 'wk', year: 'yr', years: 'yr', kph: 'km/h', kmh: 'km/h', knots: 'kn', 'm²': 'm2', 'km²': 'km2',
    'cm²': 'cm2', 'ft²': 'ft2', 'mi²': 'mi2', 'm³': 'm3', acres: 'acre', celsius: 'c', fahrenheit: 'f', kelvin: 'k',
    '°c': 'c', '°f': 'f', bytes: 'b', byte: 'b',
};
const TEMPERATURE = {
    c: {to: v => v, from: v => v},
    f: {to: v => (v - 32) * 5 / 9, from: v => v * 9 / 5 + 32},
    k: {to: v => v - 273.15, from: v => v + 273.15},
};

function unit(raw) {
    const u = raw.toLowerCase();
    return ALIASES[u] ?? u;
}

function kindOf(u) {
    return Object.keys(UNITS).find(k => u in UNITS[k]);
}

function format(v) {
    const abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-4))
        return v.toExponential(4);
    return String(Number(v.toPrecision(8)));
}

/** Returns {text, value} for a conversion query, or null. */
export function convert(query) {
    const m = query.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*([a-z°²³\/]+)\s+(?:to|in|as|=)\s+([a-z°²³\/]+)$/i);
    if (!m)
        return null;
    const value = parseFloat(m[1].replace(',', '.'));
    const from = unit(m[2]), to = unit(m[3]);
    if (from in TEMPERATURE && to in TEMPERATURE) {
        const out = TEMPERATURE[to].from(TEMPERATURE[from].to(value));
        const sym = u => (u === 'k' ? ' K' : ` °${u.toUpperCase()}`);
        return {text: `${format(value)}${sym(from)} = ${format(out)}${sym(to)}`, value: format(out)};
    }
    const kind = kindOf(from);
    if (!kind || kindOf(to) !== kind)
        return null;
    const out = value * UNITS[kind][from] / UNITS[kind][to];
    return {text: `${format(value)} ${from} = ${format(out)} ${to}`, value: format(out)};
}
