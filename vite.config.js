import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Doit rester identique à PASSWORD_SALT dans src/PasswordGate.jsx.
const PASSWORD_SALT = 'setterplan:'

export default defineConfig(({ mode }) => {
  // Les mots de passe viennent des variables d'environnement Vercel en
  // production, ou d'un fichier .env.local (non versionné) en local. Seules
  // leurs empreintes SHA-256 sont injectées dans le bundle : aucun mot de
  // passe en clair dans le dépôt ni dans le JavaScript servi au navigateur.
  const env = loadEnv(mode, process.cwd(), '')

  // Deux mots de passe : APP_PASSWORD ouvre l'outil, CLOSING_PASSWORD ouvre
  // en plus l'espace Closing. Même mécanisme, même sel. L'absence de l'un ou
  // de l'autre fait échouer le build : mieux vaut un déploiement qui s'arrête
  // qu'un espace laissé ouvert ou verrouillé sans mot de passe valide.
  function hashOf(name) {
    const password = process.env[name] || env[name]
    if (!password) {
      throw new Error(
        `${name} n'est pas défini. Ajoutez-le dans Vercel (Settings > Environment Variables) ` +
          `ou, en local, dans un fichier .env.local : ${name}=...`
      )
    }
    return createHash('sha256').update(PASSWORD_SALT + password).digest('hex')
  }

  return {
    plugins: [react()],
    // Port imposé par l'outil qui lance le serveur de dev, s'il en fournit un.
    server: process.env.PORT ? { port: Number(process.env.PORT) } : {},
    define: {
      __APP_PASSWORD_HASH__: JSON.stringify(hashOf('APP_PASSWORD')),
      __CLOSING_PASSWORD_HASH__: JSON.stringify(hashOf('CLOSING_PASSWORD')),
    },
  }
})
