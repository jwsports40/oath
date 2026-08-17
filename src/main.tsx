import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import '@fontsource/jacquard-12';
import '@fontsource/cinzel/700.css';
import './styles/global.css';

import { registerSW } from 'virtual:pwa-register';
import React from 'react';

// Hot auto-update: register immediately, then poll for a new version every
// 5 minutes while the app is open (and on returning to the foreground).
// skipWaiting+clientsClaim in the SW make the new version take over at once.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration === undefined) return;
    const check = (): void => { void registration.update(); };
    setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

import ReactDOM from 'react-dom/client';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
