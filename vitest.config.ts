import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        includeSource: ["src/**/*.{js,ts}"],
        logHeapUsage: true,
        isolate: false,
        environment: "node",
        pool: "threads",
        reporters: ["basic"],
        slowTestThreshold: 2000,
        sequence: {
            concurrent: true,
        },
    }
});
