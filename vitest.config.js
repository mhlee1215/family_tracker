import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/ui/setup-vitest.js'],
    include: ['tests/ui/**/*.test.js'],
  },
});
