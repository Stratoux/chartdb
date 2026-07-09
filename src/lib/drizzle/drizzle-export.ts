import type { Diagram } from '../domain/diagram';
import type { DBTable } from '../domain/db-table';
import type { DBField } from '../domain/db-field';
import { DatabaseType } from '../domain/database-type';

// Generates a Drizzle ORM `schema.ts` file from a diagram, in the style of a
// `drizzle-kit pull` output: one exported `<camelCaseName> = <dialect>Table(...)`
// per table, inline `.references(() => other.col)` foreign keys, and a second
// callback arg holding index()/primaryKey()/unique() definitions.

type Dialect = 'pg' | 'mysql' | 'sqlite';

interface DialectConfig {
    module: string; // e.g. "drizzle-orm/pg-core"
    tableFn: string; // e.g. "pgTable"
}

const DIALECTS: Record<Dialect, DialectConfig> = {
    pg: { module: 'drizzle-orm/pg-core', tableFn: 'pgTable' },
    mysql: { module: 'drizzle-orm/mysql-core', tableFn: 'mysqlTable' },
    sqlite: { module: 'drizzle-orm/sqlite-core', tableFn: 'sqliteTable' },
};

const dialectForDatabase = (databaseType: DatabaseType): Dialect => {
    switch (databaseType) {
        case DatabaseType.MYSQL:
        case DatabaseType.MARIADB:
            return 'mysql';
        case DatabaseType.SQLITE:
            return 'sqlite';
        case DatabaseType.POSTGRESQL:
        case DatabaseType.COCKROACHDB:
        default:
            return 'pg';
    }
};

// A single generated column: the Drizzle builder call plus which import it needs.
interface ColumnBuild {
    // The builder expression WITHOUT the leading name arg's modifiers,
    // e.g. `bigint("id", { mode: "number" })`.
    expr: string;
    // Import identifier used (e.g. "bigint"), collected for the import line.
    imports: string[];
}

const camelCase = (name: string): string => {
    // Split on non-alphanumeric and camelCase boundaries, then re-join.
    const parts = name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean);
    if (parts.length === 0) return '_';
    const joined = parts
        .map((p, i) =>
            i === 0
                ? p.charAt(0).toLowerCase() + p.slice(1)
                : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
        )
        .join('');
    // Ensure a valid identifier start.
    return /^[a-zA-Z_$]/.test(joined) ? joined : `_${joined}`;
};

const quote = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;

// The TS property key for a column MUST equal its DB column-name string
// verbatim (e.g. "courseID" -> courseID, not courseId). If the raw name is not
// a valid bare identifier (spaces, punctuation, leading digit), quote it so the
// generated object literal still parses; the key text still matches the name.
const isValidIdentifier = (name: string): boolean =>
    /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);

const columnKey = (name: string): string =>
    isValidIdentifier(name) ? name : quote(name);

// A reference to a column property on the `table` object, e.g. table.courseID
// or table["weird name"]. Must use the same verbatim key as the definition.
const columnAccess = (name: string): string =>
    isValidIdentifier(name) ? `table.${name}` : `table[${quote(name)}]`;

// Map a ChartDB field to a Drizzle column builder for the given dialect.
const buildColumn = (field: DBField, dialect: Dialect): ColumnBuild => {
    const typeId = field.type.id.toLowerCase();
    const name = quote(field.name);
    const len = field.characterMaximumLength;
    const precision = field.precision;
    const scale = field.scale;

    const varchar = (): ColumnBuild => ({
        expr: `varchar(${name}, { length: ${len ?? 255} })`,
        imports: ['varchar'],
    });
    const textCol = (): ColumnBuild => ({
        expr: `text(${name})`,
        imports: ['text'],
    });
    const simple = (fn: string): ColumnBuild => ({
        expr: `${fn}(${name})`,
        imports: [fn],
    });

    if (dialect === 'mysql') {
        switch (typeId) {
            case 'bigint':
                return {
                    expr: `bigint(${name}, { mode: "number" })`,
                    imports: ['bigint'],
                };
            case 'int':
            case 'integer':
            case 'mediumint':
                return simple('int');
            case 'smallint':
                return simple('smallint');
            case 'tinyint':
                return simple('tinyint');
            case 'boolean':
            case 'bool':
                return simple('boolean');
            case 'float':
                return simple('float');
            case 'double':
                return simple('double');
            case 'decimal':
            case 'numeric':
                return {
                    expr: `decimal(${name}${
                        precision != null
                            ? `, { precision: ${precision}${
                                  scale != null ? `, scale: ${scale}` : ''
                              } }`
                            : ''
                    })`,
                    imports: ['decimal'],
                };
            case 'varchar':
            case 'char':
                return typeId === 'char'
                    ? {
                          expr: `char(${name}, { length: ${len ?? 255} })`,
                          imports: ['char'],
                      }
                    : varchar();
            case 'text':
            case 'tinytext':
            case 'mediumtext':
            case 'longtext':
                return simple(typeId === 'text' ? 'text' : typeId);
            case 'json':
                return simple('json');
            case 'timestamp':
                return {
                    expr: `timestamp(${name}, { mode: 'string' })`,
                    imports: ['timestamp'],
                };
            case 'datetime':
                return {
                    expr: `datetime(${name}, { mode: 'string' })`,
                    imports: ['datetime'],
                };
            case 'date':
                return {
                    expr: `date(${name}, { mode: 'string' })`,
                    imports: ['date'],
                };
            case 'time':
                return simple('time');
            case 'year':
                return simple('year');
            default:
                return varchar();
        }
    }

    if (dialect === 'sqlite') {
        switch (typeId) {
            case 'integer':
            case 'int':
            case 'bigint':
            case 'smallint':
                return {
                    expr: `integer(${name})`,
                    imports: ['integer'],
                };
            case 'boolean':
            case 'bool':
                return {
                    expr: `integer(${name}, { mode: "boolean" })`,
                    imports: ['integer'],
                };
            case 'real':
            case 'float':
            case 'double':
                return simple('real');
            case 'numeric':
            case 'decimal':
                return simple('numeric');
            case 'blob':
            case 'binary':
            case 'varbinary':
                return simple('blob');
            case 'json':
                return {
                    expr: `text(${name}, { mode: "json" })`,
                    imports: ['text'],
                };
            case 'timestamp':
            case 'datetime':
            case 'date':
                return {
                    expr: `integer(${name}, { mode: "timestamp" })`,
                    imports: ['integer'],
                };
            case 'text':
            case 'varchar':
            case 'char':
            default:
                return textCol();
        }
    }

    // pg
    switch (typeId) {
        case 'serial':
            return simple('serial');
        case 'bigserial':
            return simple('bigserial');
        case 'smallserial':
            return simple('smallserial');
        case 'integer':
        case 'int':
        case 'int4':
            return simple('integer');
        case 'bigint':
        case 'int8':
            return {
                expr: `bigint(${name}, { mode: "number" })`,
                imports: ['bigint'],
            };
        case 'smallint':
        case 'int2':
            return simple('smallint');
        case 'boolean':
        case 'bool':
            return simple('boolean');
        case 'real':
        case 'float4':
            return simple('real');
        case 'double_precision':
        case 'float8':
            return {
                expr: `doublePrecision(${name})`,
                imports: ['doublePrecision'],
            };
        case 'numeric':
        case 'decimal':
            return {
                expr: `numeric(${name}${
                    precision != null
                        ? `, { precision: ${precision}${
                              scale != null ? `, scale: ${scale}` : ''
                          } }`
                        : ''
                })`,
                imports: ['numeric'],
            };
        case 'varchar':
        case 'character_varying':
            return varchar();
        case 'char':
        case 'character':
            return {
                expr: `char(${name}, { length: ${len ?? 1} })`,
                imports: ['char'],
            };
        case 'text':
            return textCol();
        case 'uuid':
            return simple('uuid');
        case 'json':
            return simple('json');
        case 'jsonb':
            return simple('jsonb');
        case 'timestamp':
        case 'timestamp_without_time_zone':
            return {
                expr: `timestamp(${name}, { mode: 'string' })`,
                imports: ['timestamp'],
            };
        case 'timestamptz':
        case 'timestamp_with_time_zone':
            return {
                expr: `timestamp(${name}, { withTimezone: true, mode: 'string' })`,
                imports: ['timestamp'],
            };
        case 'date':
            return {
                expr: `date(${name}, { mode: 'string' })`,
                imports: ['date'],
            };
        case 'time':
        case 'time_without_time_zone':
            return simple('time');
        case 'bytea':
            return simple('bytea');
        default:
            return varchar();
    }
};

interface FieldRef {
    // camelCase export name of the referenced table + referenced column name.
    tableExport: string;
    columnName: string;
}

// Build a map from a "many"-side field id to the table/column it references.
const buildReferenceMap = (
    diagram: Diagram,
    tableExportById: Map<string, string>,
    fieldById: Map<string, { field: DBField; tableId: string }>
): Map<string, FieldRef> => {
    const refs = new Map<string, FieldRef>();
    for (const rel of diagram.relationships ?? []) {
        // The FK column lives on the "many" side and references the "one"
        // (primary key) side. For one-to-one, the target carries the FK.
        let fkFieldId: string;
        let referencedFieldId: string;
        if (
            rel.sourceCardinality === 'one' &&
            rel.targetCardinality === 'many'
        ) {
            fkFieldId = rel.targetFieldId;
            referencedFieldId = rel.sourceFieldId;
        } else if (
            rel.sourceCardinality === 'many' &&
            rel.targetCardinality === 'one'
        ) {
            fkFieldId = rel.sourceFieldId;
            referencedFieldId = rel.targetFieldId;
        } else {
            // one-to-one (or many-to-many, rare): treat target as FK holder.
            fkFieldId = rel.targetFieldId;
            referencedFieldId = rel.sourceFieldId;
        }

        const referenced = fieldById.get(referencedFieldId);
        if (!referenced) continue;
        const tableExport = tableExportById.get(referenced.tableId);
        if (!tableExport) continue;

        refs.set(fkFieldId, {
            tableExport,
            columnName: referenced.field.name,
        });
    }
    return refs;
};

// Generates the `(table) => [ ... ]` callback content: indexes, PK, uniques.
const buildTableExtras = (
    table: DBTable,
    fieldById: Map<string, DBField>
): { lines: string[]; imports: string[] } => {
    const lines: string[] = [];
    const imports: string[] = [];

    const colRef = (fieldId: string): string | null => {
        const f = fieldById.get(fieldId);
        return f ? columnAccess(f.name) : null;
    };

    // Primary key columns (from fields flagged primaryKey, or a PK index).
    const pkFields = table.fields.filter((f) => f.primaryKey);
    const pkFromIndex = table.indexes.find((i) => i.isPrimaryKey);

    // Non-PK indexes.
    for (const index of table.indexes) {
        if (index.isPrimaryKey) continue;
        const cols = index.fieldIds
            .map(colRef)
            .filter((c): c is string => c !== null);
        if (cols.length === 0) continue;
        if (index.unique) {
            lines.push(`\tunique(${quote(index.name)}).on(${cols.join(', ')})`);
            imports.push('unique');
        } else {
            lines.push(`\tindex(${quote(index.name)}).on(${cols.join(', ')})`);
            imports.push('index');
        }
    }

    // Primary key definition (composite-aware), mirroring drizzle-kit pull.
    let pkCols: string[] = [];
    if (pkFromIndex) {
        pkCols = pkFromIndex.fieldIds
            .map(colRef)
            .filter((c): c is string => c !== null);
    } else if (pkFields.length > 0) {
        pkCols = pkFields.map((f) => columnAccess(f.name)).filter(Boolean);
    }
    if (pkCols.length > 0) {
        const pkName = `${table.name}_${(pkFromIndex
            ? pkFromIndex.fieldIds.map((id) => fieldById.get(id)?.name ?? id)
            : pkFields.map((f) => f.name)
        ).join('_')}`;
        lines.push(
            `\tprimaryKey({ columns: [${pkCols.join(', ')}], name: ${quote(
                pkName
            )}})`
        );
        imports.push('primaryKey');
    }

    return { lines, imports };
};

export interface DrizzleExportResult {
    code: string;
    dialect: Dialect;
}

export const generateDrizzleSchema = (
    diagram: Diagram,
    options: { headerComment?: string } = {}
): DrizzleExportResult => {
    const dialect = dialectForDatabase(diagram.databaseType);
    const cfg = DIALECTS[dialect];
    const tables = (diagram.tables ?? []).filter((t) => !t.isView);

    // Lookups.
    const tableExportById = new Map<string, string>();
    const usedExportNames = new Set<string>();
    for (const table of tables) {
        const base = camelCase(table.name);
        let candidate = base;
        let n = 2;
        while (usedExportNames.has(candidate)) candidate = `${base}${n++}`;
        usedExportNames.add(candidate);
        tableExportById.set(table.id, candidate);
    }

    const fieldById = new Map<string, DBField>();
    const fieldWithTableById = new Map<
        string,
        { field: DBField; tableId: string }
    >();
    for (const table of tables) {
        for (const field of table.fields) {
            fieldById.set(field.id, field);
            fieldWithTableById.set(field.id, { field, tableId: table.id });
        }
    }

    const refMap = buildReferenceMap(
        diagram,
        tableExportById,
        fieldWithTableById
    );

    const usedImports = new Set<string>();
    let usesSql = false;
    const tableBlocks: string[] = [];

    // The table constructor itself (mysqlTable/pgTable/sqliteTable) must be
    // imported whenever we emit at least one table.
    if (tables.length > 0) {
        usedImports.add(cfg.tableFn);
    }

    for (const table of tables) {
        const exportName = tableExportById.get(table.id)!;
        const columnLines: string[] = [];

        for (const field of table.fields) {
            const built = buildColumn(field, dialect);
            built.imports.forEach((i) => usedImports.add(i));

            let expr = built.expr;

            // Auto-increment (mysql/pg use different builders; sqlite handled
            // via autoIncrement on integer pk).
            if (field.increment) {
                if (dialect === 'mysql') {
                    expr += '.autoincrement()';
                } else if (dialect === 'sqlite') {
                    expr += '.primaryKey({ autoIncrement: true })';
                }
                // pg: serial types already imply increment.
            }

            if (!field.nullable) {
                expr += '.notNull()';
            }

            // Unique (single-column) — table-level uniques handled via indexes.
            if (field.unique && !field.primaryKey) {
                expr += '.unique()';
            }

            // Default value.
            if (field.default != null && field.default !== '') {
                const def = field.default.trim();
                // Heuristic: wrap non-numeric, non-boolean literals via sql``.
                if (/^-?\d+(\.\d+)?$/.test(def)) {
                    expr += `.default(${def})`;
                } else if (/^(true|false)$/i.test(def)) {
                    expr += `.default(${def.toLowerCase()})`;
                } else {
                    usesSql = true;
                    expr += `.default(sql\`${def}\`)`;
                }
            }

            // Foreign key reference. The referenced column must use the raw
            // column name too (verbatim), keyed off the referenced table export.
            const ref = refMap.get(field.id);
            if (ref) {
                const refCol = isValidIdentifier(ref.columnName)
                    ? `${ref.tableExport}.${ref.columnName}`
                    : `${ref.tableExport}[${quote(ref.columnName)}]`;
                expr += `.references(() => ${refCol})`;
            }

            // Property key is the DB column name verbatim (not camelCased).
            columnLines.push(`\t${columnKey(field.name)}: ${expr},`);
        }

        const extras = buildTableExtras(table, fieldById);
        extras.imports.forEach((i) => usedImports.add(i));

        let block = `export const ${exportName} = ${cfg.tableFn}(${quote(
            table.name
        )}, {\n${columnLines.join('\n')}\n}`;

        if (extras.lines.length > 0) {
            block += `,\n(table) => [\n${extras.lines.join(',\n')},\n]`;
        }
        block += ');';
        tableBlocks.push(block);
    }

    // Build import lines.
    const sortedImports = Array.from(usedImports).sort();
    const importLines: string[] = [];
    if (sortedImports.length > 0) {
        importLines.push(
            `import { ${sortedImports.join(', ')} } from "${cfg.module}"`
        );
    }
    if (usesSql) {
        importLines.push(`import { sql } from "drizzle-orm"`);
    }

    const header = options.headerComment ? `${options.headerComment}\n\n` : '';
    const code =
        header +
        (importLines.length ? importLines.join('\n') + '\n\n' : '') +
        tableBlocks.join('\n\n') +
        '\n';

    return { code, dialect };
};
