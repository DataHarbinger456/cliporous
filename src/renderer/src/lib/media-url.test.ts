import { describe, expect, it } from 'vitest';

import { toMediaFileUrl } from './media-url';

describe('toMediaFileUrl', () => {
  it('encodes native paths while preserving browser-safe media URLs', () => {
    expect(toMediaFileUrl('C:\\Videos\\my clip#1.mp4')).toBe('file:///C:/Videos/my%20clip%231.mp4');
    expect(toMediaFileUrl('https://example.test/video.mp4')).toBe('https://example.test/video.mp4');
    expect(toMediaFileUrl('HTTPS://example.test/video.mp4')).toBe('HTTPS://example.test/video.mp4');
  });
});
