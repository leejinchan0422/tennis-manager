import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from './lib/pwa';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 한 번 열어두면 다음부터는 인터넷 없이도 열립니다. (배포본에서만 동작)
registerSW();
