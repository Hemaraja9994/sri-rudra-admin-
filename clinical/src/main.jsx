import React from 'react';
import { createRoot } from 'react-dom/client';

// The portal's own stylesheet first, then the shared new theme, then the clinical pages' extras.
import './styles/portal-base.css';
import '../../static/__srr/theme.css';
import './styles/clinical.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
