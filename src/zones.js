// Découpage Sud / Nord des villes du fichier de prospection.
//
// La zone d'une ville est déduite de son DÉPARTEMENT (les deux premiers
// chiffres du code postal), jamais d'une liste de noms de villes : ajouter une
// ville à une liste existante ne demande donc aucune modification ici.
//
// Pour changer le découpage, il suffit de modifier SUD_DEPARTMENTS ci-dessous.
// Tout le reste (écran de choix, filtre des villes) s'y adapte.
export const SUD_DEPARTMENTS = new Set([
  '04', // Alpes-de-Haute-Provence
  '05', // Hautes-Alpes
  '06', // Alpes-Maritimes
  '11', // Aude
  '13', // Bouches-du-Rhône
  '20', '2A', '2B', // Corse (les codes postaux corses commencent par 20)
  '30', // Gard
  '34', // Hérault
  '66', // Pyrénées-Orientales
  '83', // Var
  '84', // Vaucluse
])

// Tout département hors de SUD_DEPARTMENTS est « Nord » : aucune ville connue
// ne peut se retrouver sans zone du fait d'un oubli dans une liste.
export const ZONES = [
  { id: 'sud', label: 'Sud', hint: 'French Riviera, Marseille → Menton' },
  { id: 'nord', label: 'Nord', hint: 'Lorraine : Metz, Nancy, Thionville…' },
]

export const ALL_ZONES = 'all'
export const UNKNOWN_ZONE_LABEL = 'zone non déterminée'

export const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label || ''

// Un code postal français : 5 chiffres. On accepte aussi la forme 2A/2B suivie
// de 3 chiffres, parfois saisie pour la Corse.
const POSTAL_CODE = /\b(\d{5}|2[AB]\d{3})\b/gi

// Département trouvé dans un texte libre (nom de ville ou adresse). Renvoie
// null si aucun code postal exploitable n'y figure.
export function departmentFrom(text) {
  if (!text) return null
  const matches = String(text).match(POSTAL_CODE)
  if (!matches) return null
  return matches[0].slice(0, 2).toUpperCase()
}

export function zoneForDepartment(department) {
  if (!department) return null
  return SUD_DEPARTMENTS.has(department) ? 'sud' : 'nord'
}

// Zone de chaque ville de l'espace, déduite du premier code postal trouvé dans
// le nom de la ville puis dans l'adresse d'un de ses contacts. Une ville sans
// code postal exploitable vaut null : elle n'est pas cachée, elle apparaît dans
// les deux zones (voir cityInZone) avec le libellé « zone non déterminée ».
//
// Les contacts sans ville ne figurent pas dans la table : ils sont traités
// comme une zone non déterminée eux aussi, donc visibles partout.
export function buildCityZones(cards) {
  const zones = new Map()
  for (const card of cards) {
    const city = (card.ville || '').trim()
    if (!city) continue
    if (zones.get(city)) continue // zone déjà déterminée pour cette ville
    const department = departmentFrom(city) || departmentFrom(card.address)
    zones.set(city, zoneForDepartment(department))
  }
  return zones
}

// Règle d'affichage : « Toutes les villes » ne filtre rien, une zone garde ses
// villes ET celles dont la zone est indéterminée, pour qu'aucun contact ne
// disparaisse de l'outil.
export function cityInZone(cityZone, zone) {
  if (!zone || zone === ALL_ZONES) return true
  return cityZone == null || cityZone === zone
}

// Zone d'un contact : celle de sa ville. Un contact sans ville (ou dont la
// ville n'a pas de code postal) est indéterminé, donc visible dans les deux
// zones.
export function cardInZone(card, cityZones, zone) {
  if (!zone || zone === ALL_ZONES) return true
  const city = (card.ville || '').trim()
  if (!city) return true
  return cityInZone(cityZones.get(city) ?? null, zone)
}

// Compteurs affichés sur les boutons de l'écran de choix : nombre de villes et
// de contacts visibles dans chaque zone (les indéterminés comptent des deux
// côtés, comme ils s'affichent des deux côtés).
export function zoneCounts(cards, cityZones) {
  const counts = {
    sud: { cities: 0, contacts: 0 },
    nord: { cities: 0, contacts: 0 },
    [ALL_ZONES]: { cities: cityZones.size, contacts: cards.length },
    unknownCities: 0,
  }
  for (const [, cityZone] of cityZones) {
    if (cityZone == null) {
      counts.unknownCities++
      counts.sud.cities++
      counts.nord.cities++
    } else counts[cityZone].cities++
  }
  for (const card of cards) {
    if (cardInZone(card, cityZones, 'sud')) counts.sud.contacts++
    if (cardInZone(card, cityZones, 'nord')) counts.nord.contacts++
  }
  return counts
}
