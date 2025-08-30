const fs = require('node:fs');
const path = require('node:path');

/**
 * Generate a map of ISO 4217 currency code -> CLDR "narrow" symbol
 * (i.e. the value of `symbol-alt-narrow` from the English locale),
 * using the modern Unicode CLDR JSON distribution.
 *
 * Usage (backward compatible):
 *   module.exports = function (dataDir, outputFileName) { ... }
 *   - If only one argument is provided, it's treated as outputFileName and the
 *     script auto-discovers the installed CLDR package.
 *   - If dataDir is provided, it may be the root of a CLDR package, the `main/`
 *     folder, or the `main/en/` folder.
 */
module.exports = function generateCurrencySymbolMap(dataDir, outputFileName) {
    if (!outputFileName) { // support old signature: (outputFileName)
        outputFileName = dataDir;
        dataDir = undefined;
    }

    const currenciesPath = resolveCurrenciesJsonPath(dataDir);
    const info = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));

    // CLDR structure: { main: { en: { numbers: { currencies: { USD: {...} } } } } }
    const locale = Object.keys(info.main)[0]; // should be 'en'
    const data = info.main[locale].numbers.currencies || {};

    const map = {};
    for (const code of Object.keys(data).sort()) {
        const entry = data[code] || {};
        const narrow = entry['symbol-alt-narrow'];
        if (typeof narrow === 'string' && narrow.length > 0) {
            map[code] = narrow;
        } else {
            console.info(`\u00A0️ℹ️ Currency ${code} has no narrow symbol; skipped.`);
        }
    }

    const output = 'module.exports = ' + toSingleQuotedJson(map) + ';\n';
    fs.writeFileSync(outputFileName, output);
    console.info(`\u00A0💾 Saved ${Object.keys(map).length} narrow currency symbols of ${Object.keys(data).length} known currencies to ${outputFileName}`);
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function resolveCurrenciesJsonPath(base) {
    const candidates = [];

    if (base) {
        const b = path.resolve(base);
        candidates.push(path.join(b, 'main', 'en', 'currencies.json'));
        candidates.push(path.join(b, 'en', 'currencies.json'));
        candidates.push(path.join(b, 'currencies.json'));
    }

    try {
        const modernRoot = path.dirname(require.resolve('cldr-numbers-modern/package.json'));
        candidates.push(path.join(modernRoot, 'main', 'en', 'currencies.json'));
    } catch (_) { /* ignore */ }

    try {
        const fullRoot = path.dirname(require.resolve('cldr-numbers-full/package.json'));
        candidates.push(path.join(fullRoot, 'main', 'en', 'currencies.json'));
    } catch (_) { /* ignore */ }

    // Optional backward-compat with deprecated cldr-data package
    try {
        const legacyRoot = path.dirname(require.resolve('cldr-data/package.json'));
        candidates.push(path.join(legacyRoot, 'main', 'en', 'currencies.json'));
    } catch (_) { /* ignore */ }

    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }

    const hint = base ? ('searched under ' + base) : 'install devDependency `cldr-numbers-modern` or `cldr-numbers-full`';
    throw new Error('Unable to locate CLDR currencies.json; ' + hint);
}

function toSingleQuotedJson(obj) {
    return JSON.stringify(obj, null, 4).replace(/\"/g, '\'');
}
