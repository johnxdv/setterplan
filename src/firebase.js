import { initializeApp } from 'firebase/app'
import {
  doc,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { getSpace } from './spaces.js'

const firebaseConfig = {
  apiKey: "AIzaSyDZ3OxXS0M9fz7M6D8Mx9O8f87rv8bOUjE",
  authDomain: "setterplan.firebaseapp.com",
  projectId: "setterplan",
  storageBucket: "setterplan.firebasestorage.app",
  messagingSenderId: "661568680199",
  appId: "1:661568680199:web:38d21a2e161cf4ff2c55a2"
}

const app = initializeApp(firebaseConfig)

// Cache persistant multi-onglets : le tableau reste consultable hors ligne et
// les écritures faites sans réseau sont rejouées au retour de la connexion.
let firestore
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch {
  firestore = getFirestore(app)
}

export const db = firestore

// Un document par espace : board/victor, board/alice, board/jeyson. Chaque
// document porte l'état complet du tableau de CE setter uniquement.
//
// Le chemin est dérivé de l'id d'espace et l'id est validé contre le registre
// SPACES : une action déclenchée dans l'espace d'Alice ne peut pas, même par
// erreur de programmation, viser le document de Victor ou de Jeyson.
export function boardRefFor(spaceId) {
  if (!getSpace(spaceId)) throw new Error(`Espace inconnu : ${spaceId}`)
  return doc(db, 'board', spaceId)
}

// Ancien document unique, d'avant les espaces. Conservé intact après la
// migration vers board/victor : c'est le filet de sécurité qui permet de
// revenir en arrière (voir scripts/migrate-victor.mjs).
export const LEGACY_BOARD_ID = 'current'
