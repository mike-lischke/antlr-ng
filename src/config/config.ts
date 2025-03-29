/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/** Defines the configuration structure for a target generator. */
export interface ITargetGenerator {
    /** The name of the generator. */
    name: string;

    /** The target language for the generator. */
    language: string;

    /** Allows to alter a grammar text before it is processed by antlr-ng. */
    inputFilter?: (grammar: string) => string;

    /**
     * Allows to alter the output of antlr-ng before it is processed by the generator
     * (e.g. to remove unwanted parts). This is called once per generated file, right before it is written to
     * the file system.
     */
    outputFilter?: (code: string) => string;
}

/** A configuration for the antlr-ng tool. */
export interface IToolConfiguration {
    /**
     * A list of grammar files as input for the tool. Only list files that belong together (e.g. a lexer and
     * a parser grammar. Relative paths are resolved to the current working directory.
     */
    grammarFiles: string[];

    /**
     * @deprecated Use the language field in a generator instead.
     *
     * The target programming language for the generated files.
     */
    language?: string;

    /** The output directory for the generated files. Relative paths are resolved to the current working directory. */
    outputDirectory: string,

    /**
     * @deprecated This will be removed when grammar imports can take paths.
     *
     * Specify location of grammars, tokens files. Relative paths are resolved to the current working directory.
     */
    lib?: string,

    /** Generate rule augmented transition network diagrams. (default: false) */
    atn?: boolean,

    /** Show exception details when available for errors and warnings. (default: false) */
    longMessages?: boolean;

    /** Generate a parse tree listener (default: false). */
    generateListener?: boolean,

    /** Generate a parse tree visitor (default: false). */
    generateVisitor?: boolean,

    /** Generate an interpreter data file (*.interp, default: false). */
    generateInterpreterData?: boolean;

    /** Specify a package/namespace for the generated code. */
    package?: string,

    /** Generate a diagram of grammar dependencies. (default: false). */
    generateDependencies?: boolean,

    /** Treat warnings as errors. (default: false) */
    warningsAreErrors?: boolean,

    /** Use the ATN simulator for all predictions. (default: false) */
    forceAtn?: boolean,

    /** Dump lots of logging info to antlrng-{timestamp}.log. (default: false) */
    log?: boolean,

    /** Not used yet. This field defines the configuration of output generators. */
    generators?: ITargetGenerator[],
}

/**
 * Used to defined a user configuration for antlr-ng. Input values are evaluated and completed with default values.
 *
 * @param config The user configuration.
 *
 * @returns The final configuration.
 */
export const defineConfig = (config: IToolConfiguration): Required<IToolConfiguration> => {
    return {
        grammarFiles: config.grammarFiles,
        language: config.language ?? "TypeScript",
        outputDirectory: config.outputDirectory,
        lib: config.lib ?? "",
        atn: config.atn ?? false,
        longMessages: config.longMessages ?? false,
        generateListener: config.generateListener ?? false,
        generateVisitor: config.generateVisitor ?? false,
        generateInterpreterData: config.generateInterpreterData ?? false,
        package: config.package ?? "",
        generateDependencies: config.generateDependencies ?? false,
        warningsAreErrors: config.warningsAreErrors ?? false,
        forceAtn: config.forceAtn ?? false,
        log: config.log ?? false,
        generators: config.generators ?? [],
    };
};
