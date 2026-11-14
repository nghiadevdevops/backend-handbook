import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Playwright specs (tests/e2e/*.spec.ts) are not picked up here.
    passWithNoTests: false,
    // Like PHPUnit's failOnRisky: a test without any assertion fails.
    expect: { requireAssertions: true },
  },
});
