/** Feedback ordering helper test: node --experimental-strip-types scripts/test-feedback.ts */
import assert from 'node:assert/strict';
import { newestFeedbackFirst } from '../lib/feedback.ts';

const old = { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' };
const newest = { id: 'new', createdAt: '2026-10-25T12:00:00.000Z' };
const middle = { id: 'middle', createdAt: '2026-05-10T09:00:00.000Z' };
const input = [old, newest, middle];
assert.deepStrictEqual(newestFeedbackFirst(input).map(item => item.id), ['new', 'middle', 'old']);
assert.deepStrictEqual(input.map(item => item.id), ['old', 'new', 'middle'], 'helper must not mutate input');
assert.deepStrictEqual(newestFeedbackFirst([
  { id: 'invalid', createdAt: 'invalid' },
  { id: 'valid', createdAt: '2026-01-01T00:00:00.000Z' },
]).map(item => item.id), ['valid', 'invalid']);
console.log('✓ 你講我聽：最新留言置頂；原陣列不變，無效日期安全處理');
