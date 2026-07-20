import { fireEvent, render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionCard, type ConnectionCardProps } from './ConnectionCard';

const BASE_PROPS: ConnectionCardProps = {
  id: 'gemini-test',
  name: 'Gemini',
  description: 'Analyzes transcripts for content editing.',
  icon: Sparkles,
  required: true,
  value: 'configured-key',
  placeholder: 'Paste a key',
  state: 'configured',
  feedback: 'A key is configured but has not been tested in this window.',
  impact: 'Without it, AI editing stops. Local transcription and rendering still work.',
  keyUrl: 'https://example.com/key',
  onChange: vi.fn(),
  onTest: vi.fn(),
};

describe('ConnectionCard', () => {
  it('shows configured and tested connection states with explicit feature impact', () => {
    const { rerender } = render(<ConnectionCard {...BASE_PROPS} />);

    expect(screen.getByText('Configured, not tested')).toBeInTheDocument();
    expect(screen.getByText(/Local transcription and rendering still work/)).toBeInTheDocument();

    rerender(
      <ConnectionCard
        {...BASE_PROPS}
        state="connected"
        feedback="Connected and saved. AI editing is ready."
      />,
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/AI editing is ready/)).toHaveClass('status-success');
  });

  it('announces invalid and unavailable states without relying on color', () => {
    const { rerender } = render(
      <ConnectionCard
        {...BASE_PROPS}
        state="invalid"
        feedback="Gemini rejected this key. Replace it, then test again."
      />,
    );

    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Replace it');

    const unavailableProps: ConnectionCardProps = {
      ...BASE_PROPS,
      name: 'fal.ai',
      state: 'unavailable',
      feedback: 'This optional integration is not implemented in this build.',
    };
    delete unavailableProps.onTest;
    rerender(<ConnectionCard {...unavailableProps} />);
    expect(screen.getByText('Optional and unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
  });

  it('disables duplicate tests while pending and keeps the key field operable', () => {
    const onChange = vi.fn();
    render(
      <ConnectionCard
        {...BASE_PROPS}
        state="testing"
        feedback="Contacting Gemini without saving or changing the key."
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Testing…' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Gemini API key'), {
      target: { value: 'replacement-key' },
    });
    expect(onChange).toHaveBeenCalledWith('replacement-key');
  });
});
