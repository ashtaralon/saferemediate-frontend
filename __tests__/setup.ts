/// <reference types="vitest/globals" />

// Extend Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, ...). Loaded once per run via
// vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest'
