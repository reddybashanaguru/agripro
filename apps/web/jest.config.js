const nextJest = require("next/jest").default;

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: [
    "**/__tests__/**/*.test.{ts,tsx}",
    "**/*.test.{ts,tsx}",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/e2e/"],
  // Only collect coverage from client-side code; async server components
  // and server fetchers are validated by Playwright E2E, not Jest/JSDOM.
  collectCoverageFrom: [
    "components/**/*.{ts,tsx}",
    "lib/types.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(config);
