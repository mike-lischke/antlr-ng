/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import type { IToolConfiguration } from "../../config/config.js";
import { ModelElement } from "../../misc/ModelElement.js";
import { OrderedHashMap } from "../../misc/OrderedHashMap.js";
import { IOutputModelFactory } from "../IOutputModelFactory.js";
import { Action } from "./Action.js";
import { OutputFile } from "./OutputFile.js";

/**
 * A model object representing a parse tree listener file.
 *  These are the rules specific events triggered by a parse tree visitor.
 */
export class ListenerFile extends OutputFile {
    // These fields are used in some code generation templates:

    public genPackage?: string;
    public accessLevel?: string;
    public exportMacro?: string;
    public grammarName: string;
    public parserName: string;

    /** The names of all listener contexts. */
    public listenerNames = new Set<string>();

    /**
     * For listener contexts created for a labeled outer alternative, maps from a listener context name to the name
     * of the rule which defines the context.
     */
    public listenerLabelRuleNames = new OrderedHashMap<string, string>();

    @ModelElement
    public header: Action;

    @ModelElement
    public namedActions: Map<string, Action>;

    public constructor(factory: IOutputModelFactory, fileName: string, configuration: IToolConfiguration) {
        super(factory, fileName);

        const g = factory.g;
        this.parserName = g.getRecognizerName();
        this.grammarName = g.name;
        this.namedActions = this.buildNamedActions(g, (ast) => {
            return ast.getScope() === null;
        });

        for (const r of g.rules.values()) {
            const labels = r.getAltLabels();
            if (labels !== null) {
                for (const key of labels.keys()) {
                    this.listenerNames.add(key);
                    this.listenerLabelRuleNames.set(key, r.name);
                }
            } else {
                // Only add rule context if no labels.
                this.listenerNames.add(r.name);
            }
        }

        const ast = g.namedActions.get("header");
        if (ast?.getScope() === null) {
            this.header = new Action(factory, ast);
        }

        this.genPackage = configuration.package;
        this.accessLevel = g.getOptionString("accessLevel");
        this.exportMacro = g.getOptionString("exportMacro");
    }
}
