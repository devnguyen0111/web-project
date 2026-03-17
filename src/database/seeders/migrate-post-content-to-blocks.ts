import mongoose, { Types } from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';

type RawRecord = Record<string, unknown>;

interface LegacyPost {
  _id: Types.ObjectId;
  excerpt?: unknown;
  content?: unknown;
  searchText?: unknown;
  blocks?: unknown;
}

interface MigrationStats {
  scanned: number;
  updated: number;
  createdBlocks: number;
  updatedSearchText: number;
  updatedContent: number;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeBlocks(rawBlocks: unknown): RawRecord[] {
  if (!Array.isArray(rawBlocks)) {
    return [];
  }

  return rawBlocks.filter(
    (block): block is RawRecord =>
      block !== null && typeof block === 'object' && !Array.isArray(block),
  );
}

function extractSearchTokensFromBlocks(blocks: RawRecord[]): string[] {
  const tokens: string[] = [];

  for (const block of blocks) {
    const type = normalizeString(block.type);

    if (!type) {
      continue;
    }

    if (type === 'paragraph' || type === 'heading' || type === 'quote') {
      const text = normalizeString(block.text);
      if (text) {
        tokens.push(text);
      }
      continue;
    }

    if (type === 'list') {
      const items = Array.isArray(block.items) ? block.items : [];
      for (const item of items) {
        const text = normalizeString(item);
        if (text) {
          tokens.push(text);
        }
      }
      continue;
    }

    if (type === 'image') {
      const alt = normalizeString(block.alt);
      const caption = normalizeString(block.caption);

      if (alt) {
        tokens.push(alt);
      }

      if (caption) {
        tokens.push(caption);
      }
      continue;
    }

    if (type === 'code') {
      const code = normalizeString(block.code);
      if (code) {
        tokens.push(code.slice(0, 500));
      }
    }
  }

  return tokens;
}

function buildSearchText(excerpt: unknown, blocks: RawRecord[]): string {
  const excerptText = normalizeString(excerpt);
  const blockTokens = extractSearchTokensFromBlocks(blocks);

  const merged = excerptText ? [excerptText, ...blockTokens] : blockTokens;
  return merged.join(' ').replace(/\s+/g, ' ').trim();
}

function readEnvFileMongoUri(): string | undefined {
  const envPath = path.resolve(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== 'MONGODB_URI') {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const withoutQuotes = rawValue.replace(/^"(.*)"$/, '$1');
    const normalizedValue = withoutQuotes.trim();

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return undefined;
}

async function run(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ??
    readEnvFileMongoUri() ??
    'mongodb://127.0.0.1:27017/web_project';

  await mongoose.connect(uri);

  try {
    const postsCollection = mongoose.connection.collection<LegacyPost>('posts');
    const stats: MigrationStats = {
      scanned: 0,
      updated: 0,
      createdBlocks: 0,
      updatedSearchText: 0,
      updatedContent: 0,
    };

    const cursor = postsCollection.find(
      {},
      {
        projection: {
          excerpt: 1,
          content: 1,
          searchText: 1,
          blocks: 1,
        },
      },
    );

    for await (const post of cursor) {
      stats.scanned += 1;

      const existingBlocks = normalizeBlocks(post.blocks);
      let nextBlocks = existingBlocks;
      const setPayload: Record<string, unknown> = {};

      if (existingBlocks.length === 0) {
        const fallbackText =
          normalizeString(post.content) ||
          normalizeString(post.searchText) ||
          normalizeString(post.excerpt);

        if (fallbackText) {
          nextBlocks = [
            {
              type: 'paragraph',
              text: fallbackText,
            },
          ];
          setPayload.blocks = nextBlocks;
          stats.createdBlocks += 1;
        }
      }

      const nextSearchText = buildSearchText(post.excerpt, nextBlocks);
      const currentSearchText = normalizeString(post.searchText) ?? '';

      if (nextSearchText && nextSearchText !== currentSearchText) {
        setPayload.searchText = nextSearchText;
        stats.updatedSearchText += 1;
      }

      const currentContent = normalizeString(post.content) ?? '';
      if (nextSearchText && nextSearchText !== currentContent) {
        setPayload.content = nextSearchText;
        stats.updatedContent += 1;
      }

      if (Object.keys(setPayload).length > 0) {
        await postsCollection.updateOne(
          { _id: post._id },
          { $set: setPayload },
        );
        stats.updated += 1;
      }
    }

    console.log(
      `[post-block-migration] scanned=${stats.scanned} updated=${stats.updated} createdBlocks=${stats.createdBlocks} updatedSearchText=${stats.updatedSearchText} updatedContent=${stats.updatedContent}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((error: unknown) => {
  console.error('[post-block-migration] failed', error);
  process.exit(1);
});
