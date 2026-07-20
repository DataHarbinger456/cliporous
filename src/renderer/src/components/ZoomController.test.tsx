import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDisplayPreferences } from '@/services/display-preferences';
import { ZoomController } from './ZoomController';

const setUiZoom = vi.fn();

beforeEach(() => {
  setUiZoom.mockClear();
  window.api = {
    setUiZoom,
    onUiZoomRequest: vi.fn(() => () => undefined),
  } as unknown as typeof window.api;
  setDisplayPreferences({ uiZoom: 1 });
  setUiZoom.mockClear();
});

afterEach(cleanup);

describe('ZoomController', () => {
  it('persists keyboard zoom and announces the percentage HUD', () => {
    render(<ZoomController />);

    fireEvent.keyDown(window, { key: '=', metaKey: true });

    expect(screen.getByText('105%')).toBeInTheDocument();
    expect(setUiZoom).toHaveBeenCalledWith(1.05);
    expect(document.documentElement.style.zoom).toBe('');
  });
});
