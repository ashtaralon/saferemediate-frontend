// Minimal ESLint flat config.
//
// Scope is deliberately narrow: catch the use-before-declaration / temporal-
// dead-zone class that shipped the estate-map crash ("Cannot access
// 'attackPaths' before initialization" — a useMemo dep array referencing a
// const declared lower in the component). SWC/tsc transpiled it fine; only
// the minified prod runtime threw.
//
// This is intentionally NOT eslint-config-next. A broad ruleset on a repo
// that has never been linted produces thousands of violations and buries the
// signal. Start with the one high-value rule; widen incrementally later.
//
// Install:  npm install -D eslint typescript-eslint eslint-plugin-react-hooks
// Run:      npm run lint        ("lint": "eslint ." already in package.json)
//
// Rollout: enforced on topology-v0-2 first (where the TDZ shipped). A repo-
// wide dry-run surfaces ~80 pre-existing const-order hits (fetch helpers below
// useEffect/useMemo) — enable globally once that backlog is cleared.

import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

const noUseBeforeDefineOptions = {
  // Function declarations hoist — don't flag them.
  functions: false,
  classes: false,
  // The bug class we care about: a `const`/`let` value used before
  // its declaration (incl. inside a hook dependency array).
  variables: true,
  enums: true,
  // Type aliases/interfaces can be referenced before declaration.
  typedefs: false,
  ignoreTypeReferences: true,
}

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "**/*.backup",
      "**/*.OLD.tsx",
      "**/.claude/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      // Registered only so legacy eslint-disable-next-line react-hooks/…
      // comments don't fail as unknown rules. Do NOT enable exhaustive-deps.
      "react-hooks": reactHooks,
    },
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": "off",
    },
  },
  {
    files: [
      "components/topology-v0-2/**/*.{ts,tsx}",
      "__tests__/topology*.ts",
      "__tests__/topology*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-use-before-define": [
        "error",
        noUseBeforeDefineOptions,
      ],
    },
  },
)
