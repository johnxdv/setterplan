import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PasswordGate from './PasswordGate.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PasswordGate>
      <App />
    </PasswordGate>
  </React.StrictMode>
)
