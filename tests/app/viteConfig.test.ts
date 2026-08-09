import { describe, expect, it } from 'vitest';

import { resolveApiPort } from '../../vite.config';

describe('resolveApiPort', () => {
  it.each([
    [undefined, 8787],
    ['', 8787],
    ['8790', 8790],
    ['invalid', 8787],
    ['0', 8787],
    ['65536', 8787],
    ['8787.5', 8787],
  ])('将 %s 解析为 %i', (value, expected) => {
    expect(resolveApiPort(value)).toBe(expected);
  });
});
