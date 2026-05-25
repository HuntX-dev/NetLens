import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.outputDir) {
  console.error(
    'Usage: node scripts/geoip/split-d1-sql.mjs --input <sql> --output-dir <dir> [--max-statements <count>] [--max-bytes <bytes>]'
  );
  process.exit(1);
}

const statements = splitSqlStatements(readFileSync(args.input, 'utf8'));
const chunks = buildChunks(statements, {
  maxStatements: Number(args.maxStatements || 500),
  maxBytes: Number(args.maxBytes || 5_000_000)
});

await rm(args.outputDir, { recursive: true, force: true });
await mkdir(args.outputDir, { recursive: true });

for (let index = 0; index < chunks.length; index += 1) {
  const filename = `chunk-${String(index + 1).padStart(4, '0')}.sql`;
  await writeFile(join(args.outputDir, filename), chunks[index], 'utf8');
}

console.log(
  `Split ${basename(args.input)} into ${chunks.length} D1 chunks: statements=${statements.length} max_statements=${args.maxStatements || 500} max_bytes=${args.maxBytes || 5_000_000}`
);

function parseArgs(argv) {
  const parsed = {
    input: '',
    outputDir: '',
    maxStatements: '',
    maxBytes: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      parsed.input = argv[++index] ?? '';
    } else if (arg === '--output-dir') {
      parsed.outputDir = argv[++index] ?? '';
    } else if (arg === '--max-statements') {
      parsed.maxStatements = argv[++index] ?? '';
    } else if (arg === '--max-bytes') {
      parsed.maxBytes = argv[++index] ?? '';
    }
  }
  return parsed;
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    current += char;

    if (char === "'") {
      if (quoted && sql[index + 1] === "'") {
        current += sql[++index];
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      pushCurrent();
    }
  }

  pushCurrent();
  return statements;

  function pushCurrent() {
    const statement = current.trim();
    if (statement) statements.push(`${statement}\n`);
    current = '';
  }
}

function buildChunks(statements, options) {
  const groups = groupTransactions(statements);
  const chunks = [];
  let current = [];
  let currentBytes = 0;
  let currentStatements = 0;

  for (const group of groups) {
    const groupSql = group.join('');
    const groupBytes = Buffer.byteLength(groupSql, 'utf8');
    const groupStatements = group.length;
    const exceedsLimit =
      current.length > 0 &&
      (currentStatements + groupStatements > options.maxStatements ||
        currentBytes + groupBytes > options.maxBytes);

    if (exceedsLimit) flush();

    current.push(groupSql);
    currentBytes += groupBytes;
    currentStatements += groupStatements;
  }

  flush();
  return chunks;

  function flush() {
    if (current.length === 0) return;
    chunks.push(current.join(''));
    current = [];
    currentBytes = 0;
    currentStatements = 0;
  }
}

function groupTransactions(statements) {
  const groups = [];
  let index = 0;

  while (index < statements.length) {
    const statement = statements[index];
    if (!/^BEGIN\s+TRANSACTION\s*;/i.test(statement.trim())) {
      groups.push([statement]);
      index += 1;
      continue;
    }

    const transaction = [statement];
    index += 1;
    while (index < statements.length) {
      transaction.push(statements[index]);
      const isCommit = /^COMMIT\s*;/i.test(statements[index].trim());
      index += 1;
      if (isCommit) break;
    }
    groups.push(transaction);
  }

  return groups;
}
