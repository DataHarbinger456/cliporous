import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimFirstExportCelebration,
  FIRST_EXPORT_STORAGE_KEY,
  showCompletionCelebration,
  subscribeToCompletionCelebrations,
} from './completion-celebrations';

beforeEach(() => localStorage.clear());

describe('completion celebrations', () => {
  it('claims the first successful export exactly once', () => {
    expect(claimFirstExportCelebration()).toBe(true);
    expect(localStorage.getItem(FIRST_EXPORT_STORAGE_KEY)).toBe('1');
    expect(claimFirstExportCelebration()).toBe(false);
  });

  it('emits one finite celebration event and supports cleanup', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCompletionCelebrations(listener);
    showCompletionCelebration('clean-batch');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('clean-batch');
    unsubscribe();
    showCompletionCelebration('first-export');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
