import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/**/*.d.ts",
    "!src/grpc/**/*.ts",
    "!src/db/**/*.ts",
    "!src/events/**/*.ts",
    "!src/repositories/**/*.ts",
  ],
  coverageThreshold: {
    global: { lines: 75 },
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
