/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { DecisionState, IntervalSet, PlusLoopbackState, StarLoopEntryState } from "antlr4ng";

import { ANTLRv4Parser } from "../generated/ANTLRv4Parser.js";

import type { IToolConfiguration } from "../config/config.js";
import { disjoint } from "../support/helpers.js";
import { Alternative } from "../tool/Alternative.js";
import type { Grammar } from "../tool/Grammar.js";
import { LeftRecursiveRule } from "../tool/LeftRecursiveRule.js";
import { Rule } from "../tool/Rule.js";
import { ActionAST } from "../tool/ast/ActionAST.js";
import { BlockAST } from "../tool/ast/BlockAST.js";
import { GrammarAST } from "../tool/ast/GrammarAST.js";
import type { IQuantifierAST } from "../tool/ast/IQuantifierAST.js";
import { TerminalAST } from "../tool/ast/TerminalAST.js";
import { CodeGenerator } from "./CodeGenerator.js";
import type { IOutputModelFactory } from "./IOutputModelFactory.js";
import type { OutputModelController } from "./OutputModelController.js";
import { Action } from "./model/Action.js";
import { AddToLabelList } from "./model/AddToLabelList.js";
import { AltBlock } from "./model/AltBlock.js";
import { Choice } from "./model/Choice.js";
import { CodeBlockForAlt } from "./model/CodeBlockForAlt.js";
import { CodeBlockForOuterMostAlt } from "./model/CodeBlockForOuterMostAlt.js";
import { ILabeledOp } from "./model/ILabeledOp.js";
import { InvokeRule } from "./model/InvokeRule.js";
import { LL1AltBlock } from "./model/LL1AltBlock.js";
import { LL1OptionalBlock } from "./model/LL1OptionalBlock.js";
import { LL1OptionalBlockSingleAlt } from "./model/LL1OptionalBlockSingleAlt.js";
import { LL1PlusBlockSingleAlt } from "./model/LL1PlusBlockSingleAlt.js";
import { LL1StarBlockSingleAlt } from "./model/LL1StarBlockSingleAlt.js";
import { LeftRecursiveRuleFunction } from "./model/LeftRecursiveRuleFunction.js";
import type { Lexer } from "./model/Lexer.js";
import type { LexerFile } from "./model/LexerFile.js";
import { MatchNotSet } from "./model/MatchNotSet.js";
import { MatchSet } from "./model/MatchSet.js";
import { MatchToken } from "./model/MatchToken.js";
import { OptionalBlock } from "./model/OptionalBlock.js";
import { Parser } from "./model/Parser.js";
import { ParserFile } from "./model/ParserFile.js";
import { PlusBlock } from "./model/PlusBlock.js";
import { RuleFunction } from "./model/RuleFunction.js";
import { SemPred } from "./model/SemPred.js";
import { SrcOp } from "./model/SrcOp.js";
import { StarBlock } from "./model/StarBlock.js";
import { TestSetInline } from "./model/TestSetInline.js";
import { Wildcard } from "./model/Wildcard.js";
import type { CodeBlock } from "./model/decl/CodeBlock.js";
import { Decl } from "./model/decl/Decl.js";
import { RuleContextDecl } from "./model/decl/RuleContextDecl.js";
import { TokenDecl } from "./model/decl/TokenDecl.js";
import { TokenListDecl } from "./model/decl/TokenListDecl.js";

export class ParserFactory implements IOutputModelFactory {
    public readonly g: Grammar;
    public controller: OutputModelController;

    private readonly gen: CodeGenerator;

    public constructor(gen: CodeGenerator, private forceAtn?: boolean) {
        this.gen = gen;
        this.g = gen.g!;
    }

    public parserFile(fileName: string, configuration: IToolConfiguration): ParserFile {
        return new ParserFile(this, fileName, configuration);
    }

    public parser(file: ParserFile): Parser {
        return new Parser(this, file);
    }

    public lexerFile(fileName: string): LexerFile | undefined {
        return undefined;
    }

    public getGrammar(): Grammar | undefined {
        return this.g;
    }

    public lexer(file: LexerFile): Lexer | undefined {
        return undefined;
    }

    public rule(r: Rule): RuleFunction {
        if (r instanceof LeftRecursiveRule) {
            return new LeftRecursiveRuleFunction(this, r);
        }

        return new RuleFunction(this, r);
    }

    public epsilon(alt: Alternative, outerMost: boolean): CodeBlockForAlt {
        return this.alternative(alt, outerMost);
    }

    public alternative(alt: Alternative, outerMost: boolean): CodeBlockForAlt {
        if (outerMost) {
            return new CodeBlockForOuterMostAlt(this, alt);
        }

        return new CodeBlockForAlt(this);
    }

    public finishAlternative(blk: CodeBlockForAlt, ops: SrcOp[] | undefined): CodeBlockForAlt {
        blk.ops = ops ?? [];

        return blk;
    }

    public stringRef(id: GrammarAST, label: GrammarAST | null): SrcOp[] | undefined {
        return this.tokenRef(id, label, null);
    }

    public action(ast: ActionAST): SrcOp[] {
        return [new Action(this, ast)];
    }

    public sempred(ast: ActionAST): SrcOp[] {
        return [new SemPred(this, ast)];
    }

    public ruleRef(id: GrammarAST, label: GrammarAST | null, args: GrammarAST): SrcOp[] {
        const invokeOp = new InvokeRule(this, id, label);

        // If no manual label and action refs as token/rule not label, we need to define implicit label.
        if (this.controller.needsImplicitLabel(id, invokeOp)) {
            this.defineImplicitLabel(id, invokeOp);
        }

        const listLabelOp = this.getAddToListOpIfListLabelPresent(invokeOp, label);

        return [invokeOp, listLabelOp!];
    }

    public getCurrentRuleFunction(): RuleFunction | undefined {
        return this.controller.currentRuleFunction;
    }

    public tokenRef(id: GrammarAST, labelAST: GrammarAST | null, args: GrammarAST | null): SrcOp[] {
        const matchOp = new MatchToken(this, id as TerminalAST);

        if (labelAST) {
            const label = labelAST.getText();
            const rf = this.getCurrentRuleFunction()!;
            if (labelAST.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
                // Add Token _X and List<Token> X decls.
                this.defineImplicitLabel(id, matchOp);
                const l = this.getTokenListLabelDecl(label);
                rf.addContextDecl(id.getAltLabel()!, l);
            } else {
                const d = this.getTokenLabelDecl(label);
                matchOp.labels.push(d);
                rf.addContextDecl(id.getAltLabel()!, d);
            }
        }

        if (this.controller.needsImplicitLabel(id, matchOp)) {
            this.defineImplicitLabel(id, matchOp);
        }

        const listLabelOp = this.getAddToListOpIfListLabelPresent(matchOp, labelAST);

        return [matchOp, listLabelOp!];
    }

    public getTokenLabelDecl(label: string): Decl {
        return new TokenDecl(this, label);
    }

    public getTokenListLabelDecl(label: string): TokenListDecl {
        return new TokenListDecl(this, this.gen.target.getListLabel(label));
    }

    public set(setAST: GrammarAST, labelAST: GrammarAST | null, invert: boolean): SrcOp[] {
        let matchOp: MatchSet;
        if (invert) {
            matchOp = new MatchNotSet(this, setAST);
        } else {
            matchOp = new MatchSet(this, setAST);
        }

        if (labelAST !== null) {
            const label = labelAST.getText();
            const rf = this.getCurrentRuleFunction()!;
            if (labelAST.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
                this.defineImplicitLabel(setAST, matchOp);
                const l = this.getTokenListLabelDecl(label);
                rf.addContextDecl(setAST.getAltLabel()!, l);
            } else {
                const d = this.getTokenLabelDecl(label);
                matchOp.labels.push(d);
                rf.addContextDecl(setAST.getAltLabel()!, d);
            }
        }

        if (this.controller.needsImplicitLabel(setAST, matchOp)) {
            this.defineImplicitLabel(setAST, matchOp);
        }

        const listLabelOp = this.getAddToListOpIfListLabelPresent(matchOp, labelAST);

        return [matchOp, listLabelOp!];
    }

    public wildcard(ast: GrammarAST, labelAST: GrammarAST | null): SrcOp[] {
        const wild = new Wildcard(this, ast);

        if (labelAST) {
            const label = labelAST.getText();
            const d = this.getTokenLabelDecl(label);
            wild.labels.push(d);
            this.getCurrentRuleFunction()!.addContextDecl(ast.getAltLabel()!, d);
            if (labelAST.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
                const l = this.getTokenListLabelDecl(label);
                this.getCurrentRuleFunction()!.addContextDecl(ast.getAltLabel()!, l);
            }
        }

        if (this.controller.needsImplicitLabel(ast, wild)) {
            this.defineImplicitLabel(ast, wild);
        }

        const listLabelOp = this.getAddToListOpIfListLabelPresent(wild, labelAST);

        return [wild, listLabelOp!];
    }

    public getChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[], labelAST: GrammarAST | null): Choice {
        const decision = (blkAST.atnState as DecisionState).decision;
        let c: Choice;
        if (!this.forceAtn && disjoint(this.g.decisionLookahead[decision])) {
            c = this.getLL1ChoiceBlock(blkAST, alts);
        } else {
            c = this.getComplexChoiceBlock(blkAST, alts);
        }

        if (labelAST) {
            // For x=(...), define x or x_list.
            const label = labelAST.getText();
            const d = this.getTokenLabelDecl(label);
            c.label = d;
            this.getCurrentRuleFunction()!.addContextDecl(labelAST.getAltLabel()!, d);

            if (labelAST.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
                const listLabel = this.gen.target.getListLabel(label);
                const l = new TokenListDecl(this, listLabel);
                this.getCurrentRuleFunction()!.addContextDecl(labelAST.getAltLabel()!, l);
            }
        }

        return c;
    }

    public getEBNFBlock(ebnfRoot: GrammarAST, alts: CodeBlockForAlt[]): Choice | undefined {
        if (!this.forceAtn) {
            let decision: number;
            if (ebnfRoot.getType() === ANTLRv4Parser.POSITIVE_CLOSURE) {
                decision = (ebnfRoot.atnState as PlusLoopbackState).decision;
            } else if (ebnfRoot.getType() === ANTLRv4Parser.CLOSURE) {
                decision = (ebnfRoot.atnState as StarLoopEntryState).decision;
            } else {
                decision = (ebnfRoot.atnState as DecisionState).decision;
            }

            if (disjoint(this.g.decisionLookahead[decision])) {
                return this.getLL1EBNFBlock(ebnfRoot, alts);
            }
        }

        return this.getComplexEBNFBlock(ebnfRoot, alts);
    }

    public getLL1ChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[]): Choice {
        return new LL1AltBlock(this, blkAST, alts);
    }

    public getComplexChoiceBlock(blkAST: BlockAST, alts: CodeBlockForAlt[]): Choice {
        return new AltBlock(this, blkAST, alts);
    }

    public getLL1EBNFBlock(ebnfRoot: GrammarAST, alts: CodeBlockForAlt[]): Choice | undefined {
        const ebnf = ebnfRoot.getType();
        let c;
        switch (ebnf) {
            case ANTLRv4Parser.OPTIONAL: {
                if (alts.length === 1) {
                    c = new LL1OptionalBlockSingleAlt(this, ebnfRoot, alts);
                } else {
                    c = new LL1OptionalBlock(this, ebnfRoot, alts);
                }

                break;
            }

            case ANTLRv4Parser.CLOSURE: {
                if (alts.length === 1) {
                    c = new LL1StarBlockSingleAlt(this, ebnfRoot, alts);
                } else {
                    c = this.getComplexEBNFBlock(ebnfRoot, alts);
                }

                break;
            }

            case ANTLRv4Parser.POSITIVE_CLOSURE: {
                if (alts.length === 1) {
                    c = new LL1PlusBlockSingleAlt(this, ebnfRoot, alts);
                } else {
                    c = this.getComplexEBNFBlock(ebnfRoot, alts);
                }

                break;
            }

            default:

        }

        return c;
    }

    public getComplexEBNFBlock(ebnfRoot: GrammarAST, alts: CodeBlockForAlt[]): Choice | undefined {
        const ebnf = ebnfRoot.getType();
        let c;
        switch (ebnf) {
            case ANTLRv4Parser.OPTIONAL: {
                c = new OptionalBlock(this, ebnfRoot, alts);
                break;
            }

            case ANTLRv4Parser.CLOSURE: {
                c = new StarBlock(this, ebnfRoot as IQuantifierAST, alts);
                break;
            }

            case ANTLRv4Parser.POSITIVE_CLOSURE: {
                c = new PlusBlock(this, ebnfRoot as IQuantifierAST, alts);
                break;
            }

            default:

        }

        return c;
    }

    public getLL1Test(look: IntervalSet, blkAST: GrammarAST): SrcOp[] {
        return [new TestSetInline(this, blkAST, look, this.gen.target.getInlineTestSetWordSize())];
    }

    public getGenerator(): CodeGenerator {
        return this.gen;
    }

    public getCurrentOuterMostAlt(): Alternative {
        return this.controller.currentOuterMostAlt;
    }

    public getCurrentBlock(): CodeBlock {
        return this.controller.currentBlock;
    }

    public rulePostamble(ruleFunction: RuleFunction, r: Rule): SrcOp[] | undefined {
        if (r.namedActions.has("after") || r.namedActions.has("finally")) {
            // See OutputModelController.buildLeftRecursiveRuleFunction and Parser.exitRule for other places
            // which set stop.
            const gen = this.getGenerator();
            const codegenTemplates = gen.templates;
            const setStopTokenAST = codegenTemplates.getInstanceOf("recRuleSetStopToken")!;
            const setStopTokenAction = new Action(this, ruleFunction.ruleCtx, setStopTokenAST);
            const ops = new Array<SrcOp>(1);
            ops.push(setStopTokenAction);

            return ops;
        }

        return undefined;
    }

    public needsImplicitLabel(id: GrammarAST, op: ILabeledOp): boolean {
        const currentOuterMostAlt = this.getCurrentOuterMostAlt();
        const actionRefsAsToken = currentOuterMostAlt.tokenRefsInActions.has(id.getText());
        const actionRefsAsRule = currentOuterMostAlt.ruleRefsInActions.has(id.getText());

        return op.labels.length === 0 && (actionRefsAsToken || actionRefsAsRule);
    }

    public defineImplicitLabel(ast: GrammarAST, op: ILabeledOp): void {
        let d: Decl;

        if (ast.getType() === ANTLRv4Parser.SET || ast.getType() === ANTLRv4Parser.WILDCARD) {
            const implLabel = this.gen.target.getImplicitSetLabel(String(ast.token!.tokenIndex));
            d = this.getTokenLabelDecl(implLabel);
            (d as TokenDecl).isImplicit = true;
        } else if (ast.getType() === ANTLRv4Parser.RULE_REF) { // A rule reference?
            const r = this.g.getRule(ast.getText())!;
            const implLabel = this.gen.target.getImplicitRuleLabel(ast.getText());
            const ctxName = this.gen.target.getRuleFunctionContextStructName(r);
            d = new RuleContextDecl(this, implLabel, ctxName);
            (d as RuleContextDecl).isImplicit = true;
        } else {
            const implLabel = this.gen.target.getImplicitTokenLabel(ast.getText());
            d = this.getTokenLabelDecl(implLabel);
            (d as TokenDecl).isImplicit = true;
        }

        op.labels.push(d);

        // All labels must be in scope struct in case we exec action out of context.
        this.getCurrentRuleFunction()!.addContextDecl(ast.getAltLabel()!, d);
    }

    public getAddToListOpIfListLabelPresent(op: ILabeledOp, label: GrammarAST | null): AddToLabelList | null {
        let labelOp = null;
        if (label?.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
            const target = this.gen.target;
            const listLabel = target.getListLabel(label.getText());
            const listRuntimeName = target.escapeIfNeeded(listLabel);
            labelOp = new AddToLabelList(this, listRuntimeName, op.labels[0]);
        }

        return labelOp;
    }
}
