import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/**/*.d.ts",
    "!src/app.ts",
    "!src/grpc/**/*.ts",
    "!src/routes/**/*.ts",
  ],
  coverageThreshold: {
    global: { lines: 75 },
  },
};

export default config;
