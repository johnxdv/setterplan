// Parseur CSV minimal : gère les guillemets, les retours ligne dans les champs,
// le séparateur , ou ; (détecté sur la ligne d'en-tête) et le BOM.

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  let inQuotes = false
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',')
}

function parseRows(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === delimiter) { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  row.push(field)
  rows.push(row)

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// Colonnes attendues du CSV « setter » (reconnaissance exacte du libellé, en
// tête de liste) avec un repli sur des libellés génériques si un futur import
// utilise d'autres intitulés.
const COMPANY_KEYS = [
  'companynameforemails',
  'nom', 'nomcomplet', 'nomprenom', 'name', 'fullname', 'contact', 'prenomnom',
  'client', 'entreprise', 'societe', 'company', 'organisation', 'organization',
  'boite', 'enseigne',
]
const GERANT_KEYS = ['gerant', 'dirigeant', 'manager', 'responsable']
const PHONE_KEYS = [
  'companyphone',
  'telephone', 'tel', 'phone', 'mobile', 'portable', 'numero',
  'numerodetelephone', 'gsm', 'telephone1',
]
const ADDRESS_KEYS = ['companyaddress', 'adresse', 'address']
const VILLE_KEYS = ['ville', 'city', 'town', 'localite', 'commune']
const WEBSITE_KEYS = ['website', 'site', 'siteweb', 'url', 'domaine']

// Cherche, parmi les en-têtes pas encore utilisés, une correspondance exacte
// d'abord (le libellé normalisé égale une des clés), puis partielle.
function matchColumn(headers, keys, used) {
  const exact = headers.findIndex((h, i) => !used.has(i) && keys.includes(h.norm))
  if (exact !== -1) return exact
  return headers.findIndex((h, i) => !used.has(i) && keys.some((k) => h.norm.includes(k)))
}

let counter = 0
export const newId = () => `c${Date.now().toString(36)}-${(counter++).toString(36)}`

export function parseContacts(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(clean)
  const rows = parseRows(clean, delimiter)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => ({ label: h.trim(), norm: normalize(h) }))

  const used = new Set()
  function claim(keys) {
    const idx = matchColumn(headers, keys, used)
    if (idx !== -1) used.add(idx)
    return idx
  }

  const companyIdx = claim(COMPANY_KEYS)
  const gerantIdx = claim(GERANT_KEYS)
  const phoneIdx = claim(PHONE_KEYS)
  const addressIdx = claim(ADDRESS_KEYS)
  const villeIdx = claim(VILLE_KEYS)
  const websiteIdx = claim(WEBSITE_KEYS)

  return rows.slice(1).map((cells) => {
    const at = (i) => (i === -1 ? '' : (cells[i] || '').trim())
    const extras = headers
      .map((h, i) => ({ label: h.label || `Colonne ${i + 1}`, value: (cells[i] || '').trim() }))
      .filter((f, i) => !used.has(i) && f.value !== '')

    return {
      id: newId(),
      company: at(companyIdx) || 'Sans nom',
      gerant: at(gerantIdx),
      phone: at(phoneIdx),
      address: at(addressIdx),
      ville: at(villeIdx),
      website: at(websiteIdx),
      extras,
      note: '',
      starred: false,
      called: false,
      followUpAt: '',
      column: 'todo',
    }
  })
}
