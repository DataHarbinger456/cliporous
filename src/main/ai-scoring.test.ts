import { beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('./ai/gemini-client', () => ({
  callGeminiWithRetry: (...args: unknown[]) => callMock(...args),
  MODELS: { FAST: ['model-a', 'model-b'] },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {},
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    INTEGER: 'INTEGER',
  },
}));

import { scoreTranscript } from './ai-scoring';

const validResponse = {
  segments: [
    {
      start_time: '00:05',
      end_time: '00:30',
      text: 'A complete thought with a {specific} useful payoff.',
      score: 85,
      hook_text: 'The specific payoff',
      reasoning: 'This is complete and useful.',
    },
  ],
  summary: 'A useful discussion.',
  key_topics: ['testing'],
};

async function score(): ReturnType<typeof scoreTranscript> {
  return scoreTranscript('test-key', '[00:05] transcript', 120, vi.fn());
}

describe('scoreTranscript', () => {
  beforeEach(() => {
    callMock.mockReset();
  });

  it('recovers the first complete object when Gemini concatenates JSON responses', async () => {
    callMock.mockResolvedValue(
      `${JSON.stringify(validResponse)}\n${JSON.stringify({ duplicate: true })}`,
    );

    const result = await score();

    expect(result).toEqual({
      segments: [
        {
          startTime: 5,
          endTime: 30,
          text: validResponse.segments[0].text,
          score: 85,
          hookText: 'The specific payoff',
          reasoning: 'This is complete and useful.',
        },
      ],
      summary: 'A useful discussion.',
      keyTopics: ['testing'],
    });
  });

  it('requests Gemini structured output with a required scoring schema', async () => {
    callMock.mockResolvedValue(JSON.stringify(validResponse));

    await score();

    const call = callMock.mock.calls[0][1] as {
      config: { responseMimeType: string; responseSchema: Record<string, unknown> };
    };
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseSchema).toMatchObject({
      type: 'OBJECT',
      required: ['segments', 'summary', 'key_topics'],
      properties: {
        segments: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['start_time', 'end_time', 'text', 'score', 'hook_text', 'reasoning'],
          },
        },
      },
    });
  });

  it('returns a stable error when no complete JSON object exists', async () => {
    callMock.mockResolvedValue('{"segments": [');

    await expect(score()).rejects.toThrow('Gemini returned an unparseable scoring response');
  });
});
