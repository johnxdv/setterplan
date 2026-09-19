// Migration de l'ancien tableau unique (board/current) vers l'espace de
// Victor (board/victor).
//
//   node scripts/migrate-victor.mjs            # simulation, n'écrit rien
//   node scripts/migrate-victor.mjs --apply    # sauvegarde, copie, vérifie
//   node scripts/migrate-victor.mjs --apply --force   # écrase board/victor
//
// board/current n'est JAMAIS modifié ni supprimé : c'est le filet de sécurité.
// Pour revenir en arrière, il suffit de redéployer le code d'avant (qui lit
// board/current) ou de rejouer une sauvegarde avec scripts/restore-board.mjs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { getDocument, setDocument, cardsOf } from './firestore-rest.mjs'

const SOURCE = 'board/current'
const TARGET = 'board/victor'

const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

// Empreinte d'un contact : ce qui doit être strictement identique avant et
// après la migration (en particulier `column`, le classement de Victor).
const fingerprint = (c) =>
  JSON.stringify({
    id: c.id,
    column: c.column,
    company: c.company,
    phone: c.phone,
    note: c.note,
    starred: c.starred,
    followUpAt: c.followUpAt,
    classifiedAt: c.classifiedAt,
  })

const countByColumn = (cards) =>
  cards.reduce((acc, c) => ({ ...acc, [c.column]: (acc[c.column] || 0) + 1 }), {})

const source = await getDocument(SOURCE)
if (!source) fail(`${SOURCE} est introuvable — rien à migrer.`)

const sourceCards = cardsOf(source)
console.log(`Source ${SOURCE} : ${sourceCards.length} contacts`)
console.log('  par colonne :', countByColumn(sourceCards))

// 403 sur la cible = les règles Firestore déployées ne connaissent encore que
// board/current. C'est la première étape de la migration, pas un bug.
let existingTarget
try {
  existingTarget = await getDocument(TARGET)
} catch (err) {
  if (err.status === 403) {
    fail(
      `Firestore refuse l'accès à ${TARGET}.\n` +
        `  Les règles déployées n'autorisent encore que board/current.\n` +
        `  Déployez firestore.rules (Firebase > Firestore Database > Règles), puis relancez.`
    )
  }
  throw err
}
const existingCards = cardsOf(existingTarget)
if (existingCards.length > 0 && !force) {
  fail(
    `${TARGET} contient déjà ${existingCards.length} contacts. ` +
      `Relancez avec --force pour les écraser (après avoir vérifié que c'est bien voulu).`
  )
}

if (!apply) {
  console.log(`\n(simulation) ${sourceCards.length} contacts seraient copiés vers ${TARGET}.`)
  console.log('Relancez avec --apply pour exécuter la migration.')
  process.exit(0)
}

// 1. Sauvegarde locale de la source, avant toute écriture.
mkdirSync('backups', { recursive: true })
const backupFile = `backups/board-current-${stamp}.json`
writeFileSync(backupFile, JSON.stringify(source, null, 2))
console.log(`\n✓ Sauvegarde écrite : ${backupFile}`)

// 2. Copie à l'identique : mêmes champs typés, donc mêmes valeurs.
await setDocument(TARGET, source.fields)
console.log(`✓ ${sourceCards.length} contacts copiés vers ${TARGET}`)

// 3. Vérification : on relit la cible et on compare contact par contact.
const written = await getDocument(TARGET)
const writtenCards = cardsOf(written)

const problems = []
if (writtenCards.length !== sourceCards.length) {
  problems.push(`nombre de contacts : ${sourceCards.length} attendus, ${writtenCards.length} trouvés`)
}

const writtenById = new Map(writtenCards.map((c) => [c.id, c]))
for (const before of sourceCards) {
  const after = writtenById.get(before.id)
  if (!after) {
    problems.push(`contact absent après migration : ${before.id} (${before.company})`)
    continue
  }
  if (before.column !== after.column) {
    problems.push(`colonne changée pour ${before.company} : ${before.column} → ${after.column}`)
  }
  if (fingerprint(before) !== fingerprint(after)) {
    problems.push(`contenu modifié pour ${before.company} (${before.id})`)
  }
}

const beforeCols = countByColumn(sourceCards)
const afterCols = countByColumn(writtenCards)
console.log('\nRépartition par colonne après migration :', afterCols)
for (const col of new Set([...Object.keys(beforeCols), ...Object.keys(afterCols)])) {
  if (beforeCols[col] !== afterCols[col]) {
    problems.push(`colonne ${col} : ${beforeCols[col] || 0} avant, ${afterCols[col] || 0} après`)
  }
}

if (problems.length > 0) {
  console.error('\n✗ Vérification ÉCHOUÉE :')
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`\n${SOURCE} est intact. Restaurez avec :`)
  console.error(`  node scripts/restore-board.mjs victor ${backupFile}`)
  process.exit(1)
}

console.log(
  `\n✓ Vérification OK : les ${sourceCards.length} contacts sont dans ${TARGET} ` +
    `avec exactement la même colonne, les mêmes notes et les mêmes étoiles.`
)
console.log(`✓ ${SOURCE} est laissé intact comme sauvegarde.`)
