import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  // Pass 3: Vitest reads this same config (it's Vite's own test runner,
  // not a separate tool needing separate config) - jsdom is only needed
  // for the handful of tests that render components (see
  // src/components/auth/GoogleSignInButton.test.jsx); pure-logic tests
  // like src/utils/format.test.js don't touch the DOM at all but run
  // fine under it either way.
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
})
