// VitePress does not need the application-specific UnoCSS/PostCSS pipeline.
// Keeping a local empty config also prevents ESM interop issues when the docs
// are built with the Vite version resolved by VitePress.
module.exports = {
  plugins: {},
};
