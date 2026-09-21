import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Doit rester identique à PASSWORD_SALT dans src/PasswordGate.jsx.
const PASSWORD_SALT = 'setterplan:'

export default defineConfig(({ mode }) => {
  // APP_PASSWORD vient des variables d'environnement Vercel en production, ou
  // d'un fichier .env.local (non versionné) en local. Seule son empreinte
  // SHA-256 est injectée dans le bundle : le mot de passe en clair n'apparaît
  // ni dans le dépôt ni dans le JavaScript servi au navigateur.
  const password = process.env.APP_PASSWORD || loadEnv(mode, process.cwd(), '').APP_PASSWORD
  if (!password) {
    throw new Error(
      "APP_PASSWORD n'est pas défini. Ajoutez-le dans Vercel (Settings > Environment Variables) " +
        'ou, en local, dans un fichier .env.local : APP_PASSWORD=...'
    )
  }
  const hash = createHash('sha256').update(PASSWORD_SALT + password).digest('hex')

  return {
    plugins: [react()],
    define: { __APP_PASSWORD_HASH__: JSON.stringify(hash) },
  }
})
