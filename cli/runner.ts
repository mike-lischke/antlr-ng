#!/usr/bin/env node

/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import * as nodeFs from "fs";
import { createFsFromVolume, Volume } from "memfs";

import { fileURLToPath } from "url";
import { Tool } from "../src/Tool.js";
import { copyFolderFromMemFs, copyFolderToMemFs, dirname } from "../src/support/fs-helpers.js";
import { parseToolParameters, useFileSystem } from "../src/tool-parameters.js";
import type { IToolConfiguration } from "../src/config/config.js";

// Start with a fresh virtual file system.
const volume = new Volume();
const fs = createFsFromVolume(volume);
useFileSystem(fs);

/** Load arguments and perpare the tool configuration. */
const parameters = parseToolParameters(process.argv.slice(2));
let configuration: IToolConfiguration | undefined;

if (parameters.config) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { default: config } = await import(parameters.config);
    configuration = config as IToolConfiguration;
} else {
    configuration = {
        grammarFiles: parameters.grammarFiles,
        outputDirectory: parameters.outputDirectory,
        lib: parameters.lib,
        atn: parameters.atn,
        longMessages: parameters.longMessages,
        generateListener: parameters.generateListener,
        generateVisitor: parameters.generateVisitor,
        package: parameters.package,
        generateDependencies: parameters.generateDependencies,
        warningsAreErrors: parameters.warningsAreErrors,
        forceAtn: parameters.forceAtn,
        log: parameters.log,
    };
}

// Provide the templates in the virtual file system.
fs.mkdirSync("/templates", { recursive: true });
copyFolderToMemFs(fs, fileURLToPath(dirname(import.meta.url) + "/../templates"), "/templates", true);

// Copy all files to the memfs file system. We use the same files for all files. It doesn't matter for memfs.
if (configuration.lib) {
    copyFolderToMemFs(fs, configuration.lib, configuration.lib, false);
}

// Also copy the grammar and token files.
for (const grammarFile of configuration.grammarFiles) {
    const parentDir = dirname(grammarFile);

    fs.mkdirSync(parentDir, { recursive: true });
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.g4/);
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.tokens/);
}

const tool = new Tool();
const success = tool.generate(configuration);

if (!success) {
    process.exit(1);
}

// Copy the generated files to the physical output directory.
nodeFs.mkdirSync(configuration.outputDirectory, { recursive: true });
copyFolderFromMemFs(fs, configuration.outputDirectory, configuration.outputDirectory, false);

process.exit(0);
