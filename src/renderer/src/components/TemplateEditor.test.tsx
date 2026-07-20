import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TemplateEditor } from '@/components/TemplateEditor';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';

describe('TemplateEditor drag alternatives', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
    useStore.getState().setTemplateLayout({
      titleText: { x: 40, y: 30 },
      subtitles: { x: 50, y: 70 },
    });
  });

  afterEach(cleanup);

  it('moves overlays with named buttons, numeric fields, and arrow keys', () => {
    render(<TemplateEditor open showTrigger={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move hook title right' }));
    expect(useStore.getState().settings.templateLayout.titleText.x).toBe(41);

    const titleHandle = screen.getByRole('button', {
      name: /Hook title position\. Position 41 percent horizontally/i,
    });
    fireEvent.keyDown(titleHandle, { key: 'ArrowDown', shiftKey: true });
    expect(useStore.getState().settings.templateLayout.titleText.y).toBe(35);

    const horizontalFields = screen.getAllByLabelText('Horizontal %');
    fireEvent.change(horizontalFields[0] as HTMLInputElement, { target: { value: '50' } });
    expect(useStore.getState().settings.templateLayout.titleText.x).toBe(50);
    expect(screen.getByText(/snapped to center/i)).toBeInTheDocument();
  });

  it('uses the current source frame when one exists', () => {
    useStore.setState({
      sources: [
        {
          id: 'source-frame',
          path: '/QA-Fixtures/source.mp4',
          name: 'source.mp4',
          duration: 60,
          width: 1920,
          height: 1080,
          thumbnail: 'data:image/png;base64,fixture',
          origin: 'file',
          mediaStatus: 'online',
        },
      ],
      activeSourceId: 'source-frame',
    });

    render(<TemplateEditor open showTrigger={false} />);

    expect(screen.getByRole('img', { name: 'Current source frame' })).toHaveAttribute(
      'src',
      'data:image/png;base64,fixture',
    );
  });
});
