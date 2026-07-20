import { useEffect, useRef, useState } from 'react';
import {
  adjustUiZoom,
  getDisplayPreferences,
  useDisplayPreferences,
} from '@/services/display-preferences';

const HUD_DURATION_MS = 900;

export function ZoomController(): React.JSX.Element | null {
  const { uiZoom } = useDisplayPreferences();
  const [visibleRevision, setVisibleRevision] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousZoom = useRef(getDisplayPreferences().uiZoom);

  useEffect(() => {
    if (previousZoom.current === uiZoom) return;
    previousZoom.current = uiZoom;
    setVisibleRevision((revision) => (revision ?? 0) + 1);
  }, [uiZoom]);

  useEffect(() => {
    const offMenuZoom = window.api.onUiZoomRequest(({ direction }) => {
      adjustUiZoom(direction);
    });
    return offMenuZoom;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key;
      if (key !== '=' && key !== '+' && key !== '-' && key !== '_' && key !== '0') return;
      event.preventDefault();
      adjustUiZoom(key === '0' ? 'reset' : key === '-' || key === '_' ? 'out' : 'in');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (visibleRevision === null) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisibleRevision(null), HUD_DURATION_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visibleRevision]);

  if (visibleRevision === null) return null;

  return (
    <div className="zoom-hud" aria-live="polite" aria-atomic="true">
      <div className="zoom-hud-card" style={{ zoom: 1 / uiZoom }}>
        <span className="zoom-hud-value">{Math.round(uiZoom * 100)}%</span>
        <span className="zoom-hud-label">UI zoom</span>
      </div>
    </div>
  );
}
