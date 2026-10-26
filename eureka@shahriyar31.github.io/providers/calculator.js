// SPDX-License-Identifier: GPL-2.0-or-later
// A small, safe maths parser (no eval): + - * / % ^, brackets, functions and constants.

const FUNCTIONS = {
    sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    ln: Math.log, log: Math.log10, exp: Math.exp,
};
const CONSTANTS = {pi: Math.PI, e: Math.E};

function tokenize(text) {
    const tokens = [];
    // eslint-disable-next-line no-useless-escape -- the escaped / keeps code parsers (xgettext, Shexli) from misreading
    const re = /\s*(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*\/%^()×÷])/giy;
    let m;
    while (re.lastIndex < text.length) {
        m = re.exec(text);
        if (!m)
            return null;
        tokens.push(m[1]);
        if (re.lastIndex === text.length || /^\s*$/.test(text.slice(re.lastIndex)))
            break;
    }
    return tokens;
}

function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    function primary() {
        const t = next();
        if (t === undefined)
            throw new Error('end');
        if (t === '(') {
            const v = expr();
            if (next() !== ')')
                throw new Error('bracket');
            return v;
        }
        if (/^\d/.test(t))
            return parseFloat(t.replace(',', '.'));
        const name = t.toLowerCase();
        if (name in CONSTANTS)
            return CONSTANTS[name];
        if (name in FUNCTIONS) {
            if (next() !== '(')
                throw new Error('call');
            const v = expr();
            if (next() !== ')')
                throw new Error('bracket');
            return FUNCTIONS[name](v);
        }
        throw new Error(`unknown ${t}`);
    }
    function unary() {
        if (peek() === '-') {
            next();
            return -unary();
        }
        if (peek() === '+') {
            next();
            return unary();
        }
        return power();
    }
    function power() {
        const base = primary();
        if (peek() === '^' || peek() === '**') {
            next();
            return base ** unary();
        }
        return base;
    }
    function term() {
        let v = unary();
        while (['*', '/', '%', '×', '÷'].includes(peek())) {
            const op = next();
            const r = unary();
            v = op === '*' || op === '×' ? v * r : op === '%' ? v % r : v / r;
        }
        return v;
    }
    function expr() {
        let v = term();
        while (peek() === '+' || peek() === '-')
            v = next() === '+' ? v + term() : v - term();
        return v;
    }
    const value = expr();
    if (i !== tokens.length)
        throw new Error('trailing');
    return value;
}

/** Returns the result as text, or null when the query is not a calculation. */
export function calculate(query) {
    const text = query.replace(/^=\s*/, '').trim();
    // eslint-disable-next-line no-useless-escape -- the escaped / keeps code parsers (xgettext, Shexli) from misreading
    if (!/\d/.test(text) || !/[-+*\/%^()×÷]|[a-z]\(/i.test(text))
        return null;
    const tokens = tokenize(text);
    if (!tokens || !tokens.length)
        return null;
    try {
        const v = parse(tokens);
        if (!Number.isFinite(v))
            return null;
        return String(Number.isInteger(v) ? v : Number(v.toPrecision(12)));
    } catch {
        return null;
    }
}
