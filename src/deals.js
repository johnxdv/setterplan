// Modèle d'un deal de closing : ce qui suit un premier rendez-vous jusqu'à la
// signature. Tout ce qui se règle (listes fixes, coefficients) est ici, en
// constantes, pour n'avoir qu'un seul endroit à modifier.

// Les personnes de l'équipe. Un setter ou un closer est toujours l'une
// d'elles, ou UNASSIGNED : jamais un texte libre, pour éviter « Benjamin » /
// « benjamin » / « Ben » qui casseraient les statistiques par closer.
export const UNASSIGNED = 'Non attribué'
export const PEOPLE = ['Victor', 'Alice', 'Jeyson', 'Nadège', 'Benjamin', 'Armen']
export const ASSIGNEES = [UNASSIGNED, ...PEOPLE]

// Étiquette d'état : où en est concrètement le deal. Liste fixe.
export const DEAL_STATES = [
  'Appel à faire',
  'Mail à envoyer',
  'En attente de réponse',
  'Devis envoyé',
  'RDV prévu',
  'Passage en agence',
]
export const DEFAULT_STATE = DEAL_STATES[0]

// Statut : un deal en cours est dans le calendrier, un deal signé ou perdu
// en sort définitivement (voir l'onglet « Signés et perdus »).
export const STATUS_OPEN = 'open'
export const STATUS_WON = 'won'
export const STATUS_LOST = 'lost'
export const STATUSES = [
  { id: STATUS_OPEN, label: 'En cours' },
  { id: STATUS_WON, label: 'Signé' },
  { id: STATUS_LOST, label: 'Perdu' },
]
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id

export const LOSS_REASONS = ['prix', 'timing', 'pas convaincu', 'injoignable', 'autre']

// Chaleur du deal + coefficient de pondération du pipe. CHANGER UN
// COEFFICIENT ICI suffit : le bandeau de chiffres s'y adapte.
export const HEATS = [
  { id: 'froid', label: 'Froid', weight: 0.1 },
  { id: 'tiede', label: 'Tiède', weight: 0.25 },
  { id: 'chaud', label: 'Chaud', weight: 0.5 },
  { id: 'fire', label: 'Fire', weight: 0.8 },
]
export const DEFAULT_HEAT = 'tiede'
export const heatLabel = (id) => HEATS.find((h) => h.id === id)?.label || id
export const heatWeight = (id) => HEATS.find((h) => h.id === id)?.weight ?? 0

// ---------------------------------------------------------------------------
// Dates. Tout est stocké en texte local « AAAA-MM-JJ » (+ « HH:MM » à part) :
// pas de fuseau horaire à gérer, la date affichée est celle qui a été saisie.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')

export const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export function fromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export const todayIso = () => toIso(new Date())

export function addDays(iso, days) {
  const d = fromIso(iso)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  return toIso(d)
}

// Lundi de la semaine qui contient `iso` (semaine française : lundi → dimanche).
export function startOfWeek(iso) {
  const d = fromIso(iso)
  if (!d) return ''
  const shift = (d.getDay() + 6) % 7 // dimanche (0) → 6
  d.setDate(d.getDate() - shift)
  return toIso(d)
}

// Nombre de jours entiers de `from` à `to` (négatif si `to` est avant).
export function daysBetween(from, to) {
  const a = fromIso(from)
  const b = fromIso(to)
  if (!a || !b) return 0
  return Math.round((b - a) / 86400000)
}

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function formatDate(iso) {
  const d = fromIso(iso)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''
}

export function dayName(iso) {
  const d = fromIso(iso)
  return d ? DAY_NAMES[d.getDay()] : ''
}

export function dayNumber(iso) {
  const d = fromIso(iso)
  return d ? d.getDate() : ''
}

export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '')
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : key
}

export const monthKey = (iso) => (iso || '').slice(0, 7)

// Lundi prochain : toujours dans le futur, jamais aujourd'hui même un lundi.
export function nextMonday(iso) {
  const d = fromIso(iso)
  if (!d) return ''
  const shift = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + shift)
  return toIso(d)
}

export const isWeekend = (iso) => {
  const d = fromIso(iso)
  return d ? d.getDay() === 0 || d.getDay() === 6 : false
}

// ---------------------------------------------------------------------------
// Montants
// ---------------------------------------------------------------------------
const toAmount = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

// Total de l'offre. `amountTotal` non nul l'emporte sur la somme des lignes :
// c'est le cas d'une offre « package » négociée à un prix global différent de
// l'addition (L'Or Immo). Le détail des lignes reste visible dans la fiche.
export function dealTotal(deal) {
  if (typeof deal.amountTotal === 'number' && Number.isFinite(deal.amountTotal) && deal.amountTotal > 0) {
    return deal.amountTotal
  }
  return toAmount(deal.amountSoftware) + toAmount(deal.amountSite) + toAmount(deal.amountOptions)
}

export const dealLinesTotal = (deal) =>
  toAmount(deal.amountSoftware) + toAmount(deal.amountSite) + toAmount(deal.amountOptions)

export const weightedValue = (deal) => dealTotal(deal) * heatWeight(deal.heat)

export function formatEuros(amount) {
  const n = Math.round(toAmount(amount))
  return `${n.toLocaleString('fr-FR')} €`
}

// ---------------------------------------------------------------------------
// Fiche
// ---------------------------------------------------------------------------
let counter = 0
export const newDealId = () => `d${Date.now().toString(36)}-${(counter++).toString(36)}`

export function historyEntry(author, note) {
  return { at: new Date().toISOString(), author: author || UNASSIGNED, note }
}

// Un deal complet, champs par défaut compris : tout le reste du code peut
// donc lire deal.history, deal.amountSite… sans vérifier leur existence.
export function makeDeal(partial = {}) {
  return {
    id: newDealId(),
    agence: '',
    ville: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    setter: UNASSIGNED,
    closer: UNASSIGNED,
    state: DEFAULT_STATE,
    status: STATUS_OPEN,
    lossReason: '',
    heat: DEFAULT_HEAT,
    amountSoftware: 0,
    amountSite: 0,
    amountOptions: 0,
    amountTotal: null, // null = total calculé à partir des trois lignes
    commission: 0,
    nextActionLabel: '',
    nextActionDate: '',
    nextActionTime: '',
    closedAt: '',
    firstMeetingAt: '',
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}

const str = (v) => (typeof v === 'string' ? v : '')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Tout ce qui remonte de Firestore passe par ici : un document incomplet ou
// abîmé donne une fiche utilisable plutôt qu'un écran blanc.
export function sanitizeDeal(raw, id) {
  if (!raw || typeof raw !== 'object') return null
  const status = [STATUS_OPEN, STATUS_WON, STATUS_LOST].includes(raw.status) ? raw.status : STATUS_OPEN
  return {
    ...makeDeal(),
    id: id || str(raw.id) || newDealId(),
    agence: str(raw.agence) || 'Sans nom',
    ville: str(raw.ville),
    contactName: str(raw.contactName),
    contactPhone: str(raw.contactPhone),
    contactEmail: str(raw.contactEmail),
    setter: ASSIGNEES.includes(raw.setter) ? raw.setter : UNASSIGNED,
    closer: ASSIGNEES.includes(raw.closer) ? raw.closer : UNASSIGNED,
    state: DEAL_STATES.includes(raw.state) ? raw.state : DEFAULT_STATE,
    status,
    lossReason: LOSS_REASONS.includes(raw.lossReason) ? raw.lossReason : '',
    heat: HEATS.some((h) => h.id === raw.heat) ? raw.heat : DEFAULT_HEAT,
    amountSoftware: num(raw.amountSoftware),
    amountSite: num(raw.amountSite),
    amountOptions: num(raw.amountOptions),
    amountTotal: typeof raw.amountTotal === 'number' && Number.isFinite(raw.amountTotal) ? raw.amountTotal : null,
    commission: num(raw.commission),
    nextActionLabel: str(raw.nextActionLabel),
    nextActionDate: fromIso(raw.nextActionDate) ? raw.nextActionDate : '',
    nextActionTime: /^\d{2}:\d{2}$/.test(raw.nextActionTime) ? raw.nextActionTime : '',
    closedAt: fromIso(raw.closedAt) ? raw.closedAt : '',
    firstMeetingAt: fromIso(raw.firstMeetingAt) ? raw.firstMeetingAt : '',
    history: Array.isArray(raw.history)
      ? raw.history
          .filter((h) => h && typeof h === 'object')
          .map((h) => ({ at: str(h.at), author: str(h.author) || UNASSIGNED, note: str(h.note) }))
      : [],
    createdAt: num(raw.createdAt) || Date.now(),
    updatedAt: num(raw.updatedAt) || Date.now(),
  }
}

export const isOpen = (deal) => deal.status === STATUS_OPEN
export const isLate = (deal, today) => isOpen(deal) && deal.nextActionDate !== '' && deal.nextActionDate < today
export const isUnplanned = (deal) => isOpen(deal) && deal.nextActionDate === ''

// Bandeau de chiffres du haut.
export function pipelineStats(deals, today) {
  const open = deals.filter(isOpen)
  const month = monthKey(today)
  return {
    openCount: open.length,
    pipe: open.reduce((sum, d) => sum + dealTotal(d), 0),
    weighted: open.reduce((sum, d) => sum + weightedValue(d), 0),
    signedThisMonth: deals
      .filter((d) => d.status === STATUS_WON && monthKey(d.closedAt) === month)
      .reduce((sum, d) => sum + dealTotal(d), 0),
    lateCount: open.filter((d) => isLate(d, today)).length,
  }
}
