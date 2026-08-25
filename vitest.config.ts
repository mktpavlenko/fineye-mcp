import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Isolate config/session writes to a temp dir so tests never touch the real ~/.config/fineye login.
    env: { FINEYE_CONFIG_DIR: '/tmp/fineye-cli-test-config' },
  },
})
