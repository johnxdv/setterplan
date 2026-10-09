// Reprise unique du Google Sheet « SUIVI DEAL », état du vendredi 9 octobre
// 2026. Écrit une seule fois (voir seedDealsOnce) : ensuite, ces fiches
// vivent dans Firestore et ce fichier n'est plus qu'une trace de l'origine.
//
// Les id sont fixes et lisibles : réimporter ne créerait pas de doublons, et
// on retrouve une fiche dans la console Firebase sans la chercher.
import { STATUS_LOST, STATUS_OPEN, STATUS_WON, UNASSIGNED, makeDeal } from './deals.js'

export const SEED_SOURCE = 'Importé depuis le Google Sheet SUIVI DEAL'

// agence, closer, state, heat, montants, date de prochaine action, note.
// La note du Sheet devient la prochaine action : c'est ce qu'il reste à faire.
// La date est obligatoire pour un deal en cours : les lignes « à planifier »
// du Sheet sont datées du jour de la reprise.
const OPEN_DEALS = [
  ['hp-properties', 'HP Properties', 'Benjamin', 'Passage en agence', 'tiede',
    { amountSoftware: 7900 }, '2026-10-09', '', 'Passer en agence début janvier'],
  ['barnes', 'Barnes', UNASSIGNED, 'Appel à faire', 'tiede',
    { amountSoftware: 8900 }, '2026-10-03', '', 'Envoyer un vocal, proposer un 2e RDV si besoin'],
  ['nesta-immobilier', 'Nesta Immobilier', 'Alice', 'Appel à faire', 'tiede',
    { amountSoftware: 3900, amountSite: 1900 }, '2026-09-28', '',
    'Intérêt estimé à 60 %, fait le point avec son équipe ; utilise Apimo'],
  ['happy-home', 'Happy Home', 'Benjamin', 'Appel à faire', 'tiede',
    { amountSoftware: 3900 }, '2026-10-13', '14:00',
    'Intérêt estimé à 50 %, fixer une date de visio ; site à proposer'],
  ['lor-immo', "L'Or Immo", 'Alice', 'Devis envoyé', 'chaud',
    { amountSoftware: 4900, amountSite: 1900, amountTotal: 6500 }, '2026-09-29', '',
    'Intérêt estimé à 80 %, devis envoyé, relancer pour un RDV'],
  ['bgi-immobilier', 'BGI Immobilier', 'Alice', 'RDV prévu', 'chaud',
    { amountSoftware: 3900, amountSite: 1000 }, '2026-11-02', '',
    'Intérêt estimé à 70 %, RDV début novembre ; prospect sceptique après une mauvaise expérience passée, venir avec des preuves et des réponses aux objections'],
  ['buddys-immobilier', 'Buddys Immobilier', 'Benjamin', 'Appel à faire', 'tiede',
    {}, '2026-10-09', '', 'À rappeler au plus vite'],
  ['agence-des-cordeliers', 'Agence des Cordeliers', 'Armen', 'Appel à faire', 'tiede',
    { amountSoftware: 3900, amountSite: 1900 }, '2026-10-05', '', 'À rappeler en urgence'],
  ['destination-riviera', 'Destination Riviera', 'Nadège', 'Appel à faire', 'tiede',
    { amountSoftware: 4900 }, '2026-10-12', '', 'À rappeler en urgence (offre site + SEO)'],
  ['domaine-de-ludres', 'Domaine de Ludres', 'Alice', 'RDV prévu', 'tiede',
    {}, '2026-10-25', '', 'Rappeler pour déplacer le RDV au 30 octobre'],
  ['cabinet-ile-longeville', "Cabinet de l'Île Longeville", 'Alice', 'En attente de réponse', 'tiede',
    { amountSoftware: 3900, amountSite: 1900 }, '2026-10-13', '',
    'Liens envoyés par WhatsApp ; demande un paiement en plusieurs fois'],
  ['agence-du-sud-est', 'Agence du Sud-Est', 'Nadège', 'En attente de réponse', 'fire',
    { amountSoftware: 4900 }, '2026-10-12', '', 'Contre-offre à 4900, en attente de réponse'],
  ['immo-sens', 'Immo Sens', 'Benjamin', 'Appel à faire', 'tiede',
    { amountSoftware: 4900, amountOptions: 900 }, '2026-10-13', '',
    'Poser un 2e RDV (options : avis de valeur)'],
  ['sophime', 'Sophime', 'Benjamin', 'Mail à envoyer', 'tiede',
    { amountSoftware: 7900 }, '2026-10-16', '', 'Mail à envoyer puis relancer ; agence bien installée'],
  ['agence-du-ray', 'Agence du Ray', 'Benjamin', 'Mail à envoyer', 'tiede',
    { amountSoftware: 6900 }, '2026-10-13', '', 'Mail à envoyer, poser un RDV'],
  ['m-et-l-immo', 'M et L Immo', 'Benjamin', 'Devis envoyé', 'tiede',
    { amountSoftware: 3900, amountSite: 1900 }, '2026-10-14', '', 'Mail envoyé, poser un 2e RDV'],
  ['xl-immo', 'XL Immo', 'Benjamin', 'Devis envoyé', 'tiede',
    { amountSoftware: 3900, amountSite: 1900 }, '2026-10-16', '',
    'Mail envoyé, viser un RDV début novembre avec des preuves'],
  ['samir', 'Samir', UNASSIGNED, 'Appel à faire', 'tiede',
    {}, '2026-10-09', '', 'Agence à préciser, à rappeler'],
]

// agence, closer, statut, montants, date de clôture, motif de perte, note.
const CLOSED_DEALS = [
  ['proprio-access', 'Proprio Access', 'Alice', STATUS_WON,
    { amountTotal: 6800, commission: 300 }, '2026-09-30', '', 'Acompte reçu'],
  ['my-agenc-immo', 'My Agenc Immo', 'Victor', STATUS_LOST, {}, '', 'timing', ''],
  ['estate-service-basse-californie', 'Estate Service Basse Californie', 'Benjamin', STATUS_LOST,
    {}, '', 'autre', ''],
  ['majorelle-immo', 'Majorelle Immo', 'Nadège', STATUS_LOST, {}, '', 'autre', ''],
]

// Première ligne d'historique de chaque fiche importée. La date du premier
// rendez-vous n'est reprise que lorsqu'elle existe dans le Sheet : aucune des
// lignes reprises ici n'en portait, le champ reste donc vide.
function importEntry(deal) {
  const date = deal.firstMeetingAt ? ` — premier RDV le ${deal.firstMeetingAt}` : ''
  return { at: '2026-10-09T00:00:00.000Z', author: 'Import', note: `${SEED_SOURCE}${date}` }
}

export function buildSeedDeals() {
  const deals = []

  for (const [id, agence, closer, state, heat, amounts, date, time, note] of OPEN_DEALS) {
    const deal = makeDeal({
      id: `seed-${id}`,
      agence,
      closer,
      state,
      heat,
      status: STATUS_OPEN,
      nextActionLabel: note,
      nextActionDate: date,
      nextActionTime: time,
      createdAt: Date.parse('2026-10-09T00:00:00.000Z'),
      updatedAt: Date.parse('2026-10-09T00:00:00.000Z'),
      ...amounts,
    })
    deal.history = [importEntry(deal)]
    deals.push(deal)
  }

  for (const [id, agence, closer, status, amounts, closedAt, lossReason, note] of CLOSED_DEALS) {
    const deal = makeDeal({
      id: `seed-${id}`,
      agence,
      closer,
      status,
      lossReason,
      closedAt,
      nextActionLabel: note,
      createdAt: Date.parse('2026-10-09T00:00:00.000Z'),
      updatedAt: Date.parse('2026-10-09T00:00:00.000Z'),
      ...amounts,
    })
    deal.history = [importEntry(deal)]
    if (note) {
      deal.history.push({ at: '2026-10-09T00:00:01.000Z', author: 'Import', note })
    }
    deals.push(deal)
  }

  return deals
}
