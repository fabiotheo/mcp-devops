/**
 * Snapshot Testing Helpers for MCP Ink CLI
 *
 * Provides utilities to create and compare snapshots of application state,
 * particularly focused on the fullHistory which is critical for AI context.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Snapshot directory
const SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots');

/**
 * Ensure snapshot directory exists
 */
async function ensureSnapshotDir() {
  try {
    await fs.access(SNAPSHOT_DIR);
  } catch {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  }
}

/**
 * Generate a hash for snapshot comparison
 */
function generateHash(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data, null, 2))
    .digest('hex');
}

/**
 * Sanitize data for consistent snapshots
 * Removes timestamps and other non-deterministic values
 */
function sanitizeForSnapshot(data, options = {}) {
  const {
    removeTimestamps = true,
    removeIds = false,
    removePaths = false,
    customSanitizers = [],
  } = options;

  const sanitize = (obj) => {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }

    if (typeof obj === 'object') {
      const sanitized = {};

      for (const [key, value] of Object.entries(obj)) {
        // Remove timestamps
        if (removeTimestamps && (
          key.includes('timestamp') ||
          key.includes('Timestamp') ||
          key.includes('createdAt') ||
          key.includes('updatedAt') ||
          key === 'date' ||
          key === 'time'
        )) {
          sanitized[key] = '[TIMESTAMP]';
        }
        // Remove IDs
        else if (removeIds && (
          key === 'id' ||
          key === 'requestId' ||
          key === 'tursoId' ||
          key.endsWith('Id')
        )) {
          sanitized[key] = '[ID]';
        }
        // Remove paths
        else if (removePaths && (
          key === 'path' ||
          key === 'filePath' ||
          key === 'directory'
        )) {
          sanitized[key] = '[PATH]';
        }
        // Recursively sanitize
        else {
          sanitized[key] = sanitize(value);
        }
      }

      // Apply custom sanitizers
      customSanitizers.forEach(sanitizer => {
        sanitizer(sanitized);
      });

      return sanitized;
    }

    return obj;
  };

  return sanitize(data);
}

/**
 * Create a snapshot of the given data
 * @param {any} data - Data to snapshot
 * @param {string} name - Snapshot name
 * @param {Object} options - Snapshot options
 */
export async function createSnapshot(data, name, options = {}) {
  await ensureSnapshotDir();

  const {
    update = false, // Whether to update existing snapshot
    sanitize = true,
    ...sanitizeOptions
  } = options;

  // Sanitize data if requested
  const dataToSnapshot = sanitize
    ? sanitizeForSnapshot(data, sanitizeOptions)
    : data;

  const snapshotPath = path.join(SNAPSHOT_DIR, `${name}.snap.json`);

  // Check if snapshot exists
  let existingSnapshot = null;
  try {
    const content = await fs.readFile(snapshotPath, 'utf8');
    existingSnapshot = JSON.parse(content);
  } catch {
    // Snapshot doesn't exist, will create new one
  }

  if (existingSnapshot && !update) {
    // Snapshot exists and we're not updating
    return {
      path: snapshotPath,
      exists: true,
      hash: generateHash(existingSnapshot),
      updated: false,
    };
  }

  // Create or update snapshot
  const snapshot = {
    name,
    created: existingSnapshot?.created || new Date().toISOString(),
    updated: new Date().toISOString(),
    hash: generateHash(dataToSnapshot),
    data: dataToSnapshot,
  };

  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

  return {
    path: snapshotPath,
    exists: false,
    hash: snapshot.hash,
    updated: true,
  };
}

/**
 * Match data against an existing snapshot
 * @param {any} data - Data to match
 * @param {string} name - Snapshot name
 * @param {Object} options - Match options
 */
export async function matchSnapshot(data, name, options = {}) {
  await ensureSnapshotDir();

  const {
    createIfMissing = true,
    sanitize = true,
    ...sanitizeOptions
  } = options;

  // Sanitize data if requested
  const dataToMatch = sanitize
    ? sanitizeForSnapshot(data, sanitizeOptions)
    : data;

  const snapshotPath = path.join(SNAPSHOT_DIR, `${name}.snap.json`);

  // Try to load existing snapshot
  let existingSnapshot;
  try {
    const content = await fs.readFile(snapshotPath, 'utf8');
    existingSnapshot = JSON.parse(content);
  } catch (error) {
    if (createIfMissing) {
      // Create new snapshot
      const result = await createSnapshot(data, name, options);
      return {
        match: true,
        created: true,
        path: result.path,
        message: `Snapshot created: ${name}`,
      };
    } else {
      return {
        match: false,
        created: false,
        path: snapshotPath,
        error: 'Snapshot not found',
        message: `Snapshot not found: ${name}`,
      };
    }
  }

  // Compare hashes
  const currentHash = generateHash(dataToMatch);
  const existingHash = generateHash(existingSnapshot.data);

  if (currentHash === existingHash) {
    return {
      match: true,
      created: false,
      path: snapshotPath,
      message: `Snapshot matched: ${name}`,
    };
  }

  // Generate diff
  const diff = generateDiff(existingSnapshot.data, dataToMatch);

  return {
    match: false,
    created: false,
    path: snapshotPath,
    diff,
    message: `Snapshot mismatch: ${name}\n${formatDiff(diff)}`,
    expected: existingSnapshot.data,
    received: dataToMatch,
  };
}

/**
 * Generate a diff between two objects
 */
function generateDiff(expected, received, path = '') {
  const diffs = [];

  // Handle different types
  if (typeof expected !== typeof received) {
    diffs.push({
      path: path || 'root',
      type: 'type',
      expected: typeof expected,
      received: typeof received,
    });
    return diffs;
  }

  // Handle arrays
  if (Array.isArray(expected)) {
    if (!Array.isArray(received)) {
      diffs.push({
        path: path || 'root',
        type: 'type',
        expected: 'array',
        received: typeof received,
      });
      return diffs;
    }

    if (expected.length !== received.length) {
      diffs.push({
        path: path || 'root',
        type: 'length',
        expected: expected.length,
        received: received.length,
      });
    }

    const maxLength = Math.max(expected.length, received.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= expected.length) {
        diffs.push({
          path: itemPath,
          type: 'added',
          received: received[i],
        });
      } else if (i >= received.length) {
        diffs.push({
          path: itemPath,
          type: 'removed',
          expected: expected[i],
        });
      } else {
        diffs.push(...generateDiff(expected[i], received[i], itemPath));
      }
    }

    return diffs;
  }

  // Handle objects
  if (typeof expected === 'object' && expected !== null) {
    if (typeof received !== 'object' || received === null) {
      diffs.push({
        path: path || 'root',
        type: 'type',
        expected: 'object',
        received: received === null ? 'null' : typeof received,
      });
      return diffs;
    }

    const allKeys = new Set([...Object.keys(expected), ...Object.keys(received)]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;

      if (!(key in expected)) {
        diffs.push({
          path: keyPath,
          type: 'added',
          received: received[key],
        });
      } else if (!(key in received)) {
        diffs.push({
          path: keyPath,
          type: 'removed',
          expected: expected[key],
        });
      } else {
        diffs.push(...generateDiff(expected[key], received[key], keyPath));
      }
    }

    return diffs;
  }

  // Handle primitives
  if (expected !== received) {
    diffs.push({
      path: path || 'root',
      type: 'value',
      expected,
      received,
    });
  }

  return diffs;
}

/**
 * Format diff for display
 */
function formatDiff(diffs) {
  if (diffs.length === 0) return 'No differences';

  const lines = ['Differences found:'];

  for (const diff of diffs) {
    switch (diff.type) {
      case 'type':
        lines.push(`  ${diff.path}: Type mismatch (expected ${diff.expected}, got ${diff.received})`);
        break;
      case 'length':
        lines.push(`  ${diff.path}: Length mismatch (expected ${diff.expected}, got ${diff.received})`);
        break;
      case 'added':
        lines.push(`  ${diff.path}: Added - ${JSON.stringify(diff.received)}`);
        break;
      case 'removed':
        lines.push(`  ${diff.path}: Removed - ${JSON.stringify(diff.expected)}`);
        break;
      case 'value':
        lines.push(`  ${diff.path}: Changed from ${JSON.stringify(diff.expected)} to ${JSON.stringify(diff.received)}`);
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Update an existing snapshot
 */
export async function updateSnapshot(data, name, options = {}) {
  return createSnapshot(data, name, { ...options, update: true });
}

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(name) {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${name}.snap.json`);

  try {
    await fs.unlink(snapshotPath);
    return { deleted: true, path: snapshotPath };
  } catch (error) {
    return { deleted: false, path: snapshotPath, error: error.message };
  }
}

/**
 * List all snapshots
 */
export async function listSnapshots() {
  await ensureSnapshotDir();

  try {
    const files = await fs.readdir(SNAPSHOT_DIR);
    const snapshots = files
      .filter(file => file.endsWith('.snap.json'))
      .map(file => file.replace('.snap.json', ''));

    return snapshots;
  } catch (error) {
    return [];
  }
}

/**
 * Load a snapshot
 */
export async function loadSnapshot(name) {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${name}.snap.json`);

  try {
    const content = await fs.readFile(snapshotPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load snapshot ${name}: ${error.message}`);
  }
}

/**
 * Compare two snapshots
 */
export async function compareSnapshots(name1, name2) {
  const snapshot1 = await loadSnapshot(name1);
  const snapshot2 = await loadSnapshot(name2);

  const diff = generateDiff(snapshot1.data, snapshot2.data);

  return {
    name1,
    name2,
    match: diff.length === 0,
    diff,
    message: formatDiff(diff),
  };
}