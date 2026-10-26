// SPDX-License-Identifier: GPL-2.0-or-later
// Currency conversion with the European Central Bank's daily reference rates (about 30 currencies, base EUR).
// Opt-in. The same public file is downloaded at most every 12 hours, independent of what you type: searches
// never leave the computer. Rates are cached in ~/.cache/eureka/ecb-rates.json and checked before use.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const MAX_AGE_S = 12 * 3600;
const MAX_BYTES = 64 * 1024;
const SYMBOLS = {'€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₺': 'TRY', '₱': 'PHP',
    'r$': 'BRL', 'chf': 'CHF', euro: 'EUR', euros: 'EUR', dollar: 'USD', dollars: 'USD', pound: 'GBP', pounds: 'GBP',
    yen: 'JPY', rupee: 'INR', rupees: 'INR', yuan: 'CNY', franc: 'CHF', francs: 'CHF'};

const cacheFile = () => GLib.build_filenamev([GLib.get_user_cache_dir(), 'eureka', 'ecb-rates.json']);

/** Keeps the latest checked rates; downloads only on request and only when stale. */
export class Rates {
    constructor() {
        this._rates = null;   // {date, rates: {USD: 1.08, …}, fetched: unix seconds}
        this._session = null;
        this._cancellable = new Gio.Cancellable();
        this._load();
    }

    get date() {
        return this._rates?.date ?? null;
    }

    _load() {
        try {
            const [, bytes] = GLib.file_get_contents(cacheFile());
            const data = JSON.parse(new TextDecoder().decode(bytes));
            if (Rates.valid(data))
                this._rates = data;
        } catch {
            // no cache yet: the first refresh() fills it
        }
    }

    /** True when `data` has a date, a fetch time and at least 20 positive finite rates with ISO codes. */
    static valid(data) {
        return Boolean(data && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && Number.isFinite(data.fetched) &&
            data.rates && Object.keys(data.rates).length >= 20 &&
            Object.entries(data.rates).every(([k, v]) => /^[A-Z]{3}$/.test(k) && Number.isFinite(v) && v > 0));
    }

    /** Parses the ECB XML; returns null unless it looks exactly as expected. */
    static parse(xml) {
        const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
        const rates = {};
        for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9]+(?:\.[0-9]+)?)['"]/g))
            rates[m[1]] = parseFloat(m[2]);
        const data = {date, rates, fetched: Math.floor(GLib.get_real_time() / 1e6)};
        return Rates.valid(data) ? data : null;
    }

    /** Downloads fresh rates in the background if the cached ones are older than 12 hours; onUpdate() when new. */
    refresh(onUpdate = null) {
        const now = Math.floor(GLib.get_real_time() / 1e6);
        if (this._busy || (this._rates && now - this._rates.fetched < MAX_AGE_S))
            return;
        this._busy = true;
        this._session ??= new Soup.Session({timeout: 10, user_agent: 'Eureka GNOME Shell extension'});
        const message = Soup.Message.new('GET', URL);
        this._session.send_and_read_async(message, GLib.PRIORITY_LOW, this._cancellable, (session, res) => {
            this._busy = false;
            try {
                const bytes = session.send_and_read_finish(res);
                if (message.get_status() !== Soup.Status.OK || bytes.get_size() > MAX_BYTES)
                    return;
                const data = Rates.parse(new TextDecoder().decode(bytes.get_data()));
                if (!data)
                    return;
                this._rates = data;
                GLib.mkdir_with_parents(GLib.path_get_dirname(cacheFile()), 0o700);
                GLib.file_set_contents(cacheFile(), JSON.stringify(data));
                onUpdate?.();
            } catch {
                // offline, cancelled or refused: keep the cached rates
            }
        });
    }

    /** "100 usd to eur", "50€ in inr", "20 pounds to dollars" → {text, value, date} or null. */
    convert(query) {
        if (!this._rates)
            return null;
        const m = query.trim().toLowerCase()
            .match(/^(\d+(?:[.,]\d+)?)\s*([a-z]{3}|[a-z]+|[€$£¥₹₩₺₱]|r\$)\s+(?:to|in|=)\s+([a-z]{3}|[a-z]+|[€$£¥₹₩₺₱]|r\$)$/);
        if (!m)
            return null;
        const code = c => (SYMBOLS[c] ?? c.toUpperCase());
        const from = code(m[2]), to = code(m[3]);
        const rate = c => (c === 'EUR' ? 1 : this._rates.rates[c]);
        if (!rate(from) || !rate(to) || from === to)
            return null;
        const amount = parseFloat(m[1].replace(',', '.'));
        const out = amount / rate(from) * rate(to);
        const fmt = v => v.toLocaleString(undefined, v < 1 ? {maximumFractionDigits: 6} : {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const typed = amount.toLocaleString(undefined, {maximumFractionDigits: 6});
        return {text: `${typed} ${from} = ${fmt(out)} ${to}`, value: out.toFixed(out < 1 ? 6 : 2), date: this.date};
    }

    destroy() {
        this._cancellable.cancel();
        this._session?.abort();
        this._session = null;
    }
}
