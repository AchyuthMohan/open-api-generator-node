#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const yaml = require('js-yaml');

const cwd = process.cwd();
const candidates = [path.join(cwd, 'openapi', 'openapi.yaml'), path.join(cwd, 'openapi.yaml')];
let openapiPath = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    openapiPath = p;
    break;
  }
}

if (!openapiPath) {
  console.error('OpenAPI file not found: looked for openapi/openapi.yaml and openapi.yaml');
  process.exit(1);
}

let doc;
try {
  doc = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
} catch (err) {
  console.error('Failed to parse OpenAPI YAML:', err.message || err);
  process.exit(1);
}

const title = (doc && doc.info && doc.info.title) ? String(doc.info.title) : 'openapi';

function filenameFromTitle(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    + '.dto.ts';
}

const outFile = filenameFromTitle(title);

const generatorPath = path.join(cwd, 'generator.ts');
if (!fs.existsSync(generatorPath)) {
  console.error('generator.ts not found in project root');
  process.exit(1);
}

const cmd = `tsx "${generatorPath}" "${openapiPath}" --style=nest`;

try {
  const stdout = child_process.execSync(cmd, { encoding: 'utf8' });
  fs.writeFileSync(path.join(cwd, outFile), stdout, 'utf8');
  console.log(`Generated DTOs -> ${outFile}`);
} catch (err) {
  console.error('Failed to run generator:', err.message || err);
  process.exit(1);
}
