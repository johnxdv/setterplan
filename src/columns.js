// Colonnes fixes de droite : zones de dépôt permanentes. « À appeler » n'en
// fait pas partie : c'est une liste, pas une colonne (voir TodoList).
// Les id sont les clés internes (Firestore, filtrage) : ils ne changent pas
// même quand le libellé affiché (title) est renommé.
export const COLUMNS = [
  { id: 'urgent_48h', title: 'Rappel urgent -48h' },
  { id: 'followup', title: 'Rappel -7 jours' },
  { id: 'no_answer', title: 'Relance dans 1-3 mois' },
  { id: 'dead', title: 'Mort' },
  { id: 'booked', title: 'Rendez-vous booké' },
]

export const TODO_TITLE = 'À appeler'

// Seule colonne qui affiche le champ date/heure de relance : c'est là qu'on
// planifie le prochain appel. Changer cette constante déplace le champ.
export const FOLLOWUP_COLUMN_ID = 'followup'

export const COLUMN_IDS = new Set(['todo', ...COLUMNS.map((c) => c.id)])

// Libellé lisible d'une colonne, pour l'export CSV notamment.
export function columnTitle(id) {
  if (id === 'todo') return TODO_TITLE
  return COLUMNS.find((c) => c.id === id)?.title || id
}
