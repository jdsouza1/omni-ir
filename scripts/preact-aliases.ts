// React's entry points mapped to Preact's compatibility layer (PLAN-ELEMENTS.md, decision 1), for the
// <omni-screen> build and for running the React renderer's tests on Preact. They map to Preact's
// package names, not files, so every import resolves to one copy of Preact (two copies would each keep
// their own hooks and render queue).
export const PREACT_ALIASES = [
  { find: /^react-dom\/test-utils$/, replacement: "preact/test-utils" },
  { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
  { find: /^react-dom$/, replacement: "preact/compat" },
  { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
  { find: /^react\/jsx-dev-runtime$/, replacement: "preact/jsx-runtime" },
  { find: /^react$/, replacement: "preact/compat" },
];
