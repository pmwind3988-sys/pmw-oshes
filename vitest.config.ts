import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // .tsx too: the portal screens are only meaningfully covered by rendering
    // them, and a screen that throws on mount typechecks perfectly well.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/_utils/**/*.test.ts'],
  },
})
