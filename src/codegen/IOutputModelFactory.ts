/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import type { IntervalSet } from "antlr4ng";

import type { IToolConfiguration } from "../config/config.js";
import type { Alternative } from "../tool/Alternative.js";
import type { Grammar } from "../tool/Grammar.js";
import type { Rule } from "../tool/Rule.js";
import type { ActionAST } from "../tool/ast/ActionAST.js";
import type { BlockAST } from "../tool/ast/BlockAST.js";
import type { GrammarAST } from "../tool/ast/GrammarAST.js";
import type { CodeGenerator } from "./CodeGenerator.js";
import type { OutputModelController } from "./OutputModelController.js";
import type { Choice } from "./model/Choice.js";
import type { CodeBlockForAlt } from "./model/CodeBlockForAlt.js";
import type { ILabeledOp } from "./model/ILabeledOp.js";
import type { Lexer } from "./model/Lexer.js";
import type { LexerFile } from "./model/LexerFile.js";
import type { Parser } from "./model/Parser.js";
import type { ParserFile } from "./model/ParserFile.js";
import type { RuleFunction } from "./model/RuleFunction.js";
import type { SrcOp } from "./model/SrcOp.js";
import type { CodeBlock } from "./model/decl/CodeBlock.js";

export interface IOutputModelFactory {
    readonly controller: OutputModelController;
    readonly g: Grammar; // Note: must stay "g" as it is used used like this in at least one template.

    getGenerator(): CodeGenerator | undefined;

    parserFile(fileName: string, configuration: IToolConfiguration): ParserFile | undefined;

    parser(file: ParserFile): Parser | undefined;

    lexerFile(fileName: string): LexerFile | undefined;

    lexer(file: LexerFile): Lexer | undefined;

    rule(r: Rule): RuleFunction | undefined;

    rulePostamble(func: RuleFunction, r: Rule): SrcOp[] | undefined;

    // Element triggers.

    alternative(alt: Alternative, outerMost: boolean): CodeBlockForAlt | undefined;

    finishAlternative(blk: CodeBlockForAlt, ops: SrcOp[]): CodeBlockForAlt;

    epsilon(alt: Alternative, outerMost: boolean): CodeBlockForAlt | undefined;

    ruleRef(ID: GrammarAST, label: GrammarAST | null, args: GrammarAST | null): SrcOp[] | undefined;

    tokenRef(ID: GrammarAST, label: GrammarAST | null, args: GrammarAST | null): SrcOp[] | undefined;

    stringRef(ID: GrammarAST, label: GrammarAST | null): SrcOp[] | undefined;

    set(setAST: GrammarAST, label: GrammarAST | null, invert: boolean): SrcOp[] | undefined;

    wildcard(ast: GrammarAST, labelAST: GrammarAST | null): SrcOp[] | undefined;

    action(ast: ActionAST): SrcOp[] | undefined;

    sempred(ast: ActionAST): SrcOp[] | undefined;

    getChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[], label: GrammarAST | null): Choice | undefined;

    getEBNFBlock(ebnfRoot: GrammarAST | null, alts: CodeBlockForAlt[]): Choice | undefined;

    getLL1ChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[]): Choice | undefined;

    getComplexChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[]): Choice | undefined;

    getLL1EBNFBlock(ebnfRoot: GrammarAST, alts: CodeBlockForAlt[]): Choice | undefined;

    getComplexEBNFBlock(ebnfRoot: GrammarAST, alts: CodeBlockForAlt[]): Choice | undefined;

    getLL1Test(look: IntervalSet, blkAST: GrammarAST): SrcOp[] | undefined;

    needsImplicitLabel(ID: GrammarAST, op: ILabeledOp): boolean;

    // Context info.

    getCurrentRuleFunction(): RuleFunction | undefined;

    getCurrentOuterMostAlt(): Alternative | undefined;

    getCurrentBlock(): CodeBlock | undefined;
}
