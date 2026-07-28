import { describe, expect, it } from 'vitest';
import { getYouTubeVideoId } from './youtube';

describe('getYouTubeVideoId', () => {
  it('parses standard watch URLs', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses short youtu.be links', () => {
    expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
  });

  it('parses shorts URLs', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses livestream VOD URLs (youtube.com/live/<id>)', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/live/nto_HobeWt4?si=Uabc123')).toBe(
      'nto_HobeWt4',
    );
  });

  it('rejects non-YouTube URLs', () => {
    expect(getYouTubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(getYouTubeVideoId('not a url')).toBeNull();
  });
});
