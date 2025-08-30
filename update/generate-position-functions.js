const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const requireFromHere = createRequire(__filename);

const LEFT_TO_RIGHT_MARK = '\u200e';
const CURRENCY_SYMBOL_VAR_NAME = 'symbol';
const AMOUNT_VAR_NAME = 'amount';
const MINUS_VAR_NAME = 'minus';

/**
 * Convert a CLDR currency‐pattern string (e.g. "¤ #,##0.00" or
 * "#,##0.00 ¤;(#,##0.00 ¤)") into a JS expression that concatenates the runtime
 * variables *symbol*, *amount*, *minus* plus any literal glue.
 */
function transformPatternIntoJsExpression(pattern, patternType) {
    let hasCustomMinusPosition = false;
    let hasLeftToRightMark = false;
    const parts = [];


    pattern.replace(/(\u00a4)|(-)|([#0.,]+)|([^\u00a4#0.,-]+)/g, function (
        _part,
        symbol,
        minus,
        amount,
        rest,
    ) {
        if (symbol) {
            parts.push(CURRENCY_SYMBOL_VAR_NAME);
        } else if (minus) {
            hasCustomMinusPosition = true;
            parts.push(MINUS_VAR_NAME);
        } else if (amount) {
            parts.push(AMOUNT_VAR_NAME);
        } else if (rest && rest.length) {
            if (rest === LEFT_TO_RIGHT_MARK) {
                hasLeftToRightMark = true;
            } else {
                parts.push(`'${rest}'`);
            }
        }
        return parts;
    });


    if (!hasCustomMinusPosition && patternType === 'implicitMinus') {
        parts.unshift(MINUS_VAR_NAME);
    }
    if (hasLeftToRightMark) {
        parts.unshift(`'${LEFT_TO_RIGHT_MARK}'`);
    }
    return parts.join(' + ');
}

function generateFunctionBody(positivePattern, negativePattern) {
    if (negativePattern) {
        return (
            'return ' +
            MINUS_VAR_NAME +
            ' ? (' +
            transformPatternIntoJsExpression(negativePattern, 'implicitMinus') +
            ') : (' +
            transformPatternIntoJsExpression(positivePattern) +
            ');'
        );
    }
    return 'return ' + transformPatternIntoJsExpression(positivePattern, 'implicitMinus') + ';';
}

/**
 * Attempt to locate the *main* directory inside either cldr‑numbers‑modern or
 * cldr‑numbers‑full.  Throws if neither package is installed.
 */
function findCldrNumbersMainDir() {
    const candidates = ['cldr-numbers-modern', 'cldr-numbers-full'];
    for (const pkg of candidates) {
        try {
            const pkgRoot = path.dirname(requireFromHere.resolve(`${pkg}/package.json`));
            const mainDir = path.join(pkgRoot, 'main');
            if (fs.existsSync(mainDir)) {
                return mainDir;
            }
        } catch (_) {
            /* package not present – move on */
        }
    }
    throw new Error('Unable to locate cldr‑numbers JSON: please `npm i cldr-numbers-modern`');
}

/**
 * Public entry point – unchanged call signature (dataDir *may* be omitted).
 *
 * @param {string} dataDir        – path to directory that contains per‑locale
 *                                  subfolders with numbers.json (optional)
 * @param {string} outputFileName – path to write positions.js into
 */
module.exports = function generatePositionFunctions(dataDir, outputFileName) {
    /* Resolve the data directory automatically when the caller passes nothing
     * or when the path does not exist / has no locale folders.  This keeps the
     * update scripts one‑liner‑simple: just hand over `__dirname` and let the
     * helper figure out the right CLDR package. */
    let mainDir = dataDir && fs.existsSync(dataDir) ? dataDir : null;
    if (!mainDir || fs.readdirSync(mainDir).every((f) => f.startsWith('.'))) {
        mainDir = findCldrNumbersMainDir();
    }

    const functionCache = {};

    for (const locale of fs.readdirSync(mainDir)) {
        if (locale.startsWith('.')) continue; // skip hidden dirs
        const numbersFile = path.join(mainDir, locale, 'numbers.json');
        if (!fs.existsSync(numbersFile)) continue; // safety‑belt

        const info = require(numbersFile);
        const currencyFormats =
            info.main?.[locale]?.numbers?.['currencyFormats-numberSystem-latn'];
        if (!currencyFormats || typeof currencyFormats.standard !== 'string') {
            continue; // some locales (e.g. root) might be missing – ignore
        }

        const pattern = currencyFormats.standard;
        const [positive, negative] = pattern.split(';');
        const functionBody = generateFunctionBody(positive, negative);

        /* Group locales that share the same formatting logic – keeps output small */
        if (functionCache[functionBody]) {
            functionCache[functionBody].push(locale);
        } else {
            functionCache[functionBody] = [locale];
        }
    }

    // Start building the result JS source
    let result = 'var positions = {};\n\n';

    /* Stable, deterministic output – sort by function body string */
    const sortedBodies = Object.keys(functionCache).sort();

    for (const functionBody of sortedBodies) {
        const locales = functionCache[functionBody].sort();
        const exportsLines = locales
            .map((lc) => `positions['${lc}']`)
            .join(' = \n');
        result +=
            exportsLines +
            ` = function (${CURRENCY_SYMBOL_VAR_NAME}, ${AMOUNT_VAR_NAME}, ${MINUS_VAR_NAME}) {\n` +
            '    ' +
            functionBody +
            '\n};\n\n';
    }

    result += 'module.exports = positions;\n';

    fs.writeFileSync(outputFileName, result);
    console.info(`\u00A0💾 Saved ${Object.keys(functionCache).map(k => functionCache[k].length).reduce((sum, num) => sum + num)} locales in ${Object.keys(functionCache).length} position groups to ${outputFileName}`);
};
