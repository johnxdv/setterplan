// Registre des espaces de travail. Chaque espace est un tableau kanban
// totalement indépendant : ses contacts vivent dans son propre document
// Firestore (board/<id>), jamais partagé avec un autre espace.
//
// Ajouter un 4e setter = ajouter une ligne ici, rien d'autre. Ne jamais
// changer l'`id` d'un espace existant : c'est la clé de son document
// Firestore, donc de ses données.
export const SPACES = [
  { id: 'victor', name: 'Victor' },
  { id: 'alice', name: 'Alice' },
  { id: 'jeyson', name: 'Jeyson' },
]

export const getSpace = (id) => SPACES.find((s) => s.id === id) || null

// L'espace de Victor reprend les données de l'ancien tableau unique
// (board/current). Tant que scripts/migrate-victor.mjs n'a pas été lancé, son
// document n'existe pas : le tableau l'annonce explicitement au lieu de
// s'afficher vide, pour qu'on ne croie pas les contacts perdus.
export const LEGACY_SPACE_ID = 'victor'
