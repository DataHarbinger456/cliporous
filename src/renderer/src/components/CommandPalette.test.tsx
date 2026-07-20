import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub } from '@/components/__tests__/test-utils';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayPreferences,
  setDisplayPreferences,
} from '@/services/display-preferences';
import { useStore } from '@/store';
import { CommandPalette } from './CommandPalette';

function renderPalette(): { onOpen: ReturnType<typeof vi.fn> } {
  const onOpen = vi.fn();
  render(
    <CommandPalette
      open
      onOpenChange={vi.fn()}
      onNew={vi.fn()}
      onOpen={onOpen}
      onSave={vi.fn()}
      onSaveAs={vi.fn()}
      onShowShortcuts={vi.fn()}
    />,
  );
  return { onOpen };
}

beforeEach(() => {
  installApiStub({
    onUiZoomRequest: vi.fn(() => () => undefined),
    openLogFolder: vi.fn(async () => undefined),
  });
  setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES });
  useStore.getState().reset();
});

afterEach(cleanup);

describe('CommandPalette', () => {
  it('searches creator actions and runs the selected command', () => {
    const { onOpen } = renderPalette();

    fireEvent.change(screen.getByLabelText('Search creator commands'), {
      target: { value: 'open project' },
    });
    fireEvent.click(screen.getByText('Open Project'));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('keeps unavailable commands discoverable while enabling Creator Profile', () => {
    renderPalette();

    expect(screen.getByText('Approve Selected Clip')).toBeInTheDocument();
    expect(screen.getAllByText('Open a clip first.')).toHaveLength(2);
    expect(screen.getByText('Creator Profile').closest('button')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    expect(screen.getByText(/Inspect reusable brand defaults/)).toBeInTheDocument();
  });

  it('keeps studio sound cues opt-in and exposes the persisted toggle state', () => {
    renderPalette();

    const enableSound = screen.getByText('Enable Studio Sound Cues').closest('button');
    expect(enableSound).toBeTruthy();
    expect(getDisplayPreferences().soundEnabled).toBe(false);
    fireEvent.click(enableSound as HTMLButtonElement);

    expect(getDisplayPreferences().soundEnabled).toBe(true);
    expect(screen.getByText('Mute Studio Sound Cues')).toBeInTheDocument();
  });

  it('locks navigation while a single-clip render is active', () => {
    useStore.setState({ singleRenderStatus: 'rendering' });
    renderPalette();

    const sourceCommand = screen.getByText('Go to Source').closest('button');
    expect(sourceCommand).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Finish or cancel the active job first.').length).toBeGreaterThan(0);
  });
});
