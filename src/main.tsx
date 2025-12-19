import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { DemoStoreProvider } from './shared/state/demoStore';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoStoreProvider>
      <RouterProvider router={router} />
    </DemoStoreProvider>
  </React.StrictMode>,
);
