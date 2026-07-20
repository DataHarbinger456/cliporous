import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { ZoomController } from './components/ZoomController';
import { initializeTheme, setTheme } from './hooks/useTheme';
import { installQaApi } from './qa/api';
import { parseQaState, QA_NOW, seedQaState } from './qa/fixtures';
import { QaRendererShowcase } from './qa/QaRendererShowcase';
import SettingsWindow from './SettingsWindow';
import {
  initializeDisplayPreferences,
  setDisplayPreferences,
} from './services/display-preferences';
// Activate the debounced auto-save subscriber (registers a useStore.subscribe
// at module-load time — see services/project-service.ts). Harmless in the
// settings window: the subscriber only schedules a save when `isDirty` flips
// true, which never happens there.
import './services';

import './assets/index.css';

// Hash-based routing. The settings BrowserWindow loads the same renderer
// bundle with `#settings`; everything else (including no hash) renders the
// main App.
const qaState = parseQaState(window.location.hash);
const isSettingsRoute = window.location.hash === '#settings';

if (qaState) {
  installQaApi(qaState);
  Date.now = () => QA_NOW;
  seedQaState(qaState);
}

initializeTheme();
initializeDisplayPreferences();

if (qaState) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme') === 'dark') setTheme('dark');
  if (params.get('theme') === 'light') setTheme('light');
  if (params.get('zoom') === '2') setDisplayPreferences({ uiZoom: 2 });
  if (params.get('motion') === 'reduce') {
    document.documentElement.classList.add('qa-reduced-motion');
  }
  if (params.get('contrast') === 'forced') {
    document.documentElement.classList.add('qa-forced-colors');
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('BatchClip root element is missing');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {qaState ? (
      <QaRendererShowcase stateId={qaState} />
    ) : isSettingsRoute ? (
      <SettingsWindow />
    ) : (
      <App />
    )}
    <ZoomController />
  </React.StrictMode>,
);
