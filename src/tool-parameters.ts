/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { Command, Option } from "commander";
import { type IFs, fs as defaultFs } from "memfs";
import { useFileSystem as ufs } from "stringtemplate4ts";

export let fileSystem: IFs = defaultFs;

import { antlrVersion } from "./version.js";

/**
 * Registers a memfs file system that holds input files and gets the output.
 *
 * @param fs The file system to use.
 */
export const useFileSystem = (fs: IFs): void => {
    // antlr-ng and ST4TS share the same virtual file system.
    fileSystem = fs;
    ufs(fs);
};

/**
 * @deprecated Use config files instead.
 *
 * This is the legacy interface for the tool parameters. It is still supported for backward compatibility.
 */
export interface IToolParameters {
    /** The path to a config file. When given, none of the other values is used. */
    config?: string;

    grammarFiles: string[];

    define?: Record<string, string>,

    outputDirectory: string,
    lib?: string,
    atn?: boolean,
    encoding?: string,
    msgFormat?: string,
    longMessages?: boolean;
    generateListener?: boolean,
    generateVisitor?: boolean,
    package?: string,
    generateDependencies?: boolean,
    warningsAreErrors?: boolean,
    forceAtn?: boolean,
    log?: boolean,
    exactOutputDir?: boolean,
}

/**
 * @deprecated Use config files instead.
 *
 * Used to parse tool parameters given as string list. Usually, this is used for tests.
 *
 * @param args The list of arguments.
 *
 * @returns The parsed tool parameters.
 */
export const parseToolParameters = (args: string[]): IToolParameters => {
    const parseBoolean = (value: string | undefined, previous: boolean): boolean => {
        if (value == null) {
            return previous;
        }

        const lower = value.trim().toLowerCase();

        return lower === "true" || lower === "1" || lower === "on" || lower === "yes";
    };

    const defines: Record<string, string> = {};

    const parseKeyValuePair = (input: string): Record<string, string> => {
        const [key, value] = input.split("=");
        defines[key] = value;

        return defines;
    };

    const prepared = new Command()
        .option("-c, --config <path>", "specify a configuration file")
        .option("-o, --output-directory <path>", "specify output directory where all output is generated")
        .option("--lib <path>", "specify location of grammars, tokens files")
        .option<boolean>("--atn <boolean>", "Generate rule augmented transition network diagrams.", parseBoolean)
        .option("-e, --encoding <string>", "Specify grammar file encoding; e.g., ucs-2.")
        .addOption(new Option("--message-format <string>", "Specify output style for messages in antlr, gnu, " +
            "vs2005.").choices(["antlr", "gnu", "vs2005"]))
        .option<boolean>("--long-messages <boolean>",
            "Show exception details when available for errors and warnings.", parseBoolean)
        .option<boolean>("-l, --generate-listener <boolean>", "Generate parse tree listener.", parseBoolean)
        .option<boolean>("-v, --generate-visitor <boolean>", "Generate parse tree visitor.", parseBoolean)
        .option("-p, --package <name>", "Specify a package/namespace for the generated code.")
        .option<boolean>("-d, --generate-dependencies <boolean>", "Generate file dependencies.", parseBoolean)
        .option("-D, --define <key=value...>", "Set/override a grammar-level option.", parseKeyValuePair)
        .option<boolean>("-w, --warnings-are-errors <boolean>", "Treat warnings as errors.", parseBoolean)
        .option<boolean>("-f, --force-atn <boolean>", "Use the ATN simulator for all predictions.", parseBoolean)
        .option<boolean>("--log [boolean]", "Dump lots of logging info to antlrng-timestamp.log.", parseBoolean)
        .option<boolean>("--exact-output-dir <boolean>", "All output goes into -o dir regardless of paths/package",
            parseBoolean)
        .argument("<grammar...>", "A list of grammar files.")
        .version(`antlr-ng ${antlrVersion}`).action((_, parameters: IToolParameters, command: Command) => {
            // Make sure we only have a config file or other options, but not both.
            if (parameters.config && Object.values(parameters).length > 1) {
                console.error("Cannot use a config file together with other options.");

                process.exit(1);
            }
        });

    prepared.parse(args, { from: "user" });

    const result = prepared.opts<IToolParameters>();
    result.grammarFiles = prepared.args;

    return result;
};
