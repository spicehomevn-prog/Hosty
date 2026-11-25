import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from './lib/session.jsx';
import App from './App.jsx';
import Legal, { LEGAL_PATHS } from './components/Legal.jsx';
import './styles.css';
import { initPressEffects } from './lib/motion.js';
import { registerSW } from './lib/notify.js';

initPressEffects();
registerSW();

// Điều khoản / Chính sách bảo mật: trang công khai, không cần đăng nhập
const legal = LEGAL_PATHS[location.pathname.replace(/\/+$/, '')];

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {legal ? <Legal page={legal} /> : <SessionProvider><App /></SessionProvider>}
  </React.StrictMode>,
);
