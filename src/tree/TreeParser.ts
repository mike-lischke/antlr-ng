/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import { Token, type RecognitionException } from "antlr4ng";

import { Constants } from "../Constants.js";
import type { GrammarAST } from "../tool/ast/GrammarAST.js";
import type { ErrorManager } from "../tool/ErrorManager.js";
import { CommonTree } from "./CommonTree.js";
import type { CommonTreeAdaptor } from "./CommonTreeAdaptor.js";
import { CommonTreeNodeStream } from "./CommonTreeNodeStream.js";
import { createRecognizerSharedState, type IRecognizerSharedState } from "./misc/IRecognizerSharedState.js";
import { MismatchedTreeNodeException } from "./MismatchTreeNodeException.js";
import { ErrorType } from "../tool/ErrorType.js";

/**
 * A parser for a stream of tree nodes. "tree grammars" result in a subclass of this. All the error reporting
 * and recovery is shared with Parser via the BaseRecognizer superclass.
 */
export class TreeParser {
    private static dotdot = /.*[^.]\\.\\.[^.].*/g;
    private static doubleEtc = /.*\\.\\.\\.\\s+\\.\\.\\..*/g;

    protected input: CommonTreeNodeStream;
    protected errorManager: ErrorManager;

    /**
     * State of a lexer, parser, or tree parser are collected into a state object so the state can be shared.
     * This sharing is needed to have one grammar import others and share same error variables and other state
     * variables.  It's a kind of explicit multiple inheritance via delegation of methods and shared state.
     */
    protected state: IRecognizerSharedState;

    public constructor(errorManager: ErrorManager, input?: CommonTreeNodeStream, state?: IRecognizerSharedState) {
        this.errorManager = errorManager;
        this.state = state ?? createRecognizerSharedState();
        this.input = input ?? new CommonTreeNodeStream(new CommonTree());
    }

    /**
     * The worker for inContext. It's static and full of parameters for testing purposes.
     */
    public static inContext(adaptor: CommonTreeAdaptor, tokenNames: string[], t: CommonTree,
        context: string): boolean {
        if (context.match(TreeParser.dotdot)) { // don't allow "..", must be "..."
            throw new Error("invalid syntax: ..");
        }

        if (context.match(TreeParser.doubleEtc)) { // don't allow double "..."
            throw new Error("invalid syntax: ... ...");
        }

        context = context.replaceAll("\\.\\.\\.", " ... "); // ensure spaces around ...
        context = context.trim();
        const nodes = context.split(/\s+/);
        let ni = nodes.length - 1;
        let run: CommonTree | null = adaptor.getParent(t);
        while (ni >= 0 && run !== null) {
            if (nodes[ni] === "...") {
                // walk upwards until we see nodes[ni-1] then continue walking
                if (ni === 0) {
                    return true;
                }

                // ... at start is no-op
                const goal = nodes[ni - 1];
                const ancestor = TreeParser.getAncestor(adaptor, tokenNames, run, goal);
                if (ancestor === null) {
                    return false;
                }

                run = ancestor;
                ni--;
            }

            const name = tokenNames[adaptor.getType(run)];
            if (name !== nodes[ni]) {
                return false;
            }

            // advance to parent and to previous element in context node list
            ni--;
            run = adaptor.getParent(run);
        }

        if (run === null && ni >= 0) {
            return false;
        }

        // at root but more nodes to match
        return true;
    }

    /** Helper for static inContext */
    private static getAncestor(adaptor: CommonTreeAdaptor, tokenNames: string[], t: CommonTree | null,
        goal: string): CommonTree | null {
        while (t !== null) {
            const name = tokenNames[adaptor.getType(t)];
            if (name === goal) {
                return t;
            }

            t = adaptor.getParent(t);
        }

        return null;
    }

    /**
     * Match '.' in tree parser has special meaning.  Skip node or
     *  entire tree if node has children.  If children, scan until
     *  corresponding UP node.
     */
    public matchAny(): void {
        this.state.errorRecovery = false;
        this.state.failed = false;

        let lookAhead = this.input.LT(1);
        if (lookAhead && this.input.getTreeAdaptor().getChildCount(lookAhead) === 0) {
            this.input.consume(); // Not subtree, consume 1 node and return.

            return;
        }

        // Current node is a subtree, skip to corresponding UP. Must count nesting level to get right UP
        let level = 0;
        if (lookAhead) {
            let tokenType = this.input.getTreeAdaptor().getType(lookAhead);
            while (tokenType !== Token.EOF && !(tokenType === Constants.UP && level === 0)) {
                this.input.consume();
                lookAhead = this.input.LT(1);
                if (lookAhead) {
                    tokenType = this.input.getTreeAdaptor().getType(lookAhead);
                    if (tokenType === Constants.DOWN) {
                        level++;
                    } else {
                        if (tokenType === Constants.UP) {
                            level--;
                        }
                    }
                }
            }
        }

        this.input.consume(); // consume UP
    }

    /**
     * Check if current node in input has a context.  Context means sequence
     *  of nodes towards root of tree.  For example, you might say context
     *  is "MULT" which means my parent must be MULT.  "CLASS VARDEF" says
     *  current node must be child of a VARDEF and whose parent is a CLASS node.
     *  You can use "..." to mean zero-or-more nodes.  "METHOD ... VARDEF"
     *  means my parent is VARDEF and somewhere above that is a METHOD node.
     *  The first node in the context is not necessarily the root.  The context
     *  matcher stops matching and returns true when it runs out of context.
     *  There is no way to force the first node to be the root.
     */
    public inContext(context: string): boolean {
        return TreeParser.inContext(this.input.getTreeAdaptor(), this.getTokenNames(), this.input.LT(1)!, context);
    }

    /**
     * Match current input symbol against ttype. Attempt single token insertion or deletion error recovery. If
     * that fails, throw MismatchedTokenException.
     */
    public match<T extends GrammarAST = GrammarAST>(input: CommonTreeNodeStream, ttype: number): T | null {
        this.state.failed = false;

        const matchedSymbol = input.LT(1) as T | null;
        if (input.LA(1) === ttype) {
            input.consume();
            this.state.errorRecovery = false;

            return matchedSymbol;
        }

        if (this.state.backtracking > 0) {
            this.state.failed = true;

            return matchedSymbol;
        }

        throw new MismatchedTreeNodeException(ttype);
    }

    /**
     * Report a recognition problem.
     *
     * This method sets errorRecovery to indicate the parser is recovering not parsing.  Once in recovery mode,
     * no errors are generated. To get out of recovery mode, the parser must successfully match
     * a token (after a resync). So it will go:
     *
     *   1. error occurs
     * 	 2. enter recovery mode, report error
     * 	 3. consume until token found in resynch set
     * 	 4. try to resume parsing
     * 	 5. next match() will reset errorRecovery mode
     *
     *  If you override, make sure to update syntaxErrors if you care about that.
     */
    public reportError(e: RecognitionException): void {
        // If we've already reported an error and have not matched a token yet successfully, don't report any errors.
        if (this.state.errorRecovery) {
            return;
        }

        this.state.syntaxErrors++;
        this.state.errorRecovery = true;

        this.errorManager.toolError(ErrorType.INTERNAL_ERROR, e);
    }

    protected setBacktrackingLevel(n: number): void {
        this.state.backtracking = n;
    }

    /** Return whether or not a backtracking attempt failed. */
    protected get failed(): boolean {
        return this.state.failed;
    }

    protected set failed(value: boolean) {
        this.state.failed = value;
    }

    /**
     * Used to print out token names like ID during debugging and error reporting.  The generated parsers implement
     * a method that overrides this to point to their String[] tokenNames.
     */
    protected getTokenNames(): string[] {
        return [];
    }
}
