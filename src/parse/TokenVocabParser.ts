/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { Token } from "antlr4ng";

import { Constants } from "../Constants.js";
import { dirname } from "../support/fs-helpers.js";
import { IssueCode } from "../tool/Issues.js";
import type { IGrammar } from "../types.js";
import { fileSystem } from "../tool-parameters.js";

const linePattern = /\s*(?<tokenID>\w+|'(\\'|[^'])*')\s*=\s*(?<tokenTypeS>\d*)/;

export class TokenVocabParser {
    protected readonly g: IGrammar;

    public constructor(g: IGrammar, private outputDirectory: string, private libDirectory?: string) {
        this.g = g;
    }

    /**
     * Loads a vocab file `<vocabName>.tokens` and return mapping.
     *
     * @returns A map of token names to token types.
     */
    public load(): Map<string, number> {
        const tokens = new Map<string, number>();
        let maxTokenType = -1;
        const tool = this.g.tool;
        const vocabName = this.g.getOptionString("tokenVocab");

        const content = this.getImportedVocabFile();
        const lines = content.split("\n");

        let lineNum = 1;
        for (const tokenDef of lines) {
            ++lineNum;
            if (tokenDef.length === 0) {
                // Ignore blank lines.
                continue;
            }

            const match = linePattern.exec(tokenDef);
            if (match) {
                const { tokenID, tokenTypeS } = match.groups!;

                let tokenType: number;
                try {
                    tokenType = Number.parseInt(tokenTypeS);
                } catch {
                    this.g.tool.errorManager.toolError(IssueCode.TokensFileSyntaxError,
                        vocabName + Constants.VocabFileExtension, " bad token type: " + tokenTypeS,
                        lineNum);
                    tokenType = Token.INVALID_TYPE;
                }

                tool.logInfo({ component: "grammar", msg: "import " + tokenID + "=" + tokenType });
                tokens.set(tokenID, tokenType);
                maxTokenType = Math.max(maxTokenType, tokenType);
            } else if (tokenDef.length > 0) {
                this.g.tool.errorManager.toolError(IssueCode.TokensFileSyntaxError,
                    vocabName + Constants.VocabFileExtension, " bad token def: " + tokenDef, lineNum);
            }
        }

        return tokens;
    }

    /**
     * Return the content of the vocab file. Look in library or in -o output path.  antlr -o foo T.g4 U.g4 where U
     * needs T.tokens won't work unless we look in foo too. If we do not find the file in the lib directory then must
     * assume that the .tokens file is going to be generated as part of this build and we have defined .tokens files
     * so that they ALWAYS are generated in the base output directory, which means the current directory for the
     * command line tool if there was no output directory specified.
     *
     * @returns The content of the vocab file.
     */
    public getImportedVocabFile(): string {
        const vocabName = this.g.getOptionString("tokenVocab");
        if (!vocabName) {
            return "";
        }

        try {
            let name = (this.libDirectory ?? ".") + "/" + vocabName + Constants.VocabFileExtension;
            if (fileSystem.existsSync(name)) {
                return fileSystem.readFileSync(name, "utf8").toString();
            }

            // We did not find the vocab file in the lib directory, so we need to look for it in the output directory
            // which is where .tokens files are generated (in the base, not relative to the input location.)
            if (this.outputDirectory) {
                name = this.outputDirectory + "/" + vocabName + Constants.VocabFileExtension;
                if (fileSystem.existsSync(name)) {
                    return fileSystem.readFileSync(name, "utf8").toString();
                }
            }

            // Still not found? Use the grammar's soruce folder then.
            name = dirname(this.g.fileName);
            if (name) {
                name = name + "/" + vocabName + Constants.VocabFileExtension;
                if (fileSystem.existsSync(name)) {
                    return fileSystem.readFileSync(name, "utf8").toString();
                }
            }

            // File not found.
            const inTree = this.g.ast.getOptionAST("tokenVocab");
            const inTreeValue = inTree?.token?.text;
            if (vocabName === inTreeValue) {
                this.g.tool.errorManager.grammarError(IssueCode.CannotFindTokensFileRefdInGrammar,
                    this.g.fileName, inTree?.token ?? null, inTreeValue);
            } else {
                // Must be from -D option on cmd-line not token in tree.
                this.g.tool.errorManager.toolError(IssueCode.CannotFindTokensFile, vocabName,
                    this.g.name);
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.g.tool.errorManager.toolError(IssueCode.ErrorReadingTokensFile, e, vocabName, message);
        }

        return "";
    }
}
