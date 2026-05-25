import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { finished } from 'node:stream/promises';

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.outputDir) {
  console.error(
    'Usage: node scripts/geoip/split-d1-sql.mjs --input <sql> --output-dir <dir> [--max-statements <count>] [--max-bytes <bytes>]'
  );
  process.exit(1);
}

const limits = {
  maxStatements: parsePositiveInteger(args.maxStatements || '500', '--max-statements'),
  maxBytes: parsePositiveInteger(args.maxBytes || '5000000', '--max-bytes')
};

await rm(args.outputDir, { recursive: true, force: true });
await mkdir(args.outputDir, { recursive: true });

const stats = await splitSqlFile(args.input, args.outputDir, limits);

console.log(
  `Split ${basename(args.input)} into ${stats.chunks} D1 chunks: statements=${stats.statements} max_statements=${limits.maxStatements} max_bytes=${limits.maxBytes}`
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

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function splitSqlFile(input, outputDir, limits) {
  const writer = createChunkWriter(outputDir, limits);
  const reader = createReadStream(input, { encoding: 'utf8' });
  let current = '';
  let quoted = false;
  let pendingQuote = false;

  for await (const chunk of reader) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];

      if (pendingQuote) {
        if (char === "'") {
          current += char;
          pendingQuote = false;
          continue;
        }
        quoted = false;
        pendingQuote = false;
      }

      current += char;

      if (char === "'" && quoted) {
        pendingQuote = true;
      } else if (char === "'") {
        quoted = true;
      } else if (char === ';' && !quoted) {
        await writer.addStatement(current);
        current = '';
      }
    }
  }

  if (pendingQuote) quoted = false;
  await writer.addStatement(current);
  return writer.close();
}

function createChunkWriter(outputDir, limits) {
  let chunkIndex = 0;
  let chunkStream = null;
  let chunkBytes = 0;
  let chunkStatements = 0;
  let totalStatements = 0;
  let pendingTransaction = null;

  return {
    async addStatement(rawStatement) {
      const statement = rawStatement.trim();
      if (!statement) return;

      const statementSql = `${statement}\n`;
      const normalized = statement.toUpperCase();

      if (pendingTransaction) {
        pendingTransaction.push(statementSql);
        if (/^COMMIT\s*;?$/.test(normalized)) {
          const transaction = pendingTransaction;
          pendingTransaction = null;
          await writeGroup(transaction);
        }
        return;
      }

      if (/^BEGIN\s+TRANSACTION\s*;?$/.test(normalized)) {
        pendingTransaction = [statementSql];
        return;
      }

      await writeGroup([statementSql]);
    },

    async close() {
      if (pendingTransaction) {
        await writeGroup(pendingTransaction);
        pendingTransaction = null;
      }
      if (chunkStream) {
        chunkStream.end();
        await finished(chunkStream);
      }
      return { chunks: chunkIndex, statements: totalStatements };
    }
  };

  async function writeGroup(group) {
    const groupSql = group.join('');
    const groupBytes = Buffer.byteLength(groupSql, 'utf8');
    const groupStatements = group.length;
    const exceedsLimit =
      chunkStream &&
      chunkStatements > 0 &&
      (chunkStatements + groupStatements > limits.maxStatements || chunkBytes + groupBytes > limits.maxBytes);

    if (exceedsLimit) {
      chunkStream.end();
      await finished(chunkStream);
      chunkStream = null;
      chunkBytes = 0;
      chunkStatements = 0;
    }

    if (!chunkStream) {
      chunkIndex += 1;
      const filename = `chunk-${String(chunkIndex).padStart(4, '0')}.sql`;
      chunkStream = createWriteStream(join(outputDir, filename), { encoding: 'utf8' });
    }

    if (!chunkStream.write(groupSql)) {
      await new Promise((resolve) => chunkStream.once('drain', resolve));
    }
    chunkBytes += groupBytes;
    chunkStatements += groupStatements;
    totalStatements += groupStatements;
  }
}
