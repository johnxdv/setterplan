import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PasswordGate from './PasswordGate.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PasswordGate
      hash={__APP_PASSWORD_HASH__}
      storageKey="setterplan-unlocked"
      sub="Entrez le mot de passe pour accéder aux espaces."
    >
      <App />
    </PasswordGate>
  </React.StrictMode>
)
