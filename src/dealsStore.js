// Accès Firestore des deals de closing.
//
// Contrairement aux espaces setters (un document qui porte tout le tableau),
// chaque deal est SON PROPRE document dans la collection « deals » : deux
// closers qui modifient deux deals en même temps ne s'écrasent plus l'un
// l'autre, et l'historique d'une fiche ne peut pas être emporté par
// l'enregistrement d'une autre.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { sanitizeDeal } from './deals.js'

export const DEALS_COLLECTION = 'deals'
export const dealsCollection = () => collection(db, DEALS_COLLECTION)
export const dealRef = (id) => doc(db, DEALS_COLLECTION, id)

// Marqueur d'import : tant qu'il n'existe pas, les deals du Google Sheet
// n'ont jamais été écrits. Il garantit que l'import ne se rejoue pas à chaque
// ouverture — y compris si un deal importé a été supprimé depuis.
export const seedMarkerRef = () => doc(db, 'meta', 'closingSeed')

export function watchDeals(onChange, onError) {
  return onSnapshot(
    dealsCollection(),
    { includeMetadataChanges: true },
    (snap) => {
      const deals = []
      for (const d of snap.docs) {
        const deal = sanitizeDeal(d.data(), d.id)
        if (deal) deals.push(deal)
      }
      onChange(deals, snap.metadata.fromCache)
    },
    onError
  )
}

// Écriture d'UNE fiche : ne touche aucun autre document.
export function saveDeal(deal) {
  const next = { ...deal, updatedAt: Date.now() }
  return setDoc(dealRef(deal.id), next)
}

export const removeDeal = (id) => deleteDoc(dealRef(id))

// Import unique des deals existants. Renvoie le nombre de fiches écrites, ou
// -1 si l'import avait déjà été fait.
export async function seedDealsOnce(deals) {
  const marker = await getDoc(seedMarkerRef())
  if (marker.exists()) return -1
  const batch = writeBatch(db)
  for (const deal of deals) batch.set(dealRef(deal.id), deal)
  batch.set(seedMarkerRef(), { done: true, at: Date.now(), count: deals.length })
  await batch.commit()
  return deals.length
}

// Passage de relais setter → closing : la carte du setter n'est pas déplacée
// ni supprimée (voir Board), on crée à côté une fiche de deal pré-remplie.
export async function createDealFromCard(card, setterName) {
  const { PEOPLE, UNASSIGNED, dealAuthor, historyEntry, makeDeal, todayIso } = await import('./deals.js')
  const deal = makeDeal({
    agence: card.company || 'Sans nom',
    ville: card.ville || '',
    contactName: card.gerant || '',
    contactPhone: card.phone || '',
    setter: PEOPLE.includes(setterName) ? setterName : UNASSIGNED,
    state: 'RDV prévu',
    nextActionLabel: 'Préparer le rendez-vous',
    // Obligatoire pour un deal en cours : la fiche arrive donc dans « À faire
    // aujourd'hui », pas dans un angle mort.
    nextActionDate: todayIso(),
  })
  deal.history = [historyEntry(dealAuthor(deal), `Envoyé au closing depuis l'espace ${setterName}`)]
  await saveDeal(deal)
  return deal
}
