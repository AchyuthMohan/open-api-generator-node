#!/usr/bin/env node
/**
 * tests/wrapper.test.ts
 *
 * Unit + integration tests for src/generate-glint-dtos.js
 *
 * Tests:
 *   - filenameFromTitle() pure helper (exported from the script)
 *   - end-to-end: running the script produces the expected .dto.ts file
 *
 * Run: tsx tests/wrapper.test.ts   (or npx tsx tests/wrapper.test.ts)
 *
 * Expected project layout:
 *   generator.ts          ← project root
 *   src/
 *     generate-glint-dtos.js
 *   openapi/
 *     openapi.yaml
 *   tests/
 *     wrapper.test.ts     ← this file
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Load the module under test
const scriptPath = path.resolve(process.cwd(), 'src', 'generate-glint-dtos.js');
if (!fs.existsSync(scriptPath)) {
  console.error(`generate-glint-dtos.js not found at ${scriptPath}`);
  process.exit(1);
}
const { filenameFromTitle } = require(scriptPath);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── filenameFromTitle ─────────────────────────────────────────────────────

console.log('\nfilenameFromTitle()');

test('generates .dto.ts extension', () => {
  assert.ok(filenameFromTitle('Weather Data API').endsWith('.dto.ts'));
});

test('lowercases the entire title', () => {
  const result = filenameFromTitle('Weather Data API');
  assert.equal(result, result.toLowerCase());
});

test('replaces spaces with underscores', () => {
  const result = filenameFromTitle('Weather Data API');
  assert.ok(!result.includes(' '), `Expected no spaces in: ${result}`);
  assert.ok(result.startsWith('weather_'), `Expected underscores in: ${result}`);
});

test('replaces hyphens with underscores', () => {
  assert.equal(filenameFromTitle('my-api-service'), 'my_api_service.dto.ts');
});

test('collapses consecutive special characters into one underscore', () => {
  const result = filenameFromTitle('My  API -- Service');
  assert.ok(!result.includes('__'), `Expected no double underscores in: ${result}`);
});

test('strips leading underscores', () => {
  const result = filenameFromTitle(' Leading title');
  assert.ok(!result.startsWith('_'), `Expected no leading underscore in: ${result}`);
});

test('strips trailing underscores before extension', () => {
  const result = filenameFromTitle('trailing title ');
  assert.ok(!result.includes('_.dto.ts'), `Expected no trailing underscore before .dto.ts in: ${result}`);
});

test('handles a single-word title', () => {
  assert.equal(filenameFromTitle('Weather'), 'weather.dto.ts');
});

test('handles titles containing numbers', () => {
  assert.equal(filenameFromTitle('API v2 Service'), 'api_v2_service.dto.ts');
});

test('handles titles with parentheses and exclamation marks', () => {
  const result = filenameFromTitle('Weather (Beta) API!');
  assert.ok(result.endsWith('.dto.ts'), `Expected .dto.ts, got: ${result}`);
  assert.ok(!/[!()\s]/.test(result), `Expected no special chars in: ${result}`);
});

test('Weather Data API → weather_data_api.dto.ts', () => {
  // This is the exact title from openapi.yaml used in this project
  assert.equal(filenameFromTitle('Weather Data API'), 'weather_data_api.dto.ts');
});

// ─── Integration: end-to-end run ───────────────────────────────────────────

console.log('\nIntegration (end-to-end)');

const cwd = process.cwd();
const generatorExists = fs.existsSync(path.join(cwd, 'generator.ts'));
const openapiExists =
  fs.existsSync(path.join(cwd, 'openapi', 'openapi.yaml')) ||
  fs.existsSync(path.join(cwd, 'openapi.yaml'));

if (!generatorExists || !openapiExists) {
  console.log('  ⚠  Skipped – generator.ts or openapi.yaml not found in cwd');
} else {
  const expectedFile = path.join(cwd, 'weather_data_api.dto.ts');

  function cleanup() {
    if (fs.existsSync(expectedFile)) fs.unlinkSync(expectedFile);
  }

  test('script exits with code 0 and writes the .dto.ts file', () => {
    cleanup();
    execSync(`node "${scriptPath}"`, { encoding: 'utf8', cwd });
    assert.ok(fs.existsSync(expectedFile), `Expected output file at: ${expectedFile}`);
    cleanup();
  });

  test('generated file contains export class declarations', () => {
    cleanup();
    execSync(`node "${scriptPath}"`, { encoding: 'utf8', cwd });
    const content = fs.readFileSync(expectedFile, 'utf8');
    assert.ok(
      content.includes('export class'),
      `Expected 'export class' in generated file:\n${content.slice(0, 300)}`,
    );
    cleanup();
  });

  test('generated file imports class-validator (nest style)', () => {
    cleanup();
    execSync(`node "${scriptPath}"`, { encoding: 'utf8', cwd });
    const content = fs.readFileSync(expectedFile, 'utf8');
    assert.ok(
      content.includes("from 'class-validator'"),
      `Expected class-validator import:\n${content.slice(0, 400)}`,
    );
    cleanup();
  });

  test('generated file contains all expected schema classes', () => {
    cleanup();
    execSync(`node "${scriptPath}"`, { encoding: 'utf8', cwd });
    const content = fs.readFileSync(expectedFile, 'utf8');
    for (const name of ['Location', 'WeatherAlert', 'ErrorResponse', 'DailyForecast', 'CurrentWeatherResponse']) {
      assert.ok(content.includes(name), `Expected schema class "${name}" in output`);
    }
    cleanup();
  });
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);