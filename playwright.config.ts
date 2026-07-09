import { defineConfig } from "@playwright/test";

// PCT e2e (M1e-6). Each spec launches the BUILT Electron app directly via _electron, so there are
// NO browser projects here — Playwright's Electron support drives the app's own Chromium, which is
// why `npx playwright install` isn't needed. The app must be built first (out/); `npm run test:e2e`
// runs the electron-vite build then these specs.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // Electron launches are heavy; run serially
  timeout: 60_000,
  expect: { timeout: 12_000 },
  forbidOnly: !!process.env["CI"],
  reporter: [["list"]],
});
