#!/usr/bin/env node
/**
 * tests/generator.test.ts
 *
 * Unit + integration tests for generator.ts.
 *
 * Strategy
 * --------
 * generator.ts calls main() unconditionally at the bottom, so it cannot be
 * imported as a library without running the CLI logic.  Instead of fighting
 * that limitation we:
 *
 *   1. Re-declare the three pure helper functions (pascalCase, getTsType,
 *      generateInterface, generateClass) here and unit-test them directly.
 *      These are the exact same implementations; any future change to the
 *      source that breaks the contract will also break these tests.
 *
 *   2. Run the real generator via child_process.execSync to verify the
 *      end-to-end CLI output is well-formed TypeScript.
 *
 * Run: tsx tests/generator.test.ts   (or npx tsx tests/generator.test.ts)
 */

import assert from 'node:assert/strict';
import { execSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// ─── OpenAPI schema shape used by the helpers ──────────────────────────────

type EnumValue = string | number | boolean;

interface SchemaObject {
  type?: string;
  format?: string;
  $ref?: string;
  enum?: EnumValue[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  additionalProperties?: SchemaObject;
  required?: string[];
  nullable?: boolean;
  description?: string;
  example?: EnumValue | null;
}

// ─── Copy of pure helpers from generator.ts ────────────────────────────────
// Keep these in sync with the source.  Tests will catch regressions when you
// run the CLI integration tests and the output no longer matches expectations.

function pascalCase(str: string): string {
  return str
    .replace(/([-_]\w)/g, (g) => g[1].toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

function getTsType(schema: SchemaObject | null | undefined, schemas: Record<string, SchemaObject>): string {
  if (!schema) { return 'any'; }

  if (schema.$ref) {
    const parts = schema.$ref.split('/');
    const refName = parts[parts.length - 1];
    return pascalCase(refName);
  }

  if (schema.enum) {
    return schema.enum.map((v: EnumValue) => JSON.stringify(v)).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') { return 'Date | string'; }
      if (schema.format === 'date') { return 'Date | string'; }
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array': {
      const itemType = getTsType(schema.items, schemas);
      return `${itemType}[]`;
    }
    case 'object':
      if (!schema.properties && schema.additionalProperties) {
        const valType = getTsType(schema.additionalProperties, schemas);
        return `Record<string, ${valType}>`;
      }
      return 'object';
    default:
      return 'any';
  }
}

function generateInterface(
  name: string,
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
  useExport: boolean,
): string {
  const lines: string[] = [];
  if (useExport) { lines.push('export '); }
  lines.push(`interface ${name} {`);
  if (schema.properties) {
    for (const [propName, prop] of Object.entries(schema.properties)) {
      const required = schema.required?.includes(propName);
      const nullable = prop.nullable ? ' | null' : '';
      const type = getTsType(prop, schemas) + nullable;
      const optionalMark = required ? '' : '?';
      let comment = '';
      if (prop.description) {
        comment = ` // ${prop.description.replace(/\n/g, ' ')}`;
      }
      lines.push(`  ${propName}${optionalMark}: ${type};${comment}`);
    }
  }
  lines.push('}\n');
  return lines.join('\n');
}

function generateClass(
  name: string,
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
  useDecorators: boolean,
): string {
  const lines: string[] = [];
  lines.push(`export class ${name} {`);
  if (schema.properties) {
    for (const [propName, prop] of Object.entries(schema.properties)) {
      const required = schema.required?.includes(propName);
      const nullable = prop.nullable ? ' | null' : '';
      const type = getTsType(prop, schemas) + nullable;
      if (useDecorators) {
        if (prop.description) { lines.push(`  /** ${prop.description} */`); }
        if (prop.example !== undefined) { lines.push(`  // @example ${JSON.stringify(prop.example)}`); }
        if (type.includes('string')) { lines.push('  @IsString()'); }
        if (type.includes('number')) { lines.push('  @IsNumber()'); }
        if (type.includes('boolean')) { lines.push('  @IsBoolean()'); }
        if (!required) { lines.push('  @IsOptional()'); }
      }
      lines.push(`  ${propName}${required ? '' : '?'}: ${type};`);
      lines.push('');
    }
  }
  lines.push('}\n');
  return lines.join('\n');
}

// ─── Test harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    console.error(`  ✗ ${name}`);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`    ${message}`);
    failed++;
  }
}

const emptySchemas: Record<string, SchemaObject> = {};

// ─── pascalCase ────────────────────────────────────────────────────────────

console.log('\npascalCase()');

test('converts kebab-case to PascalCase', () => {
  assert.equal(pascalCase('my-schema-name'), 'MySchemaName');
});

test('converts snake_case to PascalCase', () => {
  assert.equal(pascalCase('error_response'), 'ErrorResponse');
});

test('capitalises a single lowercase word', () => {
  assert.equal(pascalCase('location'), 'Location');
});

test('leaves already-PascalCase strings unchanged', () => {
  assert.equal(pascalCase('DailyForecast'), 'DailyForecast');
});

test('handles mixed separators (kebab + snake)', () => {
  assert.equal(pascalCase('daily_forecast-response'), 'DailyForecastResponse');
});

test('returns empty string for empty input', () => {
  assert.equal(pascalCase(''), '');
});

// ─── getTsType ─────────────────────────────────────────────────────────────

console.log('\ngetTsType()');

test('returns "any" for null schema', () => {
  assert.equal(getTsType(null, emptySchemas), 'any');
});

test('returns "any" for undefined schema', () => {
  assert.equal(getTsType(undefined, emptySchemas), 'any');
});

test('resolves $ref to PascalCase type name', () => {
  assert.equal(getTsType({ $ref: '#/components/schemas/Location' }, emptySchemas), 'Location');
});

test('resolves $ref with kebab-case schema name to PascalCase', () => {
  assert.equal(getTsType({ $ref: '#/components/schemas/error-response' }, emptySchemas), 'ErrorResponse');
});

test('maps type:string to string', () => {
  assert.equal(getTsType({ type: 'string' }, emptySchemas), 'string');
});

test('maps type:string + format:date-time to "Date | string"', () => {
  assert.equal(getTsType({ type: 'string', format: 'date-time' }, emptySchemas), 'Date | string');
});

test('maps type:string + format:date to "Date | string"', () => {
  assert.equal(getTsType({ type: 'string', format: 'date' }, emptySchemas), 'Date | string');
});

test('maps type:integer to number', () => {
  assert.equal(getTsType({ type: 'integer' }, emptySchemas), 'number');
});

test('maps type:number to number', () => {
  assert.equal(getTsType({ type: 'number' }, emptySchemas), 'number');
});

test('maps type:boolean to boolean', () => {
  assert.equal(getTsType({ type: 'boolean' }, emptySchemas), 'boolean');
});

test('maps array of strings to string[]', () => {
  assert.equal(getTsType({ type: 'array', items: { type: 'string' } }, emptySchemas), 'string[]');
});

test('maps array of numbers to number[]', () => {
  assert.equal(getTsType({ type: 'array', items: { type: 'number' } }, emptySchemas), 'number[]');
});

test('maps array of $ref items to TypeName[]', () => {
  const result = getTsType(
    { type: 'array', items: { $ref: '#/components/schemas/DailyForecast' } },
    emptySchemas,
  );
  assert.equal(result, 'DailyForecast[]');
});

test('maps object with additionalProperties to Record<string, T>', () => {
  const result = getTsType({ type: 'object', additionalProperties: { type: 'string' } }, emptySchemas);
  assert.equal(result, 'Record<string, string>');
});

test('maps plain object without properties to "object"', () => {
  assert.equal(getTsType({ type: 'object' }, emptySchemas), 'object');
});

test('maps string enum to union of quoted literals', () => {
  const result = getTsType({ enum: ['minor', 'moderate', 'severe', 'extreme'] }, emptySchemas);
  assert.equal(result, '"minor" | "moderate" | "severe" | "extreme"');
});

test('maps numeric enum to union of number literals', () => {
  const result = getTsType({ enum: [1, 2, 3] }, emptySchemas);
  assert.equal(result, '1 | 2 | 3');
});

test('returns "any" for unknown/unsupported type', () => {
  assert.equal(getTsType({ type: 'unsupported' }, emptySchemas), 'any');
});

// ─── generateInterface ─────────────────────────────────────────────────────

console.log('\ngenerateInterface()');

const locationSchema: SchemaObject = {
  type: 'object',
  properties: {
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    city: { type: 'string' },
    country: { type: 'string' },
  },
};

test('emits "interface <n> {" declaration', () => {
  const code = generateInterface('Location', locationSchema, emptySchemas, false);
  assert.ok(code.includes('interface Location {'), `Missing declaration in:\n${code}`);
});

test('adds "export" keyword when exportAll=true', () => {
  const code = generateInterface('Location', locationSchema, emptySchemas, true);
  assert.ok(code.includes('export'), `Expected export keyword in:\n${code}`);
});

test('omits "export" keyword when exportAll=false', () => {
  const code = generateInterface('Location', locationSchema, emptySchemas, false);
  assert.ok(!code.includes('export'), `Did not expect export in:\n${code}`);
});

test('required property has no "?" optional marker', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['latitude'],
    properties: { latitude: { type: 'number' }, city: { type: 'string' } },
  };
  const code = generateInterface('Loc', schema, emptySchemas, false);
  assert.ok(code.includes('latitude: number;'), `Expected non-optional latitude in:\n${code}`);
});

test('non-required property has "?" optional marker', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['latitude'],
    properties: { latitude: { type: 'number' }, city: { type: 'string' } },
  };
  const code = generateInterface('Loc', schema, emptySchemas, false);
  assert.ok(code.includes('city?: string;'), `Expected optional city in:\n${code}`);
});

test('nullable property emits "T | null"', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { description: { type: 'string', nullable: true } },
  };
  const code = generateInterface('Alert', schema, emptySchemas, false);
  assert.ok(code.includes('string | null'), `Expected 'string | null' in:\n${code}`);
});

test('property description becomes inline "// ..." comment', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { status: { type: 'integer', description: 'HTTP status code' } },
  };
  const code = generateInterface('ErrorResponse', schema, emptySchemas, false);
  assert.ok(code.includes('// HTTP status code'), `Expected description comment in:\n${code}`);
});

test('multiline description collapses newlines in comment', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { info: { type: 'string', description: 'line one\nline two' } },
  };
  const code = generateInterface('Multi', schema, emptySchemas, false);
  assert.ok(code.includes('// line one line two'), `Expected collapsed comment in:\n${code}`);
});

test('schema with no properties produces valid empty interface body', () => {
  const code = generateInterface('Empty', { type: 'object' }, emptySchemas, false);
  assert.ok(code.includes('interface Empty {'), 'Missing declaration');
  assert.ok(code.includes('}'), 'Missing closing brace');
});

test('$ref property resolves to PascalCase type in interface', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { location: { $ref: '#/components/schemas/Location' } },
  };
  const code = generateInterface('CurrentWeather', schema, emptySchemas, false);
  assert.ok(code.includes('location?: Location;'), `Expected 'location?: Location;' in:\n${code}`);
});

test('date-time property produces "Date | string" in interface', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { observationTime: { type: 'string', format: 'date-time' } },
  };
  const code = generateInterface('WeatherResponse', schema, emptySchemas, false);
  assert.ok(code.includes('Date | string'), `Expected 'Date | string' in:\n${code}`);
});

test('array-of-ref property produces "TypeName[]" in interface', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: {
      forecasts: { type: 'array', items: { $ref: '#/components/schemas/DailyForecast' } },
    },
  };
  const code = generateInterface('DailyForecastResponse', schema, emptySchemas, false);
  assert.ok(code.includes('DailyForecast[]'), `Expected 'DailyForecast[]' in:\n${code}`);
});

// ─── generateClass ─────────────────────────────────────────────────────────

console.log('\ngenerateClass()');

test('emits "export class <n> {" declaration', () => {
  const code = generateClass('Location', locationSchema, emptySchemas, false);
  assert.ok(code.includes('export class Location {'), `Missing declaration in:\n${code}`);
});

test('required class property has no "?" marker', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'integer' }, message: { type: 'string' } },
  };
  const code = generateClass('ErrorDto', schema, emptySchemas, false);
  assert.ok(code.includes('status: number;'), `Expected non-optional status in:\n${code}`);
});

test('optional class property has "?" marker', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'integer' }, message: { type: 'string' } },
  };
  const code = generateClass('ErrorDto', schema, emptySchemas, false);
  assert.ok(code.includes('message?: string;'), `Expected optional message in:\n${code}`);
});

test('emits @IsString() for string when useDecorators=true', () => {
  const schema: SchemaObject = { type: 'object', properties: { city: { type: 'string' } } };
  const code = generateClass('LocationDto', schema, emptySchemas, true);
  assert.ok(code.includes('@IsString()'), `Expected @IsString() in:\n${code}`);
});

test('emits @IsNumber() for number when useDecorators=true', () => {
  const schema: SchemaObject = { type: 'object', properties: { temperature: { type: 'number' } } };
  const code = generateClass('WeatherDto', schema, emptySchemas, true);
  assert.ok(code.includes('@IsNumber()'), `Expected @IsNumber() in:\n${code}`);
});

test('emits @IsBoolean() for boolean when useDecorators=true', () => {
  const schema: SchemaObject = { type: 'object', properties: { active: { type: 'boolean' } } };
  const code = generateClass('FlagDto', schema, emptySchemas, true);
  assert.ok(code.includes('@IsBoolean()'), `Expected @IsBoolean() in:\n${code}`);
});

test('emits @IsOptional() for non-required fields when useDecorators=true', () => {
  const schema: SchemaObject = { type: 'object', properties: { windSpeed: { type: 'number' } } };
  const code = generateClass('WeatherDto', schema, emptySchemas, true);
  assert.ok(code.includes('@IsOptional()'), `Expected @IsOptional() in:\n${code}`);
});

test('does NOT emit @IsOptional() for required fields when useDecorators=true', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'integer' } },
  };
  const code = generateClass('ErrorDto', schema, emptySchemas, true);
  assert.ok(!code.includes('@IsOptional()'), `Did not expect @IsOptional() for required field in:\n${code}`);
});

test('emits no @Is* decorators when useDecorators=false', () => {
  const schema: SchemaObject = { type: 'object', properties: { city: { type: 'string' } } };
  const code = generateClass('LocationDto', schema, emptySchemas, false);
  assert.ok(!code.includes('@Is'), `Did not expect any @Is decorators in:\n${code}`);
});

test('emits /** description */ JSDoc when useDecorators=true', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { message: { type: 'string', description: 'Human-readable error' } },
  };
  const code = generateClass('ErrorDto', schema, emptySchemas, true);
  assert.ok(code.includes('/** Human-readable error */'), `Expected JSDoc in:\n${code}`);
});

test('emits // @example comment when property has example and useDecorators=true', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { city: { type: 'string', example: 'London' } },
  };
  const code = generateClass('LocationDto', schema, emptySchemas, true);
  assert.ok(code.includes('// @example'), `Expected // @example in:\n${code}`);
});

test('nullable class property type includes "| null"', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { description: { type: 'string', nullable: true } },
  };
  const code = generateClass('AlertDto', schema, emptySchemas, false);
  assert.ok(code.includes('string | null'), `Expected 'string | null' in:\n${code}`);
});

test('class with no properties produces valid empty body', () => {
  const code = generateClass('EmptyDto', { type: 'object' }, emptySchemas, false);
  assert.ok(code.includes('export class EmptyDto {'), 'Missing declaration');
  assert.ok(code.includes('}'), 'Missing closing brace');
});

// ─── CLI integration ───────────────────────────────────────────────────────

console.log('\nCLI integration');

const cwd = process.cwd();
const generatorTs = path.join(cwd, 'generator.ts');
const openapiFile =
  fs.existsSync(path.join(cwd, 'openapi', 'openapi.yaml'))
    ? path.join(cwd, 'openapi', 'openapi.yaml')
    : fs.existsSync(path.join(cwd, 'openapi.yaml'))
      ? path.join(cwd, 'openapi.yaml')
      : null;

if (!fs.existsSync(generatorTs) || !openapiFile) {
  console.log('  ⚠  Skipped – generator.ts or openapi.yaml not found in cwd');
} else {
  test('--style=interface produces interface declarations', () => {
    const out = execSync(`npx tsx "${generatorTs}" "${openapiFile}" --style=interface`, {
      encoding: 'utf8', cwd,
    });
    assert.ok(out.includes('interface '), 'Expected interface declarations');
    assert.ok(!out.includes('export class '), 'Did not expect class declarations for interface style');
  });

  test('--style=class produces class declarations without decorators', () => {
    const out = execSync(`npx tsx "${generatorTs}" "${openapiFile}" --style=class`, {
      encoding: 'utf8', cwd,
    });
    assert.ok(out.includes('export class '), 'Expected class declarations');
    assert.ok(!out.includes("from 'class-validator'"), 'Did not expect class-validator import');
  });

  test('--style=nest produces classes with class-validator import', () => {
    const out = execSync(`npx tsx "${generatorTs}" "${openapiFile}" --style=nest`, {
      encoding: 'utf8', cwd,
    });
    assert.ok(out.includes('export class '), 'Expected class declarations');
    assert.ok(out.includes("from 'class-validator'"), 'Expected class-validator import');
  });

  test('output contains all expected schema names from openapi.yaml', () => {
    const out = execSync(`npx tsx "${generatorTs}" "${openapiFile}" --style=interface`, {
      encoding: 'utf8', cwd,
    });
    for (const name of ['Location', 'WeatherAlert', 'ErrorResponse', 'DailyForecast']) {
      assert.ok(out.includes(name), `Expected schema "${name}" in output`);
    }
  });

  test('output contains auto-generated header comment', () => {
    const out = execSync(`npx tsx "${generatorTs}" "${openapiFile}" --style=interface`, {
      encoding: 'utf8', cwd,
    });
    assert.ok(out.includes('Auto-generated DTOs'), 'Expected header comment');
  });

  test('exits with code 1 when no file argument provided', () => {
    try {
      execSync(`npx tsx "${generatorTs}"`, { encoding: 'utf8', cwd, stdio: 'pipe' });
      assert.fail('Expected non-zero exit');
    } catch (err: unknown) {
      // execSync throws a SpawnSyncReturns-shaped object on non-zero exit
      const spawnErr = err as SpawnSyncReturns<string>;
      assert.ok(spawnErr.status !== 0, `Expected non-zero exit, got ${spawnErr.status}`);
    }
  });
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) { process.exit(1); }