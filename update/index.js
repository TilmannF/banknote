#!/usr/bin/env node

const path = require('path');

const ROOT_DIR = path.normalize(path.join(__dirname, '..'));
const CLDR_DATA_DIR = path.join(ROOT_DIR, 'node_modules', 'cldr-data', 'main');

console.info('💸 Generating Positioning Functions...');
require('./generate-position-functions')(CLDR_DATA_DIR, path.join(__dirname, '..', 'data', 'positions.js'));

console.info('💸 Generating Number Separator Map...');
require('./generate-number-separators')(CLDR_DATA_DIR, path.join(__dirname, '..', 'data', 'separators.js'));

console.info('💸 Generating Currency Symbol Map...');
require('./generate-currency-symbol-map')(CLDR_DATA_DIR, path.join(__dirname, '..', 'data', 'symbol-map.js'));

console.info('💸 Generating Country Information...');
require('./generate-country-information')(CLDR_DATA_DIR, path.join(__dirname, '..', 'data', 'country-currency.js'));
