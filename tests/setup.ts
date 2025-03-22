/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { fs } from "memfs";

import { copyFolderToMemFs } from "../src/support/fs-helpers.js";
import { useFileSystem } from "../src/tool-parameters.js";

if (!fs.existsSync("/templates")) {
    // Prepare the virtual file system for the string templates.
    fs.mkdirSync("/templates");
    copyFolderToMemFs(fs, "templates", "/templates", true);

    useFileSystem(fs);
}
