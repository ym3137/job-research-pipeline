import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuota } from './quota.mjs';

test('quota exposes only remaining window percentages and reset times', () => {
  const view = normalizeQuota({
    rateLimitsByLimitId: { codex: {
      planType: 'plus',
      primary: { usedPercent: 26, windowDurationMins: 300, resetsAt: 1789254060 },
      secondary: { usedPercent: 4, windowDurationMins: 10080, resetsAt: 1789840860 },
    } },
  });
  assert.equal(view.status, 'available');
  assert.equal(view.primary.remainingPercent, 74);
  assert.equal(view.secondary.remainingPercent, 96);
  assert.equal(view.primary.resetsAt, 1789254060);
  assert.equal(normalizeQuota({}).status, 'unavailable');
});
