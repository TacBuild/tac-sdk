import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';

import * as esmSdk from '@tonappchain/sdk';
import * as esmArtifacts from '@tonappchain/sdk/artifacts';
import * as esmTacTypes from '@tonappchain/sdk/artifacts/types/tac';
import * as esmTonTypes from '@tonappchain/sdk/artifacts/types/ton';

const require = createRequire(import.meta.url);
const cjsSdk = require('@tonappchain/sdk');
const cjsArtifacts = require('@tonappchain/sdk/artifacts');
const cjsTacTypes = require('@tonappchain/sdk/artifacts/types/tac');
const cjsTonTypes = require('@tonappchain/sdk/artifacts/types/ton');

test('resolves native ESM and CommonJS entry points', () => {
    const esmResolution = import.meta.resolve('@tonappchain/sdk');
    const cjsResolution = require.resolve('@tonappchain/sdk');

    assert.match(esmResolution, /\/dist\/esm\/src\/index\.mjs$/);
    assert.match(cjsResolution, /\/dist\/src\/index\.js$/);
    assert.notEqual(esmResolution, cjsResolution);
    assert.equal('default' in esmSdk, false);
    assert.deepEqual(Object.keys(esmSdk).sort(), Object.keys(cjsSdk).sort());
});

test('keeps ethers imports tree-shakeable in the ESM build', async () => {
    const esmRoot = new URL('../../dist/esm/', import.meta.url);
    const esmFiles = [
        new URL('src/index.mjs', esmRoot),
        new URL('artifacts/index.mjs', esmRoot),
        new URL('artifacts/tonTypes.mjs', esmRoot),
        new URL('artifacts/tacTypes.mjs', esmRoot),
        ...(await readdir(esmRoot, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
            .map((entry) => new URL(entry.name, esmRoot)),
    ];
    const esmOutput = (await Promise.all(esmFiles.map((file) => readFile(file, 'utf8')))).join('\n');

    assert.doesNotMatch(esmOutput, /import\s+(?:\{[^}]*\bethers\b[^}]*}|\*\s+as\s+\w+)\s+from\s+['"]ethers['"]/);
});

test('preserves artifact exports and shared identity', () => {
    assert.deepEqual(Object.keys(esmArtifacts).sort(), Object.keys(cjsArtifacts).sort());
    assert.equal(esmSdk.getArtifacts(esmSdk.Network.DEV), esmArtifacts.dev);
    assert.equal(cjsSdk.getArtifacts(cjsSdk.Network.DEV), cjsArtifacts.dev);
    assert.deepEqual(Object.keys(esmTonTypes), Object.keys(cjsTonTypes));
    assert.deepEqual(Object.keys(esmTacTypes), Object.keys(cjsTacTypes));
});

test('keeps internal build paths private', async () => {
    assert.throws(() => require('@tonappchain/sdk/dist/src/index.js'), {
        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
    await assert.rejects(import('@tonappchain/sdk/dist/esm/src/index.mjs'), {
        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
});
