import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { DriversList } from '../../components/views/DriversList';
import '../../app/globals.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">Local test data — changes stay in this preview.</div>
  <Toaster /><DriversList />
</React.StrictMode>);
