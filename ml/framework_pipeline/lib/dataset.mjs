import fs from 'node:fs';
import path from 'node:path';

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const rng = mulberry32(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function loadJsonlDataset(datasetPath) {
  const absolutePath = path.resolve(datasetPath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const rows = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const row = JSON.parse(line);
    if (typeof row.title !== 'string' || typeof row.label !== 'number') continue;

    rows.push({
      title: row.title,
      channelName: typeof row.channelName === 'string' ? row.channelName : '',
      videoId: typeof row.videoId === 'string' ? row.videoId : '',
      videoUrl: typeof row.videoUrl === 'string' ? row.videoUrl : '',
      label: row.label === 1 ? 1 : 0,
    });
  }

  return rows;
}

export function stratifiedSplit(rows, { trainRatio = 0.8, seed = 42 } = {}) {
  const grouped = new Map([
    [0, []],
    [1, []],
  ]);

  for (const row of rows) {
    grouped.get(row.label).push(row);
  }

  const train = [];
  const test = [];

  for (const [label, labelRows] of grouped.entries()) {
    const shuffled = shuffle(labelRows, seed + label);
    const splitIndex = Math.max(1, Math.floor(shuffled.length * trainRatio));
    train.push(...shuffled.slice(0, splitIndex));
    test.push(...shuffled.slice(splitIndex));
  }

  return {
    train: shuffle(train, seed + 100),
    test: shuffle(test, seed + 200),
  };
}

export function summarizeLabels(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.label === 1 ? 'educational' : 'nonEducational'] += 1;
    if (!row.channelName.trim()) summary.missingChannel += 1;
    return summary;
  }, {
    total: 0,
    educational: 0,
    nonEducational: 0,
    missingChannel: 0,
  });
}
