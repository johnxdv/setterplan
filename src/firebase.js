import { initializeApp } from 'firebase/app'
import {
  doc,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

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

// Un seul document porte l'état complet du tableau.
export const boardRef = doc(db, 'board', 'current')
