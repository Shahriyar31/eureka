// ESLint for GNOME Shell extensions (GJS, ES modules).
import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {global: 'readonly', console: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly', log: 'readonly'},
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_|^actor$|^event$|^c$|^o$|^p$'}],
            'prefer-const': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
        },
    },
    {ignores: ['node_modules/**', 'docs/**']},
];
