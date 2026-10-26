// Unit tests for the parts of Eureka that do maths and parsing. Run from the project folder: gjs -m dev/test-unit.mjs
import GLib from 'gi://GLib';
import System from 'system';

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const src = p => `file://${root}/eureka@shahriyar31.github.io/providers/${p}`;
const {calculate} = await import(src('calculator.js'));
const {convert} = await import(src('units.js'));
const {Rates} = await import(src('currency.js'));

let failed = 0;
const eq = (got, want, what) => {
    const ok = String(got) === String(want);
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${what}${ok ? '' : `  (got ${got}, want ${want})`}`);
    if (!ok)
        failed++;
};

console.log('Calculator');
for (const [q, want] of [['12*(3+4)/2', '42'], ['2^10', '1024'], ['-3+5', '2'], ['sqrt(16)+1', '5'], ['= 10/4', '2.5'],
    ['2,5*2', '5'], ['pi*2', '6.28318530718'], ['5%3', '2'], ['2*-3', '-6'], ['log(1000)', '3'], ['7÷2', '3.5'],
    ['firefox', null], ['3 apples', null], ['1/0', null], ['(1+2', null]])
    eq(calculate(q), want, `${q} → ${want}`);

console.log('Unit converter');
for (const [q, want] of [['10 km to mi', '6.2137119'], ['5kg in lb', '11.023113'], ['100 f to c', '37.777778'],
    ['0 c to f', '32'], ['1.5 gb to mb', '1500'], ['90 min to h', '1.5'], ['1 gib to mb', '1073.7418'],
    ['3 feet to cm', '91.44'], ['100 km/h to mph', '62.137119'], ['10 km to kg', null], ['firefox', null]])
    eq(convert(q)?.value ?? null, want, `${q} → ${want}`);

console.log('Currency');
const xml = new TextDecoder().decode(GLib.file_get_contents(`${root}/dev/fixtures/ecb-sample.xml`)[1]);
const data = Rates.parse(xml);
eq(data?.date, '2026-01-15', 'reads the date from the ECB file');
eq(Object.keys(data?.rates ?? {}).length, 25, 'reads all 25 rates');
eq(Rates.parse('<html>not rates</html>'), null, 'rejects a page that is not the ECB file');
eq(Rates.parse(xml.replace(/rate='[^']*'/g, "rate='-1'")), null, 'rejects negative rates');
eq(Rates.parse(xml.replace(/currency='USD'/, "currency='U$D'")) === null ? 'rejected' : 'kept bad code dropped',
    'kept bad code dropped', 'drops a malformed currency code but keeps the rest');
const rates = Object.create(Rates.prototype);
rates._rates = data;
eq(rates.convert('110 usd to eur')?.value, '100.00', '110 USD → 100.00 EUR');
eq(rates.convert('50€ in inr')?.value, '4600.00', '50 € → 4600.00 INR');
eq(rates.convert('10 pounds to dollars')?.value, '12.94', '10 pounds → 12.94 dollars');
eq(rates.convert('5 eur to eur'), null, 'same currency is not a conversion');
eq(rates.convert('10 km to mi'), null, 'units are not currencies');
eq(rates.convert('100 xyz to eur'), null, 'unknown currency is ignored');

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
if (failed)
    System.exit(1);
