/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import type { IToolConfiguration } from "../../config/config.js";
import { ModelElement } from "../../misc/ModelElement.js";
import { IOutputModelFactory } from "../IOutputModelFactory.js";
import { Action } from "./Action.js";
import { ActionChunk } from "./chunk/ActionChunk.js";
import { ActionText } from "./chunk/ActionText.js";
import { OutputFile } from "./OutputFile.js";
import { Parser } from "./Parser.js";

export class ParserFile extends OutputFile {
    public genPackage?: string; // from -package cmd-line
    public exportMacro?: string; // from -DexportMacro cmd-line
    public genListener: boolean; // from -listener cmd-line
    public genVisitor: boolean; // from -visitor cmd-line

    public grammarName: string;

    @ModelElement
    public parser: Parser;

    @ModelElement
    public namedActions: Map<string, Action>;

    @ModelElement
    public contextSuperClass: ActionChunk;

    public constructor(factory: IOutputModelFactory, fileName: string, configuration: IToolConfiguration) {
        super(factory, fileName);
        const g = factory.g;
        this.namedActions = this.buildNamedActions(g);
        this.genPackage = configuration.package;
        this.exportMacro = g.getOptionString("exportMacro");

        // Need the below members in the ST for Python, C++.
        this.genListener = configuration.generateListener ?? true;
        this.genVisitor = configuration.generateVisitor ?? false;
        this.grammarName = g.name;

        if (g.getOptionString("contextSuperClass")) {
            this.contextSuperClass = new ActionText(undefined, g.getOptionString("contextSuperClass"));
        }
    }
}
