import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from './lib/session.jsx';
import App from './App.jsx';
import './styles.css';
import { initPressEffects } from './lib/motion.js';
import { registerSW } from './lib/notify.js';

initPressEffects();
registerSW();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider><App /></SessionProvider>
  </React.StrictMode>,
);
