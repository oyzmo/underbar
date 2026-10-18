#!/usr/bin/env node
/* Cross-checks GSettings keys between the schema and the code.
 *
 * A key name that is right in the schema but mistyped in a get_boolean() call
 * throws inside gnome-shell at runtime, where it is painful to see and easy to
 * miss. This catches it on the way in, and also catches a schema key that
 * nothing reads -- usually a leftover from a renamed setting.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const schemaFile = path.join(root,
    'extension/schemas/org.gnome.shell.extensions.underbar.gschema.xml');
const sources = ['extension/extension.js', 'extension/prefs.js'];

const schema = fs.readFileSync(schemaFile, 'utf8');
const declared = new Set([...schema.matchAll(/<key\s+name="([^"]+)"/g)].map(m => m[1]));
if (!declared.size) {
    console.error('  no keys found in the schema -- has the file moved?');
    process.exit(1);
}

const problems = [];
const referenced = new Set();

const CALL = /(?:get_boolean|get_string|get_int|get_strv|set_boolean|set_string|set_int|set_strv|bind)\(\s*(['"])([^'"]+)\1/g;

for (const rel of sources) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');

    for (const m of src.matchAll(CALL)) {
        const key = m[2];
        referenced.add(key);
        if (!declared.has(key))
            problems.push(`${rel}: settings call uses "${key}", which the schema does not declare`);
    }
}

const orphaned = [...declared].filter(k => !referenced.has(k));
if (orphaned.length)
    problems.push(`schema declares keys nothing reads: ${orphaned.join(', ')}`);

if (problems.length) {
    for (const p of problems)
        console.error(`  ${p}`);
    process.exit(1);
}

console.log(`ok   ${declared.size} keys, all declared and all referenced`);
