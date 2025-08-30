import { defineConfig } from 'eslint/config';

export default defineConfig([{
    languageOptions: {
        globals: {
            describe: false,
            it: false,
            before: false,
            after: false,
            beforeEach: false,
            afterEach: false,
        },
    },
}]);