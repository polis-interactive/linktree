import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('target/dx/polis-linktree/release/web/public');
if (!existsSync(`${source}/index.html`)) throw new Error(`Dioxus output missing: ${source}/index.html`);
const destination = resolve('dist');
mkdirSync(destination, { recursive: true });
// Only remove generated build output; source files are outside this directory.
for (const entry of readdirSync(destination)) rmSync(`${destination}/${entry}`, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log('Static site ready in dist/');
