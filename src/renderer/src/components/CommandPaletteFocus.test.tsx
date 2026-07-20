import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '@/components/CommandPalette';
import { installApiStub, resetStore } from './__tests__/test-utils';

function FocusHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open creator commands
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
        onShowShortcuts={vi.fn()}
      />
    </>
  );
}

describe('command palette focus contract', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
  });

  afterEach(cleanup);

  it('moves initial focus into search, closes with Escape, and returns focus to the trigger', async () => {
    render(<FocusHarness />);
    const trigger = screen.getByRole('button', { name: 'Open creator commands' });
    trigger.focus();
    fireEvent.click(trigger);

    const search = await screen.findByLabelText('Search creator commands');
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.keyDown(search, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByLabelText('Search creator commands')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
