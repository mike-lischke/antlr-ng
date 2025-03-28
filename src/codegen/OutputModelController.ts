/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import type { IST } from "stringtemplate4ts";

import { ANTLRv4Parser } from "../generated/ANTLRv4Parser.js";

import { CommonTreeNodeStream } from "../tree/CommonTreeNodeStream.js";
import { SourceGenTriggers } from "../tree/walkers/SourceGenTriggers.js";

import type { IToolConfiguration } from "../config/config.js";
import { Utils } from "../misc/Utils.js";
import { Alternative } from "../tool/Alternative.js";
import type { ErrorManager } from "../tool/ErrorManager.js";
import { Grammar } from "../tool/Grammar.js";
import { IssueCode } from "../tool/Issues.js";
import { LeftRecursiveRule } from "../tool/LeftRecursiveRule.js";
import { Rule } from "../tool/Rule.js";
import { ActionAST } from "../tool/ast/ActionAST.js";
import { BlockAST } from "../tool/ast/BlockAST.js";
import { GrammarAST } from "../tool/ast/GrammarAST.js";
import { PredAST } from "../tool/ast/PredAST.js";
import { IOutputModelFactory } from "./IOutputModelFactory.js";
import { Action } from "./model/Action.js";
import { AltBlock } from "./model/AltBlock.js";
import { BaseListenerFile } from "./model/BaseListenerFile.js";
import { BaseVisitorFile } from "./model/BaseVisitorFile.js";
import { Choice } from "./model/Choice.js";
import { CodeBlockForAlt } from "./model/CodeBlockForAlt.js";
import { CodeBlockForOuterMostAlt } from "./model/CodeBlockForOuterMostAlt.js";
import { ILabeledOp } from "./model/ILabeledOp.js";
import { LeftRecursiveRuleFunction } from "./model/LeftRecursiveRuleFunction.js";
import { Lexer } from "./model/Lexer.js";
import { LexerFile } from "./model/LexerFile.js";
import { ListenerFile } from "./model/ListenerFile.js";
import { OutputModelObject } from "./model/OutputModelObject.js";
import { Parser } from "./model/Parser.js";
import { ParserFile } from "./model/ParserFile.js";
import { RuleActionFunction } from "./model/RuleActionFunction.js";
import { RuleFunction } from "./model/RuleFunction.js";
import { RuleSempredFunction } from "./model/RuleSempredFunction.js";
import { SrcOp } from "./model/SrcOp.js";
import { StarBlock } from "./model/StarBlock.js";
import { VisitorFile } from "./model/VisitorFile.js";
import { CodeBlock } from "./model/decl/CodeBlock.js";

/**
 * This receives events from SourceGenTriggers.g and asks factory to do work. Then runs extensions in order on
 * resulting SrcOps to get final list.
 */
export class OutputModelController {

    /** Who does the work? */
    public readonly factory: IOutputModelFactory;

    public currentBlock: CodeBlock;
    public currentOuterMostAlt: Alternative;

    /** While walking code in rules, this is set to the tree walker that triggers actions. */
    private walker: SourceGenTriggers;

    private currentRuleStack = new Array<RuleFunction>();
    private errorManager: ErrorManager;

    public constructor(factory: IOutputModelFactory) {
        this.factory = factory;
        this.errorManager = factory.g.tool.errorManager;
    }

    /**
     * Build a file with a parser containing rule functions. Use the controller as factory in SourceGenTriggers so
     * it triggers codegen extensions too, not just the factory functions in this factory.
     */
    public buildParserOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;
        const file = this.parserFile(gen.getRecognizerFileName(header), configuration);
        file.parser = this.parser(file);

        const g = this.factory.g;
        for (const r of g.rules.values()) {
            this.buildRuleFunction(file.parser, r);
        }

        return file;
    }

    public buildLexerOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;
        const file = this.lexerFile(gen.getRecognizerFileName(header), configuration);
        file.lexer = this.lexer(file);

        const g = this.factory.g;
        for (const r of g.rules.values()) {
            this.buildLexerRuleActions(file.lexer, r);
        }

        return file;
    }

    public buildListenerOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;

        return new ListenerFile(this.factory, gen.getListenerFileName(header), configuration);
    }

    public buildBaseListenerOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;

        return new BaseListenerFile(this.factory, gen.getBaseListenerFileName(header), configuration);
    }

    public buildVisitorOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;

        return new VisitorFile(this.factory, gen.getVisitorFileName(header), configuration);
    }

    public buildBaseVisitorOutputModel(header: boolean, configuration: IToolConfiguration): OutputModelObject {
        const gen = this.factory.getGenerator()!;

        return new BaseVisitorFile(this.factory, gen.getBaseVisitorFileName(header), configuration);
    }

    public parserFile(fileName: string, configuration: IToolConfiguration): ParserFile {
        return this.factory.parserFile(fileName, configuration)!;
    }

    public parser(file: ParserFile): Parser {
        return this.factory.parser(file)!;
    }

    public lexerFile(fileName: string, configuration: IToolConfiguration): LexerFile {
        return new LexerFile(this.factory, fileName, configuration);
    }

    public lexer(file: LexerFile): Lexer {
        return new Lexer(this.factory, file);
    }

    /**
     * Create RuleFunction per rule and update sempreds,actions of parser output object with stuff found in r.
     */
    public buildRuleFunction(parser: Parser, r: Rule): void {
        const ruleFunction = this.rule(r);
        parser.funcs.push(ruleFunction);
        this.pushCurrentRule(ruleFunction);
        ruleFunction.fillNamedActions(this.factory, r);

        if (r instanceof LeftRecursiveRule) {
            this.buildLeftRecursiveRuleFunction(r, ruleFunction as LeftRecursiveRuleFunction);
        } else {
            this.buildNormalRuleFunction(r, ruleFunction);
        }

        const g = this.getGrammar();
        for (const a of r.actions) {
            if (a instanceof PredAST) {
                const p = a;
                let rsf = parser.sempredFuncs.get(r);
                if (rsf === undefined) {
                    rsf = new RuleSempredFunction(this.factory, r, ruleFunction.ctxType);
                    parser.sempredFuncs.set(r, rsf);
                }
                rsf.actions.set(g.sempreds.get(p)!, new Action(this.factory, p));
            }
        }

        this.popCurrentRule();
    }

    public buildLeftRecursiveRuleFunction(r: LeftRecursiveRule, ruleFunction: LeftRecursiveRuleFunction): void {
        this.buildNormalRuleFunction(r, ruleFunction);

        // Now inject code to start alts.
        const gen = this.factory.getGenerator()!;
        const codegenTemplates = gen.templates;

        // Pick out alt(s) for primaries.
        const outerAlt = ruleFunction.code[0] as CodeBlockForOuterMostAlt;
        const primaryAltsCode = new Array<CodeBlockForAlt>();
        const primaryStuff = outerAlt.ops[0];
        if (primaryStuff instanceof Choice) {
            const primaryAltBlock = primaryStuff;
            primaryAltsCode.push(...primaryAltBlock.alts);
        } else {
            // Just a single alt I guess; no block.
            primaryAltsCode.push(primaryStuff as CodeBlockForAlt);
        }

        // Pick out alt(s) for op alts.
        const opAltStarBlock = outerAlt.ops[1] as StarBlock;
        const altForOpAltBlock = opAltStarBlock.alts[0];
        const opAltsCode = new Array<CodeBlockForAlt>();
        const opStuff = altForOpAltBlock.ops[0];
        if (opStuff instanceof AltBlock) {
            const opAltBlock = opStuff;
            opAltsCode.push(...opAltBlock.alts);
        } else {
            // Just a single alt I guess; no block.
            opAltsCode.push(opStuff as CodeBlockForAlt);
        }

        // Insert code in front of each primary alt to create specialized ctx if there was a label.
        for (let i = 0; i < primaryAltsCode.length; i++) {
            const altInfo = r.recPrimaryAlts[i];
            if (altInfo.altLabel === undefined) {
                continue;
            }

            const altActionST = codegenTemplates.getInstanceOf("recRuleReplaceContext")!;
            altActionST.add("ctxName", Utils.capitalize(altInfo.altLabel));
            const altAction = new Action(this.factory, ruleFunction.altLabelCtxs!.get(altInfo.altLabel)!, altActionST);
            const alt = primaryAltsCode[i];
            alt.insertOp(0, altAction);
        }

        // Insert code to set ctx.stop after primary block and before op * loop.
        const setStopTokenAST = codegenTemplates.getInstanceOf("recRuleSetStopToken")!;
        const setStopTokenAction = new Action(this.factory, ruleFunction.ruleCtx, setStopTokenAST);
        outerAlt.insertOp(1, setStopTokenAction);

        // Insert code to set previous context at start of * loop.
        const setPrevCtx = codegenTemplates.getInstanceOf("recRuleSetPrevCtx")!;
        const setPrevCtxAction = new Action(this.factory, ruleFunction.ruleCtx, setPrevCtx);
        opAltStarBlock.addIterationOp(setPrevCtxAction);

        // Insert code in front of each op alt to create specialized ctx if there was an alt label.
        for (let i = 0; i < opAltsCode.length; i++) {
            let altActionST: IST;
            const altInfo = r.recOpAlts.getElement(i)!;
            let templateName: string;
            if (altInfo.altLabel !== undefined) {
                templateName = "recRuleLabeledAltStartAction";
                altActionST = codegenTemplates.getInstanceOf(templateName)!;
                altActionST.add("currentAltLabel", altInfo.altLabel);
            } else {
                templateName = "recRuleAltStartAction";
                altActionST = codegenTemplates.getInstanceOf(templateName)!;
                altActionST.add("ctxName", Utils.capitalize(r.name));
            }

            altActionST.add("ruleName", r.name);

            // Add label of any lr ref we deleted.
            altActionST.add("label", altInfo.leftRecursiveRuleRefLabel);
            if (altActionST.impl!.formalArguments!.has("isListLabel")) {
                altActionST.add("isListLabel", altInfo.isListLabel);
            } else if (altInfo.isListLabel) {
                this.errorManager.toolError(IssueCode.CodeTemaplateArgIssue, templateName, "isListLabel");
            }

            const decl = ruleFunction.altLabelCtxs!.get(altInfo.altLabel!)!;
            const altAction = new Action(this.factory, decl, altActionST);
            opAltsCode[i].insertOp(0, altAction);
        }
    }

    public buildNormalRuleFunction(r: Rule, ruleFunction: RuleFunction): void {
        const gen = this.factory.getGenerator()!;

        // Trigger factory functions for rule alts, elements.
        const blk = r.ast.getFirstChildWithType(ANTLRv4Parser.BLOCK) as GrammarAST;
        const nodes = new CommonTreeNodeStream(blk);
        this.walker = new SourceGenTriggers(this.errorManager, nodes, this);

        // Walk AST of rule alts/elements.
        ruleFunction.code = this.walker.block(null, null)!;
        ruleFunction.hasLookaheadBlock = this.walker.hasLookaheadBlock;
        ruleFunction.ctxType = gen.target.getRuleFunctionContextStructName(ruleFunction);
        ruleFunction.postamble = this.rulePostamble(ruleFunction, r);
    }

    public buildLexerRuleActions(lexer: Lexer, r: Rule): void {
        if (r.actions.length === 0) {
            return;
        }

        const gen = this.factory.getGenerator()!;
        const g = this.factory.g;
        const ctxType = gen.target.getRuleFunctionContextStructName(r);
        const raf = lexer.actionFuncs.get(r) ?? new RuleActionFunction(this.factory, r, ctxType);

        for (const a of r.actions) {
            if (a instanceof PredAST) {
                const p = a;
                let rsf = lexer.sempredFuncs.get(r);
                if (!rsf) {
                    rsf = new RuleSempredFunction(this.factory, r, ctxType);
                    lexer.sempredFuncs.set(r, rsf);
                }
                rsf.actions.set(g.sempreds.get(p)!, new Action(this.factory, p));
            } else if (a.getType() === ANTLRv4Parser.ACTION) {
                raf.actions.set(g.lexerActions.get(a)!, new Action(this.factory, a));
            }
        }

        if (raf.actions.size > 0 && !lexer.actionFuncs.has(r)) {
            // Only add to lexer if the function actually contains actions.
            lexer.actionFuncs.set(r, raf);
        }
    }

    public rule(r: Rule): RuleFunction {
        return this.factory.rule(r)!;
    }

    public rulePostamble(ruleFunction: RuleFunction, r: Rule): SrcOp[] {
        return this.factory.rulePostamble(ruleFunction, r)!;
    }

    public getGrammar(): Grammar {
        return this.factory.g;
    }

    public alternative(alt: Alternative, outerMost: boolean): CodeBlockForAlt {
        return this.factory.alternative(alt, outerMost)!;
    }

    public finishAlternative(blk: CodeBlockForAlt, ops: SrcOp[], outerMost: boolean): CodeBlockForAlt {
        return this.factory.finishAlternative(blk, ops);
    }

    public ruleRef(id: GrammarAST, label: GrammarAST | null, args: GrammarAST | null): SrcOp[] {
        return this.factory.ruleRef(id, label, args)!;
    }

    public tokenRef(id: GrammarAST, label: GrammarAST | null, args: GrammarAST | null): SrcOp[] {
        return this.factory.tokenRef(id, label, args)!;
    }

    public stringRef(id: GrammarAST, label: GrammarAST | null): SrcOp[] {
        return this.factory.stringRef(id, label)!;
    }

    /** (A|B|C) possibly with ebnfRoot and label. */
    public set(setAST: GrammarAST, labelAST: GrammarAST | null, invert: boolean): SrcOp[] {
        return this.factory.set(setAST, labelAST, invert)!;
    }

    public epsilon(alt: Alternative, outerMost: boolean): CodeBlockForAlt {
        return this.factory.epsilon(alt, outerMost)!;
    }

    public wildcard(ast: GrammarAST, labelAST: GrammarAST | null): SrcOp[] {
        return this.factory.wildcard(ast, labelAST)!;
    }

    public action(ast: ActionAST): SrcOp[] {
        return this.factory.action(ast)!;
    }

    public sempred(ast: ActionAST): SrcOp[] {
        return this.factory.sempred(ast)!;
    }

    public getChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[], label: GrammarAST | null): Choice {
        return this.factory.getChoiceBlock(blkAST, alts, label)!;
    }

    public getEBNFBlock(ebnfRoot: GrammarAST | null, alts: CodeBlockForAlt[]): Choice {
        return this.factory.getEBNFBlock(ebnfRoot, alts)!;
    }

    public needsImplicitLabel(id: GrammarAST, op: ILabeledOp): boolean {
        return this.factory.needsImplicitLabel(id, op);
    }

    public get currentRuleFunction(): RuleFunction | undefined {
        if (this.currentRuleStack.length > 0) {
            return this.currentRuleStack[this.currentRuleStack.length - 1];
        }

        return undefined;
    }

    private pushCurrentRule(r: RuleFunction): void {
        this.currentRuleStack.push(r);
    }

    private popCurrentRule(): RuleFunction | null {
        if (this.currentRuleStack.length > 0) {
            return this.currentRuleStack.pop()!;
        }

        return null;
    }

}
