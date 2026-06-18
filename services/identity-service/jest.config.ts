import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node",
          isolatedModules: true,
          types: ["node", "jest"],
          esModuleInterop: true,
        },
      },
    ],
  },
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
