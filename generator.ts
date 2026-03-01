#!/usr/bin/env node

/**
 * openapi-dto-generator.ts
 * Simple OpenAPI → TypeScript DTO generator (for NestJS / class-validator style or plain interfaces)
 *
 * Usage:
 *   tsx openapi-dto-generator.ts openapi.yaml > src/dto/generated-notes.dto.ts
 *   node --loader ts-node/esm openapi-dto-generator.ts openapi.yaml --style=nest > dtos.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type OpenApi = {
  openapi: string;
  components?: {
    schemas?: Record<string, any>;
  };
};

type CliArgs = {
  file: string;
  style: 'interface' | 'class' | 'nest';
  useDecorators: boolean;
  exportAll: boolean;
};

export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let file = '';
  let style: 'interface' | 'class' | 'nest' = 'interface';
  let useDecorators = false;
  let exportAll = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--style=nest' || arg === '--nest') {
      style = 'nest';
      useDecorators = true;
    } else if (arg === '--style=class') {
      style = 'class';
    } else if (arg === '--style=interface') {
      style = 'interface';
    } else if (arg === '--no-export') {
      exportAll = false;
    } else if (!file && !arg.startsWith('-')) {
      file = arg;
    }
  }

  if (!file) {
    console.error('Usage: tsx openapi-dto-generator.ts <openapi.yaml> [--style=nest|class|interface] [--no-export]');
    process.exit(1);
  }

  return { file, style, useDecorators, exportAll };
}

export function pascalCase(str: string): string {
  return str
    .replace(/([-_]\w)/g, g => g[1].toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}

export function getTsType(schema: any, schemas: Record<string, any>): string {
  if (!schema) return 'any';

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    return pascalCase(refName);
  }

  if (schema.enum) {
    return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return 'Date | string';
      if (schema.format === 'date') return 'Date | string';
      return 'string';

    case 'integer':
    case 'number':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'array':
      const itemType = getTsType(schema.items, schemas);
      return `${itemType}[]`;

    case 'object':
      if (!schema.properties && schema.additionalProperties) {
        const valType = getTsType(schema.additionalProperties, schemas);
        return `Record<string, ${valType}>`;
      }
      return 'object'; // fallback (should be rare)

    default:
      return 'any';
  }
}

export function generateInterface(name: string, schema: any, schemas: Record<string, any>, useExport: boolean): string {
  const lines: string[] = [];

  if (useExport) lines.push(`export `);
  lines.push(`interface ${name} {`);

  if (schema.properties) {
    for (const [propName, prop] of Object.entries<any>(schema.properties)) {
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

export function generateClass(name: string, schema: any, schemas: Record<string, any>, useDecorators: boolean): string {
  const lines: string[] = [];

  lines.push(`export class ${name} {`);

  if (schema.properties) {
    for (const [propName, prop] of Object.entries<any>(schema.properties)) {
      const required = schema.required?.includes(propName);
      const nullable = prop.nullable ? ' | null' : '';
      const type = getTsType(prop, schemas) + nullable;

      if (useDecorators) {
        if (prop.description) {
          lines.push(`  /** ${prop.description} */`);
        }
        if (prop.example) {
          lines.push(`  // @example ${JSON.stringify(prop.example)}`);
        }

        // Very basic decorator support (you can extend this)
        if (type.includes('string')) lines.push('  @IsString()');
        if (type.includes('number')) lines.push('  @IsNumber()');
        if (type.includes('boolean')) lines.push('  @IsBoolean()');
        if (!required) lines.push('  @IsOptional()');
      }

      lines.push(`  ${propName}${required ? '' : '?'}: ${type};`);
      lines.push('');
    }
  }

  lines.push('}\n');

  return lines.join('\n');
}

async function main() {
  const { file, style, useDecorators, exportAll } = parseArgs();

  let content: string;
  try {
    content = await fs.readFile(file, 'utf-8');
  } catch (err) {
    console.error(`Cannot read file: ${file}`);
    process.exit(1);
  }

  let doc: OpenApi;
  try {
    doc = yaml.load(content) as OpenApi;
  } catch (err) {
    console.error('Invalid YAML:', err);
    process.exit(1);
  }

  const schemas = doc.components?.schemas || {};
  if (Object.keys(schemas).length === 0) {
    console.error('No schemas found in components/schemas');
    process.exit(1);
  }

  const output: string[] = [];

  output.push(`// -------------------------------------------------------`);
  output.push(`// Auto-generated DTOs from OpenAPI spec`);
  output.push(`// Source: ${path.basename(file)}`);
  output.push(`// Generated: ${new Date().toISOString()}`);
  output.push(`// -------------------------------------------------------\n`);

  if (style === 'nest') {
    output.push(`import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString } from 'class-validator';\n`);
  }

  for (const [name, schema] of Object.entries(schemas)) {
    const pascalName = pascalCase(name);

    let code: string;

    if (style === 'class' || style === 'nest') {
      code = generateClass(pascalName, schema, schemas, useDecorators && style === 'nest');
    } else {
      code = generateInterface(pascalName, schema, schemas, exportAll);
    }

    output.push(code);
  }

  console.log(output.join('\n'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});