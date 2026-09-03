import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { DemoStoreProvider } from './shared/state/demoStore';
import { AuthProvider } from './shared/auth/AuthProvider';
import { FeatureFlagsProvider } from './shared/config/FeatureFlagsProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoStoreProvider>
      <AuthProvider>
        <FeatureFlagsProvider>
          <RouterProvider router={router} />
        </FeatureFlagsProvider>
      </AuthProvider>
    </DemoStoreProvider>
  </React.StrictMode>,
);
