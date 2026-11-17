import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { CUSTOMER_DISPLAY_HASH } from './services/customerDisplay';

// Layar pelanggan (monitor kedua) dibuka sebagai jendela terpisah tanpa memuat/sinkron data toko.
const CustomerDisplay = lazy(() => import('./pages/CustomerDisplay'));
const isCustomerDisplay = window.location.hash === CUSTOMER_DISPLAY_HASH;

const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      {isCustomerDisplay
        ? <Suspense fallback={null}><CustomerDisplay /></Suspense>
        : <App />}
    </React.StrictMode>
  );
}
