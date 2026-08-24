/**
 * F8.2 — `?next=` must return users where they were going, and must never
 * become an open redirect.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DESTINATION,
  resolveNextDestination,
  sanitizeNextDestination,
} from '@/lib/auth/nextDestination';

describe('sanitizeNextDestination — accepts same-origin relative paths', () => {
  for (const p of ['/tasks', '/tasks?new=true', '/docs/abc-123', '/plan#today', '/']) {
    it(`accepts ${p}`, () => {
      expect(sanitizeNextDestination(p)).toBe(p);
    });
  }
});

describe('sanitizeNextDestination — rejects anything that leaves the origin', () => {
  const hostile = [
    'https://evil.com/x',
    'http://evil.com',
    '//evil.com',
    '//evil.com/path',
    String.raw`/\evil.com`,
    String.raw`\evil.com`,
    'javascript:alert(1)',
    'data:text/html,<script>',
    'tasks',
    '',
    null,
    undefined,
  ];
  for (const raw of hostile) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      expect(sanitizeNextDestination(raw)).toBeNull();
    });
  }
});

describe('resolveNextDestination', () => {
  it('falls back to the default when the param is missing', () => {
    expect(resolveNextDestination(null)).toBe(DEFAULT_DESTINATION);
  });

  it('falls back to the default when the param is hostile', () => {
    expect(resolveNextDestination('https://evil.com')).toBe(DEFAULT_DESTINATION);
  });

  it('passes a valid path through', () => {
    expect(resolveNextDestination('/tasks?new=true')).toBe('/tasks?new=true');
  });
});
