import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const viteBin = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url));
const viteCommand = `"${process.execPath}" "${viteBin}" --host 127.0.0.1 --port 4173`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: viteCommand,
    url: 'http://127.0.0.1:4173/#/examples/capability',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 920 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
