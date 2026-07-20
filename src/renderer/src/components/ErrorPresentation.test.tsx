import { createStructuredError } from '@shared/errors';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorPresentation } from './ErrorPresentation';

const ERROR = createStructuredError({
  source: 'render',
  message: 'ffmpeg exited with code 1: No space left on device',
  failedStage: 'rendering',
});

afterEach(cleanup);

describe('ErrorPresentation', () => {
  it('leads with creator recovery and keeps diagnostics collapsed', () => {
    render(<ErrorPresentation error={ERROR} />);

    expect(screen.getByText('What happened')).toBeInTheDocument();
    expect(screen.getByText('What is safe')).toBeInTheDocument();
    expect(screen.getByText('What to do next')).toBeInTheDocument();
    expect(screen.queryByText('Technical Error Log')).not.toBeInTheDocument();
    expect(screen.queryByText(/ffmpeg exited/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText('Technical Error Log')).toBeInTheDocument();
    expect(screen.getByText(`Reference ${ERROR.correlationId}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Logs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Log Folder' })).toBeInTheDocument();
  });

  it('renders a concrete recovery action', () => {
    const retry = vi.fn();
    render(
      <ErrorPresentation error={ERROR} actions={[{ label: 'Retry failed (1)', onClick: retry }]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed (1)' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
