// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions are Deno code — checked with `deno check` / `deno lint` instead.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
