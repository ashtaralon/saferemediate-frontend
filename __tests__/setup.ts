/// <reference types="vitest/globals" />

// Extend Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, ...). Loaded once per run via
// vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest'

// Server proxy modules resolve the backend URL at import time. CI deliberately
// has no deployment backend configured, so give tests an explicit, unreachable
// test origin. Individual proxy tests mock fetch; production remains fail-closed.
process.env.BACKEND_URL ||= 'https://backend.test.invalid'
