import { describe, it, expect } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('client-cli', () => {
  it('should export VERSION', () => {
    expect(VERSION).toBe('0.0.1');
  });
});
