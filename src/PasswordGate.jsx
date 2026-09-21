import { useState } from 'react'

// Écran de mot de passe partagé, avant le menu des espaces. C'est un simple
// frein, pas une protection : la vérification se fait dans le navigateur et
// les règles Firestore restent ouvertes.
//
// __APP_PASSWORD_HASH__ est injecté au build par vite.config.js à partir de
// APP_PASSWORD. Doit rester identique à PASSWORD_SALT dans vite.config.js.
const PASSWORD_SALT = 'setterplan:'
const STORAGE_KEY = 'setterplan-unlocked'

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// sessionStorage : l'accès tient pour l'onglet jusqu'à sa fermeture. On y
// garde l'empreinte elle-même, donc changer APP_PASSWORD redemande le mot de
// passe à tout le monde au déploiement suivant.
function isUnlocked() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === __APP_PASSWORD_HASH__
  } catch {
    return false
  }
}

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  if (unlocked) return children

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || checking) return
    setChecking(true)
    setError('')
    try {
      if ((await sha256Hex(PASSWORD_SALT + password)) === __APP_PASSWORD_HASH__) {
        try { sessionStorage.setItem(STORAGE_KEY, __APP_PASSWORD_HASH__) } catch { /* navigation privée */ }
        setUnlocked(true)
        return
      }
      setError('Mot de passe incorrect.')
      setPassword('')
    } catch {
      setError('Vérification impossible dans ce navigateur.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="menu">
      <header className="menu-header">
        <h1>Planning d'appel</h1>
        <p className="menu-sub">Entrez le mot de passe pour accéder aux espaces.</p>
      </header>
      <form className="gate-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="gate-password">Mot de passe</label>
          <input
            id="gate-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            autoFocus
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'gate-error' : undefined}
          />
        </div>
        {error && <p id="gate-error" className="error gate-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary gate-submit" disabled={!password || checking}>
          Entrer
        </button>
      </form>
    </div>
  )
}
