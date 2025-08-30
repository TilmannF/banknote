const fs = require('node:fs');
const path = require('node:path');

module.exports = function generateCountryInformation(dataDir, outputFileName) {
    if (!outputFileName) {
        // Backward compatibility with the old signature: (dataDir, output)
        // If only one argument is provided, treat it as outputFileName and auto-discover data.
        outputFileName = dataDir;
        dataDir = undefined;
    }

    const currencyDataPath = resolveCurrencyDataPath(dataDir);
    const json = JSON.parse(fs.readFileSync(currencyDataPath, 'utf8'));
    const regionData = json && json.supplemental && json.supplemental.currencyData && json.supplemental.currencyData.region;
    if (!regionData || typeof regionData !== 'object') {
        throw new Error('Could not find supplemental.currencyData.region in ' + currencyDataPath);
    }

    const result = {};
    const regions = Object.keys(regionData).sort();
    for (const r of regions) {
        const rawEntries = Array.isArray(regionData[r]) ? regionData[r] : [];
        const entries = normalizeRegionEntries(rawEntries);
        const pick = pickCurrentCurrency(entries);
        if (pick) result[r] = pick;
    }

    const output = 'module.exports = ' + stringifyAsSingleQuoted(result) + ';\n';
    fs.writeFileSync(outputFileName, output);
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function resolveCurrencyDataPath(dataDir) {
    const candidates = [];
    if (dataDir) {
        // Allow pointing either at a cldr-core root or directly at its supplemental dir
        candidates.push(path.resolve(dataDir, 'supplemental', 'currencyData.json'));
        candidates.push(path.resolve(dataDir, 'currencyData.json'));
    }
    try {
        const coreRoot = path.dirname(require.resolve('cldr-core/package.json'));
        candidates.push(path.join(coreRoot, 'supplemental', 'currencyData.json'));
    } catch (_) { /* cldr-core not installed */ }

    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    const hint = dataDir ? ('searched under ' + dataDir) : 'cldr-core not found — install devDependency `cldr-core`';
    throw new Error('Unable to locate CLDR currencyData.json; ' + hint);
}

// Accept both JSON shapes seen in CLDR's region entries:
//  1) [{ "currency": "EUR", "_from": "1999-01-01" }, ...]
//  2) [{ "EUR": { "_from": "1999-01-01" } }, { "XEU": { "_to": "1998-12-31" } }]
function normalizeRegionEntries(rawEntries) {
    const out = [];
    for (const e of rawEntries) {
        if (!e || typeof e !== 'object') continue;

        if (Object.prototype.hasOwnProperty.call(e, 'currency')) {
            // Shape #1
            const cur = e.currency;
            if (!cur) continue;
            out.push({
                currency: cur,
                from: e._from || e.from || null,
                to: e._to || e.to || null,
                tender: e._tender != null ? String(e._tender) : (e.tender != null ? String(e.tender) : null)
            });
            continue;
        }

        // Shape #2: keys are currency codes, value holds attributes
        for (const k of Object.keys(e)) {
            if (k[0] === '_') continue;
            const v = e[k] || {};
            out.push({
                currency: k,
                from: v._from || v.from || null,
                to: v._to || v.to || null,
                tender: v._tender != null ? String(v._tender) : (v.tender != null ? String(v.tender) : null)
            });
        }
    }
    return out;
}

function pickCurrentCurrency(entries) {
    if (!entries || entries.length === 0) return null;

    // Filter out explicit non-tender entries; absence or any value other than 'false' is considered tender.
    const tendered = entries.filter(e => (e.tender || '').toLowerCase() !== 'false');
    const bucket = tendered.length ? tendered : entries;

    // First, prefer entries that are not bounded by a `to` date (still current).
    const current = bucket.filter(e => !e.to);
    const pickFrom = current.length ? current : bucket;

    // Score with preference for recency and de-emphasis of pseudo-currencies.
    let best = null;
    let bestScore = -Infinity;
    for (const e of pickFrom) {
        let score = 0;
        if (!e.to) score += 1e9; // very strong preference for no end date
        if (e.from) {
            const t = Date.parse(e.from);
            if (!Number.isNaN(t)) score += Math.floor(t / 1000);
        }
        // Penalize most X* codes except common legal tenders.
        if (/^X[A-Z]{2}$/.test(e.currency) && !/^(XAF|XOF|XPF|XCD)$/.test(e.currency)) {
            score -= 1e6;
        }
        if (score > bestScore) {
 bestScore = score; best = e; 
}
    }

    return best ? best.currency : null;
}

function stringifyAsSingleQuoted(obj) {
    return JSON.stringify(obj, null, 4).replace(/"/g, '\'');
}
