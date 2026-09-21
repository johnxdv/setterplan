import { columnTitle } from './columns.js'

// followUpAt est stocké au format de l'input natif (« 2026-09-25T14:30 ») :
// lisible par une machine, pas par un humain dans un tableur. On le rend en
// « 25/09/2026 14:30 ». Une valeur vide ou inattendue ressort telle quelle
// plutôt que de faire échouer l'export.
function formatFollowUp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '')
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : value || ''
}

// Colonnes du fichier exporté, dans l'ordre. `value` reçoit la carte.
const FIELDS = [
  { header: 'Nom', value: (c) => c.gerant },
  { header: 'Entreprise', value: (c) => c.company },
  { header: 'Téléphone', value: (c) => c.phone },
  { header: 'Ville', value: (c) => c.ville },
  { header: 'Catégorie', value: (c) => columnTitle(c.column) },
  { header: 'Appelé', value: (c) => (c.called ? 'Oui' : 'Non') },
  { header: 'Date de relance', value: (c) => formatFollowUp(c.followUpAt) },
  { header: 'Note', value: (c) => c.note },
]

// Échappement CSV standard : on entoure de guillemets dès qu'un séparateur,
// un guillemet ou un retour ligne est présent (les notes en contiennent
// souvent), en doublant les guillemets internes.
function escapeCell(raw) {
  const value = raw == null ? '' : String(raw)
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function contactsToCsv(cards) {
  const lines = [FIELDS.map((f) => f.header).join(',')]
  for (const card of cards) {
    lines.push(FIELDS.map((f) => escapeCell(f.value(card))).join(','))
  }
  return lines.join('\r\n')
}

const pad = (n) => String(n).padStart(2, '0')

export function exportFileName(spaceName, now = new Date()) {
  const slug = spaceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `contacts-${slug || 'espace'}-${stamp}.csv`
}

// Téléchargement côté navigateur. Le BOM UTF-8 en tête évite qu'Excel affiche
// « GÃ©rant » à l'ouverture du fichier.
export function downloadContactsCsv(cards, spaceName) {
  const blob = new Blob(['\ufeff' + contactsToCsv(cards)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(spaceName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
