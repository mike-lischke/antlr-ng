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

// Start with a fresh virtual file system.
const volume = new Volume();
const fs = createFsFromVolume(volume);
useFileSystem(fs);

const parameters = parseToolParameters(process.argv.slice(2));

// Provide the templates in the virtual file system.
fs.mkdirSync("/templates", { recursive: true });
copyFolderToMemFs(fs, fileURLToPath(dirname(import.meta.url) + "/../templates"), "/templates", true);

// Copy all files to the memfs file system. We use the same files for all files. It doesn't matter for memfs.
if (parameters.lib) {
    copyFolderToMemFs(fs, parameters.lib, parameters.lib, false);
}

// Also copy the grammar and token files.
for (const grammarFile of parameters.grammarFiles) {
    const parentDir = dirname(grammarFile);

    fs.mkdirSync(parentDir, { recursive: true });
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.g4/);
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.tokens/);
}

const tool = new Tool();
const success = tool.generate(parameters);

if (!success) {
    process.exit(1);
}

// Copy the generated files to the physical output directory.
nodeFs.mkdirSync(parameters.outputDirectory, { recursive: true });
copyFolderFromMemFs(fs, parameters.outputDirectory, parameters.outputDirectory, false);

process.exit(0);
