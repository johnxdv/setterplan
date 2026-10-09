import { useState } from 'react'

// Écran de mot de passe, utilisé à deux endroits : devant tout l'outil
// (mot de passe partagé) et devant l'espace Closing (mot de passe propre).
// C'est un simple frein, pas une protection : la vérification se fait dans
// le navigateur et les règles Firestore restent ouvertes.
//
// __APP_PASSWORD_HASH__ et __CLOSING_PASSWORD_HASH__ sont injectés au build
// par vite.config.js à partir de APP_PASSWORD et CLOSING_PASSWORD. Seules
// leurs empreintes entrent dans le bundle : aucun mot de passe en clair dans
// le dépôt ni dans le JavaScript servi au navigateur.
const PASSWORD_SALT = 'setterplan:' // doit rester identique à vite.config.js

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// sessionStorage : l'accès tient pour l'onglet jusqu'à sa fermeture. On y
// garde l'empreinte elle-même, donc changer le mot de passe le redemande à
// tout le monde au déploiement suivant.
function isUnlocked(storageKey, hash) {
  try {
    return sessionStorage.getItem(storageKey) === hash
  } catch {
    return false
  }
}

export default function PasswordGate({ hash, storageKey, sub, onCancel, children }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked(storageKey, hash))
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
      if ((await sha256Hex(PASSWORD_SALT + password)) === hash) {
        try { sessionStorage.setItem(storageKey, hash) } catch { /* navigation privée */ }
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
        <p className="menu-sub">{sub}</p>
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
        {onCancel && (
          <button type="button" className="btn ghost gate-cancel" onClick={onCancel}>
            Retour au menu
          </button>
        )}
      </form>
    </div>
  )
}
