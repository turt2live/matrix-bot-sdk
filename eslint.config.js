const {
    defineConfig,
} = require("eslint/config");

const matrixOrg = require("eslint-plugin-matrix-org");
const globals = require("globals");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    plugins: {
        "matrix-org": matrixOrg,
    },

    extends: compat.extends("plugin:matrix-org/babel"),

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
        },
    },

    rules: {
        "valid-jsdoc": ["off"],
        "require-jsdoc": ["off"],
        "unicorn/no-instanceof-array": "off",
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
        "no-console": "error",
    },
}, {
    files: ["**/*.ts"],
    extends: compat.extends("plugin:matrix-org/typescript"),

    rules: {
        "valid-jsdoc": ["off"],
        "require-jsdoc": ["off"],
        "unicorn/no-instanceof-array": "off",
        "@babel/no-invalid-this": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/consistent-type-exports": "off",
        "@typescript-eslint/consistent-type-imports": "off",
        "@typescript-eslint/explicit-member-accessibility": "off",
        "@typescript-eslint/no-wrapper-object-types": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-base-to-string": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@stylistic/member-delimiter-style": "off",
        "quotes": "off",
        "no-console": "error",

        "max-len": ["error", {
            "code": 180,
        }],

        "no-extra-boolean-cast": "off",
    },
}]);
