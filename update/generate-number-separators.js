// -----------------------------------------------------------------------------
// generate-number-separators.js
// -----------------------------------------------------------------------------
// Regenerates the locale → "decimal+group" separator map that lives in
//   banknote/src/separators.js
// using data from the *modern* or *full* CLDR JSON packages.
//
// ▸ Primary source:   cldr-numbers-modern  (≈ most‑used locales)
// ▸ Fallback source:  cldr-numbers-full   (all locales)
//
// The public API remains identical to the historical generator so existing
// update scripts keep working:
//     const generate = require('./update/generate-number-separators');
//     generate(dataDir?, outputFileName);
//
// If *dataDir* is omitted or points at a non‑existent folder, the script will
// auto‑detect an installed CLDR numbers package and use its `main/` directory
// as the data source.  This makes the transition away from the deprecated
// `cldr-data` package entirely transparent to callers.
// -----------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Locate the `main/` directory of an installed CLDR numbers package.
 * Preference order:   cldr-numbers-modern → cldr-numbers-full.
 * Throws if neither package can be resolved.
 */
function findCldrNumbersMain () {
    const candidates = [
        'cldr-numbers-full'
    ];

    for (const pkg of candidates) {
        try {
            const pkgRoot  = path.dirname(require.resolve(`${pkg}/package.json`));
            const mainDir  = path.join(pkgRoot, 'main');
            if (fs.existsSync(mainDir)) return mainDir; // ← success!
        } catch (_) { /* package not installed – try next */ }
    }

    throw new Error('[generate-number-separators] Cannot locate a CLDR numbers package.  Install `cldr-numbers-modern` (or -full) first.');
}

/**
 * Push a locale onto the cache bucket *iff* its *language* subtag hasn\'t been
 * recorded there yet.  This roughly mimics the behaviour of the original
 * generator which tried to avoid redundant aliases while still keeping one
 * representative locale for each language.
 */
function pushUniqueByLanguage (bucket, locale) {
    const language = locale.match(/^([a-zA-Z]{2,4})[-_]?/)[1];
    if (!bucket.some(l => l.startsWith(language))) {
        bucket.push(locale);
    }
}

// -----------------------------------------------------------------------------
// Main exporter
// -----------------------------------------------------------------------------

module.exports = function generateNumberSeparators (dataDir, outputFileName) {
    // Allow callers to omit the *dataDir* argument and pass only the output file
    // path ➞ generate(outputFileName)
    if (outputFileName === undefined) {
        outputFileName = dataDir || path.join(__dirname, '../separators.js');
        dataDir = undefined;
    }

    // Resolve *dataDir* if missing or invalid
    if (!dataDir || !fs.existsSync(dataDir)) {
        dataDir = findCldrNumbersMain();
    }

    // ---------------------------------------------------------------------------
    // Harvest separator pairs into a { "decimal+group" : [locale,…] } cache
    // ---------------------------------------------------------------------------

    const ruleCache = Object.create(null);
    const locales   = fs.readdirSync(dataDir).filter(name => !name.startsWith('.'));

    locales.forEach(locale => {
        const numbersPath = path.join(dataDir, locale, 'numbers.json');
        if (!fs.existsSync(numbersPath)) return; // skip missing files

        const numbers = JSON.parse(fs.readFileSync(numbersPath, 'utf8'));

        const symbols = numbers.main[locale].numbers['symbols-numberSystem-latn'];
        if (!symbols) return; // locales without a Latin numbering system are ignored

        const decimal = symbols.currencyDecimal === undefined ? symbols.decimal : symbols.currencyDecimal;
        const key = decimal + symbols.group; // two code points concatenated
        if (key.length !== 2) {
            console.warn(`\u00A0⚠️ Locale ${locale} has a separator longer than 1 code point – skipped.`);
            return;
        }

        ruleCache[key] ||= [];
        pushUniqueByLanguage(ruleCache[key], locale);
    });

    // ---------------------------------------------------------------------------
    // Serialise to separators.js (same format as historical generator)
    // ---------------------------------------------------------------------------

    let output = 'var separators = {};\n\n';

    Object.keys(ruleCache).sort().forEach(pair => {
        const locs   = ruleCache[pair].sort();
        const lhs    = locs.map(l => `separators['${l}']`).join(' = \n');
        const rhs    = pair.replace(/'/g, '\\\''); // escape lone quotes
        output += `${lhs} = '${rhs}';\n\n`;
    });

    output += 'module.exports = separators;\n';
    fs.writeFileSync(outputFileName, output, 'utf8');
    console.info(`\u00A0💾 Saved ${Object.keys(ruleCache).map(k => ruleCache[k].length).reduce((sum, num) => sum + num)} locales in ${Object.keys(ruleCache).length} separator groups to ${outputFileName}`);
};
