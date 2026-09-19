// Restaure le tableau d'un espace à partir d'une sauvegarde JSON produite par
// scripts/migrate-victor.mjs (ou d'un export brut de l'API REST Firestore).
//
//   node scripts/restore-board.mjs victor backups/board-current-....json
//   node scripts/restore-board.mjs victor backups/....json --apply
//
// Sans --apply, le script se contente d'afficher ce qu'il ferait.
import { readFileSync } from 'node:fs'
import { getDocument, setDocument, cardsOf } from './firestore-rest.mjs'

const [spaceId, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const apply = process.argv.includes('--apply')

if (!spaceId || !file) {
  console.error('Usage : node scripts/restore-board.mjs <espace> <sauvegarde.json> [--apply]')
  process.exit(1)
}

const backup = JSON.parse(readFileSync(file, 'utf8'))
if (!backup.fields?.cards) {
  console.error(`${file} ne ressemble pas à une sauvegarde de tableau (champ "cards" absent).`)
  process.exit(1)
}

const path = `board/${spaceId}`
const backupCards = cardsOf(backup)
const current = await getDocument(path)
const currentCards = cardsOf(current)

console.log(`Sauvegarde : ${backupCards.length} contacts (${file})`)
console.log(`Cible ${path} : ${currentCards.length} contacts actuellement`)

if (!apply) {
  console.log(`\n(simulation) ${path} serait remplacé par les ${backupCards.length} contacts de la sauvegarde.`)
  console.log('Relancez avec --apply pour exécuter.')
  process.exit(0)
}

await setDocument(path, backup.fields)
const after = cardsOf(await getDocument(path))
if (after.length !== backupCards.length) {
  console.error(`✗ ${after.length} contacts après restauration, ${backupCards.length} attendus.`)
  process.exit(1)
}
console.log(`✓ ${path} restauré : ${after.length} contacts.`)
