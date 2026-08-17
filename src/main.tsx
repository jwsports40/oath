import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import '@fontsource/jacquard-12';
import '@fontsource/cinzel/700.css';
import './styles/global.css';

import { registerSW } from 'virtual:pwa-register';
import React from 'react';

// Auto-update: fetch the new service worker immediately and reload as soon as
// it activates — no more close-and-reopen-twice to see new versions.
registerSW({ immediate: true });

import ReactDOM from 'react-dom/client';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
