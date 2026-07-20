import { PROJECT_SCHEMA_VERSION } from '@shared/project';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectIdentityStatus } from '@/components/ProjectIdentityStatus';
import { useStore } from '@/store';

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({
    currentProject: {
      id: 'project-1',
      displayName: 'Founder Interview',
      filePath: '/projects/founder-interview.batchclip',
      createdAt: 1,
      modifiedAt: 2,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    },
    sources: [
      {
        id: 'source-1',
        path: '/videos/founder-interview.mp4',
        name: 'founder-interview.mp4',
        duration: 60,
        width: 1920,
        height: 1080,
        origin: 'file',
      },
    ],
    activeSourceId: 'source-1',
    isDirty: false,
    saveStatus: 'idle',
  });
  useStore.setState({ isDirty: false, saveStatus: 'idle' });
});

afterEach(cleanup);

describe('ProjectIdentityStatus', () => {
  it('shows project, source, save truth, and native window title context', () => {
    render(<ProjectIdentityStatus stage="ready" />);

    expect(screen.getByText('Founder Interview')).toBeInTheDocument();
    expect(screen.getByText('founder-interview.mp4')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(document.title).toBe('Founder Interview · BatchClip');
  });

  it('announces saving, saved, and failure states without transient toasts', () => {
    render(<ProjectIdentityStatus stage="rendering" />);

    act(() => useStore.setState({ saveStatus: 'saving' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saving');

    act(() => useStore.setState({ saveStatus: 'saved', isDirty: false }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved just now');

    act(() =>
      useStore.setState({
        saveStatus: 'error',
        isDirty: true,
        lastSaveError: 'Disk is full',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Disk is full');
    expect(document.title).toContain('Founder Interview • Unsaved · Rendering');
  });

  it('keeps project and save truth visible in the compact high-zoom layout', () => {
    const { container } = render(<ProjectIdentityStatus stage="ready" compact />);

    expect(container.firstElementChild).toHaveClass('max-w-36');
    expect(screen.getByText('founder-interview.mp4')).toHaveClass('max-w-20');
    expect(screen.getByText('Founder Interview')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
