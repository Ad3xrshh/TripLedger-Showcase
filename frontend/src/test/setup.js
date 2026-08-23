// Extends Vitest's `expect` with jest-dom's DOM-specific matchers
// (toBeInTheDocument, toBeVisible, etc.) - loaded once for every test file
// via vite.config.js's test.setupFiles.
import '@testing-library/jest-dom/vitest';
