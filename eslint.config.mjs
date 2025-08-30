import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([{
    languageOptions: {
        globals: {
            ...globals.node,
        },
    },

    rules: {
        'brace-style': [2, '1tbs'],
        'comma-style': [2, 'last'],
        'no-constant-condition': 2,
        semi: [2, 'always'],
        'keyword-spacing': [2],
        'space-before-blocks': [2, 'always'],
        strict: [2, 'global'],
        quotes: [2, 'single'],
    },
}]);