import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import '@/styles/globals.css';
import { registerServiceWorker } from '@/register-sw';
import { UserModeProvider } from '@/features/ui/user-mode';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UserModeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </UserModeProvider>
  </React.StrictMode>
);

registerServiceWorker();
