import { defineConfig } from 'vitest/config';

// Increase process max listeners to prevent unhandledRejection warning during serial execution of 30 test files
process.setMaxListeners(50);

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
  },
});
