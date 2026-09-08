import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir: './tests/performance',
  workers: 1,
  timeout: 60000,
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 720 } } }],
  reporter: 'list',
});
