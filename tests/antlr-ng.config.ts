import { defineConfig } from "../src/config/config.js";

export default defineConfig({
    grammarFiles: ["./src/grammars/ANTLRv4Lexer.g4", "./src/grammars/ANTLRv4Parser.g4"],
    outputDirectory: "./tests/generated",
    generators: [{
        name: "test1",
        language: "TypeScript",
    }]
});
