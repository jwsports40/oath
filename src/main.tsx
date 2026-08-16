import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import '@fontsource/jacquard-12';
import '@fontsource/cinzel/700.css';
import './styles/global.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
