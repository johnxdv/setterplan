// Petit client REST Firestore, sans dépendance : les scripts de migration
// doivent pouvoir tourner même si node_modules n'est pas installé, et le SDK
// web (cache persistant) ne fonctionne pas sous Node.
//
// La clé et le projet sont ceux du fichier src/firebase.js : ce sont des
// identifiants publics côté client, l'accès est gouverné par firestore.rules.
export const PROJECT_ID = 'setterplan'
export const API_KEY = 'AIzaSyDZ3OxXS0M9fz7M6D8Mx9O8f87rv8bOUjE'

const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

function restError(verb, path, status, body) {
  const err = new Error(`${verb} ${path} → ${status} ${body?.error?.message || JSON.stringify(body)}`)
  err.status = status
  return err
}

export async function getDocument(path) {
  const res = await fetch(`${base}/${path}?key=${API_KEY}`)
  if (res.status === 404) return null
  const body = await res.json()
  if (!res.ok) throw restError('GET', path, res.status, body)
  return body
}

// PATCH sans updateMask remplace l'intégralité du document.
export async function setDocument(path, fields) {
  const res = await fetch(`${base}/${path}?key=${API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  const body = await res.json()
  if (!res.ok) throw restError('PATCH', path, res.status, body)
  return body
}

// Convertit la représentation typée de l'API REST en valeur JS ordinaire,
// pour pouvoir comparer deux documents champ à champ.
export function fromRest(value) {
  if (value == null) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromRest)
  if ('mapValue' in value) {
    const out = {}
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = fromRest(v)
    return out
  }
  throw new Error(`Type Firestore non géré : ${JSON.stringify(value)}`)
}

export const cardsOf = (doc) => (doc?.fields?.cards ? fromRest(doc.fields.cards) : [])
