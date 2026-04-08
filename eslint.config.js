const matrixOrg = require("eslint-plugin-matrix-org");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    recommendedConfig: js.configs.recommended,
});

module.exports = [
    ...compat.config(matrixOrg.configs.typescript), {
    plugins: {
        "matrix-org": matrixOrg,
    },

    languageOptions: {
        parserOptions: {
            projectService: true,
        },
    },

    rules: {
        "no-var": ["warn"],
        "prefer-rest-params": ["warn"],
        "prefer-spread": ["warn"],
        "one-var": ["warn"],
        "padded-blocks": ["warn"],
        "no-extend-native": ["warn"],
        "camelcase": ["warn"],

        "no-multi-spaces": ["error", {
            "ignoreEOLComments": true,
        }],

        "space-before-function-paren": ["error", {
            "anonymous": "never",
            "named": "never",
            "asyncArrow": "always",
        }],

        "arrow-parens": "off",
        "prefer-promise-reject-errors": "off",
        "quotes": "off",
        "indent": "off",
        "no-constant-condition": "off",
        "no-async-promise-executor": "off",
        // We use a `LogService` intermediary module
        "no-console": "error",

        // We're okay being explicit at the moment
        "@typescript-eslint/no-empty-interface": "off",
        // We disable this while we're transitioning
        "@typescript-eslint/no-explicit-any": "off",
        // We'd rather not do this but we do
        "@typescript-eslint/ban-ts-comment": "off",
        // We're okay with assertion errors when we ask for them
        "@typescript-eslint/no-non-null-assertion": "off",
        "quotes": "off",

        "max-len": ["error", {
            "code": 180,
        }],

        "no-extra-boolean-cast": "off",

        // Disable rules added by eslint-plugin-matrix-org since v0.8.0

        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-member-accessibility": "off",
        "@typescript-eslint/consistent-type-exports": "off",
        "@typescript-eslint/consistent-type-imports": "off",

        "@stylistic/member-delimiter-style": ["error", {
            "singleline": {
                "delimiter": "comma",
                "requireLast": false,
            }
        }],

        "@typescript-eslint/no-wrapper-object-types": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/no-require-imports": "off",
    },
}];
