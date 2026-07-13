/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals", require.resolve("@education-erp/config/eslint-base")],
};
