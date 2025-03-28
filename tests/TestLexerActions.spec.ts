/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ToolTestUtils } from "./ToolTestUtils.js";
import { Grammar } from "../src/tool/index.js";
import { CodeGenerator } from "../src/codegen/CodeGenerator.js";

// Need to run the sequentially, as they use console output for verification.
describe.sequential("TestLexerActions", () => {
    // ----- ACTIONS --------------------------------------------------------

    it("testActionExecutedInDFA", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34 34", tempDir);
            });

            const expecting =
                "I\n" +
                "I\n" +
                "[@0,0:1='34',<1>,1:0]\n" +
                "[@1,3:4='34',<1>,1:3]\n" +
                "[@2,5:4='<EOF>',<-1>,1:5]\n";

            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testActionEvalsAtCorrectIndex", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : [0-9] {console.log(\"2nd char: \"+String.fromCodePoint(this.inputStream.LA(1)));} [0-9]+ ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "123 45", tempDir);
            });

            const expecting =
                "2nd char: 2\n" +
                "2nd char: 5\n" +
                "[@0,0:2='123',<1>,1:0]\n" +
                "[@1,4:5='45',<1>,1:4]\n" +
                "[@2,6:5='<EOF>',<-1>,1:6]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    /**
     * This is a regressing test for antlr/antlr4#469 "Not all internal lexer
     * rule actions are executed".
     * https://github.com/antlr/antlr4/issues/469
     */
    it("testEvalMultipleActions", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar = `
lexer grammar L;

@lexer::header {
class Marker {
   public constructor(private lexer: antlr.Lexer) { }

   public getText(): string {
      return this.lexer.inputStream.getTextFromInterval(new antlr.Interval(this.startIndex, this.stopIndex));
   }

   public start(): void  { this.startIndex = this.lexer.inputStream.index; console.log("Start:" + this.startIndex);}
   public stop(): void { this.stopIndex = this.lexer.inputStream.index; console.log ("Stop:" + this.stopIndex);}

   private startIndex = 0;
   private stopIndex = 0;
}
}

@lexer::members {
private m_name = new Marker (this);
}

HELLO: 'hello' WS { this.m_name.start(); } NAME { this.m_name.stop(); } '\\n'
    { console.log("Hello: " + this.m_name.getText ()); };
NAME: ('a'..'z' | 'A'..'Z')+ ('\\n')?;

fragment WS: [ \\r\\t\\n]+ ;
`;
            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "hello Steve\n", tempDir);
            });

            const expecting =
                "Start:6\n" +
                "Stop:11\n" +
                "Hello: Steve\n" +
                "\n" +
                "[@0,0:11='hello Steve\\n',<1>,1:0]\n" +
                "[@1,12:11='<EOF>',<-1>,2:0]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("test2ActionsIn1Rule", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : [0-9] {console.log(\"x\");} [0-9]+ {console.log(\"y\");} ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "123 45", tempDir);
            });

            const expecting =
                "x\n" +
                "y\n" +
                "x\n" +
                "y\n" +
                "[@0,0:2='123',<1>,1:0]\n" +
                "[@1,4:5='45',<1>,1:4]\n" +
                "[@2,6:5='<EOF>',<-1>,1:6]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testAltActionsIn1Rule", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : ( [0-9]+ {console.log(\"int\");}\n" +
                "    | [a-z]+ {console.log(\"id\");}\n" +
                "    )\n" +
                "    {console.log(\" last\");}\n" +
                "    ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "123 ab", tempDir);
            });

            const expecting =
                "int\n last\n" +
                "id\n last\n" +
                "[@0,0:2='123',<1>,1:0]\n" +
                "[@1,4:5='ab',<1>,1:4]\n" +
                "[@2,6:5='<EOF>',<-1>,1:6]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testActionPlusCommand", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} -> skip ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34 34", tempDir);
            });

            const expecting =
                "I\n" +
                "I\n" +
                "[@0,5:4='<EOF>',<-1>,1:5]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    // ----- COMMANDS --------------------------------------------------------

    it("testSkipCommand", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} ;\n" +
                "WS : (' '|'\\n') -> skip ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34 34", tempDir);
            });

            const expecting =
                "I\n" +
                "I\n" +
                "[@0,0:1='34',<1>,1:0]\n" +
                "[@1,3:4='34',<1>,1:3]\n" +
                "[@2,5:4='<EOF>',<-1>,1:5]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testMoreCommand", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} ;\n" +
                "WS : '#' -> more ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34#10", tempDir);
            });

            const expecting =
                "I\n" +
                "I\n" +
                "[@0,0:1='34',<1>,1:0]\n" +
                "[@1,2:4='#10',<1>,1:2]\n" +
                "[@2,5:4='<EOF>',<-1>,1:5]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testTypeCommand", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} ;\n" +
                "HASH : '#' -> type(HASH) ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34#", tempDir);
            });

            const expecting =
                "I\n" +
                "[@0,0:1='34',<1>,1:0]\n" +
                "[@1,2:2='#',<2>,1:2]\n" +
                "[@2,3:2='<EOF>',<-1>,1:3]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testCombinedCommand", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "I : '0'..'9'+ {console.log(\"I\");} ;\n" +
                "HASH : '#' -> type(100), skip, more  ;";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "34#11", tempDir);
            });

            const expecting =
                "I\n" +
                "I\n" +
                "[@0,0:1='34',<1>,1:0]\n" +
                "[@1,2:4='#11',<1>,1:2]\n" +
                "[@2,5:4='<EOF>',<-1>,1:5]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testLexerMode", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "STRING_START : '\"' -> pushMode(STRING_MODE), more;\n" +
                "WS : (' '|'\\n') -> skip ;\n" +
                "mode STRING_MODE;\n" +
                "STRING : '\"' -> popMode;\n" +
                "ANY : . -> more;\n";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "\"abc\" \"ab\"", tempDir);
            });

            const expecting =
                "[@0,0:4='\"abc\"',<2>,1:0]\n" +
                "[@1,6:9='\"ab\"',<2>,1:6]\n" +
                "[@2,10:9='<EOF>',<-1>,1:10]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testLexerPushPopModeAction", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "STRING_START : '\"' -> pushMode(STRING_MODE), more ;\n" +
                "WS : (' '|'\\n') -> skip ;\n" +
                "mode STRING_MODE;\n" +
                "STRING : '\"' -> popMode ;\n" + // token type 2
                "ANY : . -> more ;\n";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "\"abc\" \"ab\"", tempDir);
            });

            const expecting =
                "[@0,0:4='\"abc\"',<2>,1:0]\n" +
                "[@1,6:9='\"ab\"',<2>,1:6]\n" +
                "[@2,10:9='<EOF>',<-1>,1:10]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testLexerModeAction", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar L;\n" +
                "STRING_START : '\"' -> mode(STRING_MODE), more ;\n" +
                "WS : (' '|'\\n') -> skip ;\n" +
                "mode STRING_MODE;\n" +
                "STRING : '\"' -> mode(DEFAULT_MODE) ;\n" + // ttype 2 since '"' ambiguity
                "ANY : . -> more ;\n";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("L.g4", grammar, "L", "\"abc\" \"ab\"", tempDir);
            });

            const expecting =
                "[@0,0:4='\"abc\"',<2>,1:0]\n" +
                "[@1,6:9='\"ab\"',<2>,1:6]\n" +
                "[@2,10:9='<EOF>',<-1>,1:10]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    // ----- PREDICATES --------------------------------------------------------

    /**
     * This is a regression test for antlr/antlr4#398 "Lexer: literal matches
     * while negated char set fail to match"
     * https://github.com/antlr/antlr4/issues/398
     */
    it("testFailingPredicateEvalIsNotCached", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "AntlrLexerActions"));
        try {
            const grammar =
                "lexer grammar TestLexer;\n" +
                "\n" +
                "fragment WS: [ \\t]+;\n" +
                "fragment EOL: '\\r'? '\\n';\n" +
                "\n" +
                "LINE: WS? ~[\\r\\n]* EOL { !this.text.trim().startsWith(\"Item:\") }?;\n" +
                "ITEM: WS? 'Item:' -> pushMode(ITEM_HEADING_MODE);\n" +
                "\n" +
                "mode ITEM_HEADING_MODE;\n" +
                "\n" +
                "NAME: ~[\\r\\n]+;\n" +
                "SECTION_HEADING_END: EOL -> popMode;\n";
            const input =
                "A line here.\n" +
                "Item: name of item\n" +
                "Another line.\n" +
                "More line.\n";

            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                await ToolTestUtils.execLexer("TestLexer.g4", grammar, "TestLexer", input, tempDir);
            });

            const expecting =
                "[@0,0:12='A line here.\\n',<1>,1:0]\n" +
                "[@1,13:17='Item:',<2>,2:0]\n" +
                "[@2,18:30=' name of item',<3>,2:5]\n" +
                "[@3,31:31='\\n',<4>,2:18]\n" +
                "[@4,32:45='Another line.\\n',<1>,3:0]\n" +
                "[@5,46:56='More line.\\n',<1>,4:0]\n" +
                "[@6,57:56='<EOF>',<-1>,5:0]\n";
            expect(output.output).toBe(expecting);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("Nested actions", () => {
        const grammarText = `grammar T;
            @definitions {
            }

            @members {
            static isIdentifierChar (c: string) {
                return c.match(/^[0-9a-zA-Z_]+$/);
            }
            }

            s : a ;
            a : a ID {false}?<fail='custom message'>
            | ID
            ;
            ID : 'a'..'z'+ ;
            WS : (' '|'\\n') -> skip ;`;
        const g = new Grammar(grammarText);
        g.tool.process(g, false);

        const gen = new CodeGenerator(g);
        const outputFileST = gen.generateParser(g.tool.toolConfiguration);
        const outputFile = outputFileST.render();
        expect(outputFile).toContain("FailedPredicateException(this, \"false\", \"custom message\");");
        expect(outputFile).toContain("return c.match(/^[0-9a-zA-Z_]+$/);");
    });
});
