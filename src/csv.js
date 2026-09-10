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

const NAME_KEYS = ['nom', 'nomcomplet', 'nomprenom', 'name', 'fullname', 'contact', 'prenomnom', 'client']
const PHONE_KEYS = ['telephone', 'tel', 'phone', 'mobile', 'portable', 'numero', 'numerodetelephone', 'gsm', 'telephone1']
const COMPANY_KEYS = ['entreprise', 'societe', 'company', 'organisation', 'organization', 'boite', 'enseigne']
const EMAIL_KEYS = ['email', 'mail', 'courriel', 'adressemail']

function matchColumn(headers, keys) {
  // correspondance exacte d'abord, puis partielle
  const exact = headers.findIndex((h) => keys.includes(h.norm))
  if (exact !== -1) return exact
  return headers.findIndex((h) => keys.some((k) => h.norm.includes(k)))
}

let counter = 0
const newId = () => `c${Date.now().toString(36)}-${(counter++).toString(36)}`

export function parseContacts(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(clean)
  const rows = parseRows(clean, delimiter)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => ({ label: h.trim(), norm: normalize(h) }))
  const nameIdx = matchColumn(headers, NAME_KEYS)
  const phoneIdx = matchColumn(headers, PHONE_KEYS)
  const companyIdx = matchColumn(headers, COMPANY_KEYS)
  const emailIdx = matchColumn(headers, EMAIL_KEYS)
  const usedIdx = new Set([nameIdx, phoneIdx, companyIdx, emailIdx].filter((i) => i !== -1))

  return rows.slice(1).map((cells) => {
    const at = (i) => (i === -1 ? '' : (cells[i] || '').trim())
    const extras = headers
      .map((h, i) => ({ label: h.label || `Colonne ${i + 1}`, value: (cells[i] || '').trim() }))
      .filter((f, i) => !usedIdx.has(i) && f.value !== '')

    return {
      id: newId(),
      name: at(nameIdx) || at(companyIdx) || 'Sans nom',
      phone: at(phoneIdx),
      company: at(companyIdx),
      email: at(emailIdx),
      extras,
      followUpAt: '',
      column: 'todo',
    }
  })
}
