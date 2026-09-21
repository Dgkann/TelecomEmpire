import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir: './tests/performance',
  workers: 1,
  timeout: 60000,
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 720 },
        // Chromium otherwise draws in software (SwiftShader); PERF_GPU=1 samples the graphics card players use.
        launchOptions:
          process.env.PERF_GPU === '1'
            ? { args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] }
            : undefined,
      },
    },
  ],
  reporter: 'list',
});
