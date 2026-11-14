import { defineConfig } from 'vitest/config';

// Fast suites only: StrykerJS runs this set once per mutant.
// Integration (needs PostgreSQL), Pact and HTTP suites are excluded on purpose.
export default defineConfig({
  test: {
    expect: { requireAssertions: true },
    include: [
      'tests/unit/**/*.test.ts',
      'tests/application/**/*.test.ts',
      'tests/acceptance/**/*.test.ts',
      'tests/characterization/**/*.test.ts',
      'tests/contract/schema.test.ts',
    ],
  },
});
