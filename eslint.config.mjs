// eslint.config.mjs
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// Usando array de configuração direta (recomendado pela mensagem de deprecação)
export default [
    // Configuração para ignorar arquivos/pastas
    {
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            '**/*.test.js',
            '**/*.spec.js'
        ],
    },

    // Configuração base recomendada para JavaScript
    js.configs.recommended,

    // Configuração base recomendada para TypeScript
    ...tseslint.configs.recommended,

    // Configurações específicas para todos os arquivos
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            // Desabilita regras conflitantes com TypeScript
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            // Durante migração, deixa any como warning ao invés de error
            '@typescript-eslint/no-explicit-any': 'warn',
            // Permite require() durante migração
            '@typescript-eslint/no-var-requires': 'off',
            // Permite funções não tipadas durante migração
            '@typescript-eslint/explicit-module-boundary-types': 'off',
        },
    },

    // Configuração do Prettier (DEVE SER A ÚLTIMA!)
    prettierConfig
];
