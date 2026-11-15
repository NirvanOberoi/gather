// Lets the web build live under a sub-path (e.g. GitHub Pages: /gather) without changing native builds.
// Usage: EXPO_BASE_URL=/gather npx expo export -p web
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
