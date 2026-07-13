/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [require.resolve("@education-erp/config/eslint-base")],
  ignorePatterns: ["dist/", "node_modules/"],
};
