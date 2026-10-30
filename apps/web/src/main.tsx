import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/theme-provider';
import { QueryProvider } from './lib/query-client';
import { EventoraClerkProvider } from './lib/auth';
import './styles/tokens.css';

// Dev mode accessibility audit via axe-core
if (import.meta.env.DEV && typeof window !== 'undefined') {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000);
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="light" storageKey="eventora-theme">
        <QueryProvider>
          <EventoraClerkProvider>
            <App />
          </EventoraClerkProvider>
        </QueryProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
