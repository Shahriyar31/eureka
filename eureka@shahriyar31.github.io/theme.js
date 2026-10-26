// SPDX-License-Identifier: GPL-2.0-or-later
// Material-style tonal palette for the Eureka panel, computed from one accent colour.
// St's CSS cannot mix colours, so the tones are worked out here and applied as inline styles.

/** GNOME 47+ accent names (org.gnome.desktop.interface accent-color) and their Adwaita colours. */
export const SYSTEM_ACCENTS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00',
    red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

function parse(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
    const n = parseInt(full, 16);
    return Number.isNaN(n) ? [53, 132, 228] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function css(rgb, alpha = 1) {
    return alpha >= 1 ? `rgb(${rgb.join(', ')})` : `rgba(${rgb.join(', ')}, ${alpha.toFixed(3)})`;
}

function luminance([r, g, b]) {
    const lin = c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * @param {string} accentHex  the seed colour
 * @param {boolean} dark      dark or light scheme
 * @param {number} opacity    panel opacity, 0–1
 * @returns {object} CSS colour strings for every surface the panel draws
 */
export function palette(accentHex, dark, opacity = 0.96) {
    const accent = parse(accentHex);
    const base = dark ? [20, 18, 24] : [254, 247, 255];
    const ink = dark ? [230, 224, 233] : [29, 27, 32];
    const tone = t => mix(base, accent, t);
    // primary that keeps contrast on the surface: lighter in dark mode, deeper in light mode
    const primary = dark ? mix(accent, [255, 255, 255], 0.35) : mix(accent, [0, 0, 0], 0.18);
    const onPrimary = luminance(primary) > 0.45 ? [20, 18, 24] : [255, 255, 255];
    return {
        surface: css(tone(dark ? 0.06 : 0.04), opacity),
        outline: css(dark ? [255, 255, 255] : [0, 0, 0], dark ? 0.08 : 0.07),
        searchField: css(tone(dark ? 0.16 : 0.11)),
        divider: css(dark ? [255, 255, 255] : [0, 0, 0], 0.06),
        text: css(ink),
        textVariant: css(mix(ink, base, 0.32)),
        hint: css(mix(ink, base, 0.5)),
        primary: css(primary),
        onPrimary: css(onPrimary),
        hover: css(tone(dark ? 0.14 : 0.09)),
        selected: css(tone(dark ? 0.30 : 0.22)),
        onSelected: css(dark ? mix(ink, [255, 255, 255], 0.5) : mix(ink, [0, 0, 0], 0.3)),
        iconContainer: css(tone(dark ? 0.24 : 0.17)),
        iconColor: css(primary),
        section: css(primary),
        shadow: dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(40, 20, 60, 0.22)',
        backdrop: dark ? [0, 0, 0] : [30, 20, 40],
    };
}
