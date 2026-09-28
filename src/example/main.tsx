import React from 'react';
import ReactDOM from 'react-dom/client';
import { GuidedExample } from './GuidedExample';
import '../styles.css';
import '../features/access/review.css';
import '../layout/AtlasShell.css';
import './example.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GuidedExample />
  </React.StrictMode>,
);
