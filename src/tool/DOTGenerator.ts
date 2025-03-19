/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import {
    ATNConfig, ATNState, AbstractPredicateTransition, ActionTransition, AtomTransition, BlockEndState, BlockStartState,
    DFA, DFAState, DecisionState, NotSetTransition, PlusBlockStartState, PlusLoopbackState, RangeTransition,
    RuleStartState, RuleStopState, RuleTransition, SetTransition, StarBlockStartState, StarLoopEntryState,
    StarLoopbackState, Token,
} from "antlr4ng";
import { STGroupFile, IST } from "stringtemplate4ts";

import { Utils } from "../misc/Utils.js";
import { Grammar } from "./Grammar.js";

/** The DOT (part of graphviz) generation aspect. */
export class DOTGenerator {
    /** Library of output templates; use `<attrname>` format. */
    private static readonly templatePath = "/templates/dot/graphs.stg";

    private static readonly stLib = new STGroupFile(this.templatePath);

    private arrowhead = "normal";
    private rankdir = "LR";
    private grammar: Grammar;

    public constructor(grammar: Grammar) {
        this.grammar = grammar;
    }

    /**
     * @returns a String containing a DOT description that, when displayed, will show the incoming state machine
     * visually.  All nodes reachable from startState will be included.
     */
    public getDOTFromState(startState: ATNState, isLexer = false, ruleNames?: string[]): string {
        ruleNames ??= Array.from(this.grammar.rules.keys());

        // The output DOT graph for visualization.
        const markedStates = new Set<ATNState>();
        const dot = DOTGenerator.stLib.getInstanceOf("atn");
        if (!dot) {
            throw new Error("no such template: atn");
        }

        dot.add("startState", startState.stateNumber);
        dot.add("rankdir", this.rankdir);

        const work: ATNState[] = [startState];

        while (true) {
            const s = work.shift();
            if (!s) {
                break;
            }

            if (markedStates.has(s)) {
                continue;
            }
            markedStates.add(s);

            // Don't go past end of rule node to the follow states.
            if (s instanceof RuleStopState) {
                continue;
            }

            // Make a DOT edge for each transition.
            let edgeST: IST | null;
            for (let i = 0; i < s.transitions.length; ++i) {
                const edge = s.transitions[i];
                if (edge instanceof RuleTransition) {
                    const rr = (edge);

                    // Don't jump to other rules, but display edge to follow node.
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    let label = "<" + ruleNames[rr.ruleIndex];
                    if ((rr.target as RuleStartState).isLeftRecursiveRule) {
                        label += `[${rr.precedence}]`;
                    }
                    label += ">";

                    edgeST.add("label", label);
                    edgeST.add("src", `s${s.stateNumber}`);
                    edgeST.add("target", `s${rr.followState.stateNumber}`);
                    edgeST.add("arrowhead", this.arrowhead);
                    dot.add("edges", edgeST);
                    work.push(rr.followState);
                    continue;
                }

                if (edge instanceof ActionTransition) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("action-edge");
                    if (!edgeST) {
                        throw new Error("no such template: action-edge");
                    }

                    edgeST.add("label", this.getEdgeLabel(edge.toString()));
                } else if (edge instanceof AbstractPredicateTransition) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    edgeST.add("label", this.getEdgeLabel(edge.toString()));
                } else if (edge.isEpsilon) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("epsilon-edge");
                    if (!edgeST) {
                        throw new Error("no such template: epsilon-edge");
                    }

                    edgeST.add("label", this.getEdgeLabel(edge.toString()));
                    let loopback = false;
                    if (edge.target instanceof PlusBlockStartState) {
                        loopback = s.equals((edge.target).loopBackState);
                    } else {
                        if (edge.target instanceof StarLoopEntryState) {
                            loopback = s.equals((edge.target).loopBackState);
                        }
                    }

                    edgeST.add("loopback", loopback);
                } else if (edge instanceof AtomTransition) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    let label = edge.labelValue.toString();
                    if (isLexer) {
                        if (edge.labelValue === Token.EOF) {
                            label = "EOF";
                        } else {
                            label = "'" + this.getEdgeLabel(String.fromCodePoint(edge.labelValue)) + "'";
                        }
                    } else {
                        label = this.grammar.getTokenDisplayName(edge.labelValue)!;
                    }

                    edgeST.add("label", this.getEdgeLabel(label));
                } else if (edge instanceof SetTransition) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    let label = edge.label.toString();
                    if (isLexer) {
                        label = edge.label.toString(true);
                    } else {
                        label = edge.label.toStringWithVocabulary(this.grammar.getVocabulary());
                    }

                    if (edge instanceof NotSetTransition) {
                        label = "~" + label;
                    }

                    edgeST.add("label", this.getEdgeLabel(label));
                } else if (edge instanceof RangeTransition) {
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    let label = edge.label.toString();
                    if (isLexer) {
                        label = edge.toString();
                    } else {
                        label = edge.label.toStringWithVocabulary(this.grammar.getVocabulary());
                    }

                    edgeST.add("label", this.getEdgeLabel(label));
                } else {
                    edgeST = DOTGenerator.stLib.getInstanceOf("edge");
                    if (!edgeST) {
                        throw new Error("no such template: edge");
                    }

                    edgeST.add("label", this.getEdgeLabel(edge.toString()));
                }

                edgeST.add("src", `s${s.stateNumber}`);
                edgeST.add("target", `s${edge.target.stateNumber}`);
                edgeST.add("arrowhead", this.arrowhead);
                if (s.transitions.length > 1) {
                    edgeST.add("transitionIndex", i);
                } else {
                    edgeST.add("transitionIndex", false);
                }

                dot.add("edges", edgeST);
                work.push(edge.target);
            }
        }

        for (const s of markedStates) {
            if (!(s instanceof RuleStopState)) {
                continue;
            }

            const st = DOTGenerator.stLib.getInstanceOf("stopstate");
            if (!st) {
                throw new Error("no such template: stopstate");
            }

            st.add("name", `s${s.stateNumber}`);
            st.add("label", this.getStateLabel(s));
            dot.add("states", st);
        }

        for (const s of markedStates) {
            if (s instanceof RuleStopState) {
                continue;
            }

            const st = DOTGenerator.stLib.getInstanceOf("state");
            if (!st) {
                throw new Error("no such template: state");
            }

            st.add("name", `s${s.stateNumber}`);
            st.add("label", this.getStateLabel(s));
            st.add("transitions", s.transitions);
            dot.add("states", st);
        }

        return dot.render();
    }

    public getDOTFromDFA(dfa: DFA, isLexer: boolean): string {
        if (!dfa.s0) {
            return "";
        }

        const dot = DOTGenerator.stLib.getInstanceOf("dfa");
        if (!dot) {
            throw new Error("no such template: dfa");
        }

        dot.add("name", `DFA${dfa.decision}`);
        dot.add("startState", dfa.s0.stateNumber);
        dot.add("rankdir", this.rankdir);

        // Define stop states first; seems to be a bug in DOT where double circle.
        for (const d of dfa.getStates()) {
            if (!d.isAcceptState) {
                continue;
            }

            const st = DOTGenerator.stLib.getInstanceOf("stopstate");
            if (!st) {
                throw new Error("no such template: stopstate");
            }

            st.add("name", `s${d.stateNumber}`);
            st.add("label", this.getStateLabel(d));
            dot.add("states", st);
        }

        for (const d of dfa.getStates()) {
            if (d.isAcceptState) {
                continue;
            }

            if (d.stateNumber === Number.MAX_VALUE) {
                continue;
            }

            const st = DOTGenerator.stLib.getInstanceOf("state");
            if (!st) {
                throw new Error("no such template: state");
            }

            st.add("name", `s${d.stateNumber}`);
            st.add("label", this.getStateLabel(d));
            dot.add("states", st);
        }

        for (const d of dfa.getStates()) {
            for (let i = 0; i < d.edges.length; i++) {
                const target = d.edges[i];
                if (target.stateNumber === Number.MAX_VALUE) {
                    continue;
                }

                const ttype = i - 1; // We shift up for EOF as -1 for parser.
                let label = ttype.toString();
                if (isLexer) {
                    label = "'" + this.getEdgeLabel(String.fromCodePoint(i)) + "'";
                } else {
                    label = this.grammar.getTokenDisplayName(ttype)!;
                }

                const st = DOTGenerator.stLib.getInstanceOf("edge");
                if (!st) {
                    throw new Error("no such template: edge");
                }

                st.add("label", label);
                st.add("src", `s${d.stateNumber}`);
                st.add("target", `s${target.stateNumber}`);
                st.add("arrowhead", this.arrowhead);
                dot.add("edges", st);
            }
        }

        const output = dot.render();

        return Utils.sortLinesInString(output);
    }

    private getStateLabel(s: DFAState | ATNState): string {
        if (s instanceof DFAState) {
            let buf = `s${s.stateNumber}`;

            if (s.isAcceptState) {
                buf += `=>${s.prediction}`;
            }

            if (s.requiresFullContext) {
                buf += "^";
            }

            const alts = s.getAltSet();
            if (alts !== null) {
                buf += "\\n";
                // Separate alts.
                const altList = Array.from(alts);
                altList.sort();
                const configurations = s.configs;
                for (let altIndex = 0; altIndex < altList.length; altIndex++) {
                    const alt = altList[altIndex];
                    if (altIndex > 0) {
                        buf += "\\n";
                    }
                    buf += `alt${alt}:`;

                    // Get a list of configs for just this alt it will help us print better later.
                    const configsInAlt = new Array<ATNConfig>();
                    for (const c of configurations) {
                        if (c.alt !== alt) {
                            continue;
                        }

                        configsInAlt.push(c);
                    }

                    let n = 0;
                    for (let cIndex = 0; cIndex < configsInAlt.length; cIndex++) {
                        const c = configsInAlt[cIndex];
                        ++n;
                        buf += c.toString(null, false);
                        if ((cIndex + 1) < configsInAlt.length) {
                            buf += ", ";
                        }

                        if (n % 5 === 0 && (configsInAlt.length - cIndex) > 3) {
                            buf += "\\n";
                        }
                    }
                }
            }

            return buf;
        } else {
            let stateLabel = "";

            if (s instanceof BlockStartState) {
                stateLabel += "&rarr;\\n";
            } else if (s instanceof BlockEndState) {
                stateLabel += "&larr;\\n";
            }

            stateLabel += s.stateNumber.toString();
            if (s instanceof PlusBlockStartState || s instanceof PlusLoopbackState) {
                stateLabel += "+";
            } else if (s instanceof StarBlockStartState
                || s instanceof StarLoopEntryState
                || s instanceof StarLoopbackState) {
                stateLabel += "*";
            }

            if (s instanceof DecisionState && s.decision >= 0) {
                stateLabel += `\\nd=${s.decision}`;
            }

            return stateLabel;
        }
    }

    /**
     * Fixes edge strings so they print out in DOT properly.
     */
    private getEdgeLabel(label: string): string {
        label = label.replaceAll("\\", "\\\\");
        label = label.replaceAll("\"", "\\\"");
        label = label.replaceAll("\n", "\\\\n");
        label = label.replaceAll("\r", "");

        return label;
    }
}
