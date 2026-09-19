import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { parseContacts, newId } from './csv.js'
import { boardRefFor } from './firebase.js'
import { LEGACY_SPACE_ID } from './spaces.js'
import { COLUMNS, COLUMN_IDS, FOLLOWUP_COLUMN_ID } from './columns.js'
import { downloadContactsCsv } from './exportCsv.js'

const normLabel = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

function normalizeUrl(url) {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// Clé de rapprochement pour la déduplication à l'import CSV : même entreprise
// et même téléphone (accents/casse/espaces ignorés côté nom, non-chiffres
// ignorés côté téléphone) désignent le même contact.
function contactKey(company, phone) {
  return `${normLabel(company || '')}|${(phone || '').replace(/\D/g, '')}`
}

// Recherche : compare entreprise / gérant / ville (accents et casse ignorés)
// et téléphone (chiffres seuls, pour tolérer espaces/points/tirets).
function matchesSearch(card, termNorm, digits) {
  if (termNorm && (
    normLabel(card.company).includes(termNorm) ||
    normLabel(card.gerant).includes(termNorm) ||
    normLabel(card.ville).includes(termNorm)
  )) return true
  if (digits && card.phone.replace(/\D/g, '').includes(digits)) return true
  return false
}

// Accepte aussi bien les cartes déjà stockées avec l'ancien schéma (name /
// company / email / extras génériques) que le nouveau (company / gerant /
// phone / address / ville / website). Les anciennes cartes ne sont jamais
// perdues : leurs champs Ville / Dirigeant / Adresse / Site web, stockés en
// extras, sont récupérés dans les nouveaux champs dédiés. La ré-écriture
// complète en nouveau schéma se fait naturellement à la prochaine action de
// l'utilisateur (persist() ré-enregistre toujours le tableau assaini entier).
function sanitize(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => {
      let gerant = typeof c.gerant === 'string' ? c.gerant : ''
      let address = typeof c.address === 'string' ? c.address : ''
      let ville = typeof c.ville === 'string' ? c.ville : ''
      let website = typeof c.website === 'string' ? c.website : ''

      const rawExtras = Array.isArray(c.extras) ? c.extras : []
      const extras = []
      for (const e of rawExtras) {
        const label = typeof e?.label === 'string' ? e.label : ''
        const value = typeof e?.value === 'string' ? e.value : ''
        if (!value) continue
        const n = normLabel(label)
        if (!gerant && (n === 'dirigeant' || n === 'gerant')) { gerant = value; continue }
        if (!address && (n === 'adresse' || n === 'address')) { address = value; continue }
        if (!ville && (n === 'ville' || n === 'city')) { ville = value; continue }
        if (!website && (n === 'site web' || n === 'siteweb' || n === 'website')) { website = value; continue }
        extras.push({ label: label || 'Info', value })
      }

      const company =
        (typeof c.company === 'string' && c.company) ||
        (typeof c.name === 'string' && c.name) ||
        'Sans nom'

      return {
        id: c.id,
        company,
        gerant,
        phone: typeof c.phone === 'string' ? c.phone : '',
        address,
        ville,
        website,
        extras,
        note: typeof c.note === 'string' ? c.note : '',
        starred: c.starred === true,
        followUpAt: typeof c.followUpAt === 'string' ? c.followUpAt : '',
        column: COLUMN_IDS.has(c.column) ? c.column : 'todo',
        classifiedAt: typeof c.classifiedAt === 'number' ? c.classifiedAt : 0,
      }
    })
}

// Tableau d'UN espace. Toutes les lectures et écritures passent par
// boardRefFor(space.id) : rien de ce qui est fait ici ne peut atteindre le
// document d'un autre setter. Le composant est monté avec key={space.id} par
// App, donc changer d'espace le remonte à neuf (aucun état résiduel).
export default function Board({ space, onBack }) {
  const boardRef = useMemo(() => boardRefFor(space.id), [space.id])

  const [cards, setCards] = useState([])
  const [status, setStatus] = useState('connecting') // connecting | online | offline | denied
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  // false tant que le document de l'espace n'existe pas encore côté serveur.
  const [docExists, setDocExists] = useState(true)
  const [cityFilter, setCityFilter] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
  const [activeTab, setActiveTab] = useState('todo')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  // Import en deux temps : pendingImport porte le CSV déjà analysé, en
  // attente du choix « ajouter » / « remplacer » ; confirmReplace porte la
  // deuxième confirmation, obligatoire avant toute suppression.
  const [pendingImport, setPendingImport] = useState(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const fileInput = useRef(null)
  const cardsRef = useRef([])
  const loadedRef = useRef(false)

  // Lecture temps réel : toute modification faite depuis un autre appareil
  // arrive ici sans rechargement.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      boardRef,
      { includeMetadataChanges: true },
      (snap) => {
        const next = snap.exists() ? sanitize(snap.data().cards) : []
        cardsRef.current = next
        setCards(next)
        setDocExists(snap.exists())
        setStatus(snap.metadata.fromCache ? 'offline' : 'online')
        if (!loadedRef.current) {
          loadedRef.current = true
          setLoaded(true)
        }
      },
      (err) => {
        setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
        if (!loadedRef.current) {
          loadedRef.current = true
          setLoaded(true)
        }
      }
    )
    return unsubscribe
  }, [boardRef])

  // Écriture : le document de CET espace porte l'état complet de son tableau.
  function persist(next) {
    cardsRef.current = next
    setCards(next)
    setDoc(boardRef, { cards: next, updatedAt: serverTimestamp() }).catch((err) => {
      setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
    })
  }

  // Sélection d'un fichier : on analyse, on n'écrit rien. Le choix
  // « ajouter » / « remplacer » se fait ensuite dans la modale.
  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    try {
      const contacts = parseContacts(await file.text())
      if (contacts.length === 0) {
        setError('Aucune ligne exploitable dans ce fichier.')
        return
      }
      setPendingImport({ fileName: file.name, contacts })
    } catch {
      setError('Impossible de lire ce fichier CSV.')
    }
  }

  // Ajout : les contacts existants ne sont pas touchés (ni colonne, ni note,
  // ni étoile). Un contact du CSV déjà présent dans l'espace (même entreprise
  // + même téléphone) est ignoré plutôt que dupliqué.
  function importAppend() {
    const { contacts } = pendingImport
    const existing = cardsRef.current
    const keys = new Set(existing.map((c) => contactKey(c.company, c.phone)))
    const fresh = []
    for (const c of contacts) {
      const key = contactKey(c.company, c.phone)
      if (keys.has(key)) continue
      keys.add(key)
      fresh.push(c)
    }
    persist([...existing, ...fresh])
    const skipped = contacts.length - fresh.length
    setNotice(
      `${fresh.length} contact${fresh.length > 1 ? 's' : ''} ajouté${fresh.length > 1 ? 's' : ''} à « À appeler »` +
        (skipped > 0 ? ` — ${skipped} déjà présent${skipped > 1 ? 's' : ''}, ignoré${skipped > 1 ? 's' : ''}.` : '.')
    )
    setPendingImport(null)
    setConfirmReplace(false)
  }

  // Remplacement : destructif, atteint seulement après la double confirmation.
  function importReplace() {
    const { contacts } = pendingImport
    const removed = cardsRef.current.length
    persist(contacts)
    setNotice(
      `Liste remplacée : ${removed} contact${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''}, ` +
        `${contacts.length} importé${contacts.length > 1 ? 's' : ''}.`
    )
    setPendingImport(null)
    setConfirmReplace(false)
  }

  function cancelImport() {
    setPendingImport(null)
    setConfirmReplace(false)
  }

  function handleExport() {
    if (cardsRef.current.length === 0) return
    downloadContactsCsv(cardsRef.current, space.name)
  }

  // classifiedAt capture l'instant du dépôt : les colonnes fixes affichent
  // leurs contacts du plus récemment classé au plus ancien.
  function moveCard(id, column) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, column, classifiedAt: Date.now() } : c)))
  }

  function toggleStar(id) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c)))
  }

  function setNote(id, note) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, note } : c)))
  }

  // Date/heure de relance. La valeur vide efface la date sans toucher au
  // reste du contact.
  function setFollowUp(id, followUpAt) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, followUpAt } : c)))
  }

  function reset() {
    if (cardsRef.current.length === 0) return
    if (confirm(`Vider le tableau de ${space.name} ? Tous les contacts seront supprimés.`)) {
      persist([])
    }
  }

  // Contact créé à la main : atterrit dans « À appeler », comme un import
  // CSV — aucune carte existante n'est déplacée ni reclassée.
  function addContact({ company, gerant, phone, address, ville, website }) {
    const card = {
      id: newId(),
      company: company.trim() || 'Sans nom',
      gerant: gerant.trim(),
      phone: phone.trim(),
      address: address.trim(),
      ville: ville.trim(),
      website: website.trim(),
      extras: [],
      note: '',
      starred: false,
      followUpAt: '',
      column: 'todo',
      classifiedAt: 0,
    }
    persist([...cardsRef.current, card])
  }

  // Seules les 5 colonnes fixes sont des zones de dépôt : « À appeler » ne
  // reçoit jamais aucun handler onDragOver/onDrop, donc un contact ne peut
  // pas y revenir par glisser-déposer.
  function onDropTo(e, columnId) {
    e.preventDefault()
    setDragOverId(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) moveCard(id, columnId)
  }

  const cities = useMemo(() => {
    const set = new Set()
    for (const c of cards) if (c.ville) set.add(c.ville)
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cards])

  const todoCards = useMemo(() => {
    let list = cards.filter((c) => c.column === 'todo')
    if (cityFilter) list = list.filter((c) => c.ville === cityFilter)
    return list
  }, [cards, cityFilter])

  const searchTerm = normLabel(searchQuery.trim())
  const searchDigits = searchQuery.replace(/\D/g, '')
  const hasSearch = Boolean(searchTerm || searchDigits)

  const matchedIds = useMemo(() => {
    if (!hasSearch) return new Set()
    return new Set(cards.filter((c) => matchesSearch(c, searchTerm, searchDigits)).map((c) => c.id))
  }, [cards, searchTerm, searchDigits, hasSearch])

  // L'ancien tableau unique n'a pas encore été recopié dans board/victor :
  // mieux vaut le dire que d'afficher un espace vide sur ses vraies données.
  const needsMigration =
    space.id === LEGACY_SPACE_ID && loaded && status === 'online' && !docExists && cards.length === 0

  // Un contact trouvé n'est jamais déplacé : on l'illumine (voir .highlighted)
  // là où il est déjà classé. Sur mobile, une seule colonne est visible à la
  // fois (activeTab) donc on bascule dessus avant de faire défiler jusqu'à
  // lui ; sur desktop toutes les colonnes sont déjà visibles, ce changement
  // est sans effet visuel.
  useEffect(() => {
    if (!hasSearch || matchedIds.size === 0) return
    const firstMatch = cardsRef.current.find((c) => matchedIds.has(c.id))
    if (!firstMatch) return
    if (firstMatch.column !== activeTab) {
      setActiveTab(firstMatch.column)
      return
    }
    const el = document.querySelector(`[data-card-id="${firstMatch.id}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [matchedIds, hasSearch, activeTab])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <button
            type="button"
            className="back-btn"
            onClick={onBack}
            aria-label="Retour au menu des espaces"
            title="Retour au menu des espaces"
          >
            ←
          </button>
          <h1>
            Planning d'appel <span className="space-name">{space.name}</span>
          </h1>
        </div>
        <div className="search-bar">
          <div className="search-input-wrap">
            <input
              type="text"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un contact (entreprise, gérant, ville, téléphone)…"
              aria-label="Rechercher un contact"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Effacer la recherche"
                title="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>
          {hasSearch && (
            <span className="search-count">
              {matchedIds.size} résultat{matchedIds.size > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="actions">
          <StatusPill status={status} />
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            hidden
          />
          <button className="btn primary" onClick={() => fileInput.current?.click()}>
            Importer un CSV
          </button>
          <button
            className="btn"
            onClick={handleExport}
            disabled={cards.length === 0}
            title="Télécharger tous les contacts de cet espace au format CSV"
          >
            Exporter
          </button>
          <button className="btn ghost" onClick={reset} disabled={cards.length === 0}>
            Réinitialiser
          </button>
          <span className="count">{cards.length} contact{cards.length > 1 ? 's' : ''}</span>
        </div>
      </header>

      {status === 'denied' && (
        <p className="error">
          Firestore refuse l'accès au document <code>board/{space.id}</code> : les modifications
          restent locales. Autorisez la lecture/écriture dans les règles de sécurité du projet.
        </p>
      )}
      {needsMigration && (
        <p className="error">
          Les contacts de {space.name} n'ont pas encore été migrés vers <code>board/{space.id}</code>.
          Ils sont intacts dans <code>board/current</code> : lancez{' '}
          <code>node scripts/migrate-victor.mjs --apply</code> avant d'utiliser cet espace.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="notice">
          {notice}
          <button type="button" className="notice-close" onClick={() => setNotice('')} aria-label="Masquer">✕</button>
        </p>
      )}
      {loaded && cards.length === 0 && !error && !needsMigration && (
        <p className="hint">
          Importez un CSV pour commencer — chaque ligne devient un contact dans « À appeler ».
        </p>
      )}

      {!loaded ? (
        <p className="hint">Chargement du tableau…</p>
      ) : (
        <>
          <nav className="mobile-tabs">
            <button
              type="button"
              className={`mobile-tab ${activeTab === 'todo' ? 'active' : ''}`}
              onClick={() => setActiveTab('todo')}
            >
              À appeler <span className="badge">{todoCards.length}</span>
            </button>
            {COLUMNS.map((col) => (
              <button
                key={col.id}
                type="button"
                className={`mobile-tab ${activeTab === col.id ? 'active' : ''}`}
                onClick={() => setActiveTab(col.id)}
              >
                {col.title}{' '}
                <span className="badge">{cards.filter((c) => c.column === col.id).length}</span>
              </button>
            ))}
          </nav>
          <main className="workspace" data-active-tab={activeTab}>
            <TodoList
              cards={todoCards}
              cities={cities}
              cityFilter={cityFilter}
              onCityFilterChange={setCityFilter}
              onToggleStar={toggleStar}
              onSetNote={setNote}
              onMoveCard={moveCard}
              matchedIds={matchedIds}
              onAddContact={() => setShowAddForm(true)}
            />
            <BoardColumns
              cards={cards}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              onDropTo={onDropTo}
              onToggleStar={toggleStar}
              onSetNote={setNote}
              onSetFollowUp={setFollowUp}
              onMoveCard={moveCard}
              matchedIds={matchedIds}
            />
          </main>
        </>
      )}

      {pendingImport && !confirmReplace && (
        <ImportChoiceModal
          fileName={pendingImport.fileName}
          incoming={pendingImport.contacts.length}
          existing={cards.length}
          spaceName={space.name}
          onAppend={importAppend}
          onReplace={() => setConfirmReplace(true)}
          onCancel={cancelImport}
        />
      )}

      {pendingImport && confirmReplace && (
        <ConfirmReplaceModal
          existing={cards.length}
          incoming={pendingImport.contacts.length}
          onConfirm={importReplace}
          onBack={() => setConfirmReplace(false)}
          onCancel={cancelImport}
        />
      )}

      {showAddForm && (
        <AddContactModal
          cities={cities}
          onCancel={() => setShowAddForm(false)}
          onCreate={(fields) => {
            addContact(fields)
            setShowAddForm(false)
          }}
        />
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const label =
    { online: 'En ligne', offline: 'Hors ligne', denied: 'Accès refusé', connecting: 'Connexion…' }[
      status
    ]
  const title =
    {
      online: 'Synchronisé avec Firestore',
      offline:
        'Firestore est injoignable : le tableau affiché vient du cache local et vos changements seront envoyés au retour de la connexion.',
      denied:
        "Firestore refuse la lecture/écriture sur le document de cet espace. Vérifiez les règles de sécurité du projet.",
      connecting: 'Connexion à Firestore…',
    }[status]
  return (
    <span className={`status ${status}`} title={title} data-testid="status">
      <span className="dot" />
      {label}
    </span>
  )
}

// Ferme la modale sur Échap. Partagé par toutes les modales du tableau.
function useEscape(onEscape) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onEscape() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEscape])
}

// Premier temps de l'import : aucun contact n'a encore bougé, les deux issues
// possibles sont explicites et la destructive est visuellement distincte.
function ImportChoiceModal({ fileName, incoming, existing, spaceName, onAppend, onReplace, onCancel }) {
  useEscape(onCancel)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Importer un CSV">
        <h2>Importer {incoming} contact{incoming > 1 ? 's' : ''}</h2>
        <p className="modal-sub">
          Fichier <strong>{fileName}</strong> — l'espace de {spaceName} contient actuellement{' '}
          <strong>{existing}</strong> contact{existing > 1 ? 's' : ''}.
        </p>
        <div className="import-choices">
          <button type="button" className="import-choice" onClick={onAppend}>
            <span className="import-choice-title">Ajouter à la liste existante</span>
            <span className="import-choice-desc">
              Les {incoming} contacts rejoignent « À appeler ». Les contacts déjà présents gardent
              leur colonne, leurs notes et leurs étoiles ; les doublons du fichier sont ignorés.
            </span>
          </button>
          <button type="button" className="import-choice danger" onClick={onReplace}>
            <span className="import-choice-title">Remplacer la liste existante</span>
            <span className="import-choice-desc">
              Les {existing} contacts actuels de cet espace sont supprimés, classement et notes
              compris, et remplacés par le contenu du fichier.
            </span>
          </button>
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// Deuxième temps, uniquement pour le remplacement : dernière barrière avant
// une suppression définitive.
function ConfirmReplaceModal({ existing, incoming, onConfirm, onBack, onCancel }) {
  useEscape(onCancel)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Confirmer le remplacement">
        <h2 className="modal-danger-title">Confirmer le remplacement</h2>
        <p className="modal-sub">
          Cette action supprimera définitivement les <strong>{existing}</strong> contact
          {existing > 1 ? 's' : ''} actuel{existing > 1 ? 's' : ''} de cet espace — classement,
          notes et étoiles compris — et les remplacera par les {incoming} contacts du fichier.
          Confirmer ?
        </p>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onBack}>Retour</button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            Supprimer et remplacer
          </button>
        </div>
      </div>
    </div>
  )
}

function StarButton({ starred, onClick }) {
  return (
    <button
      type="button"
      className={`star-btn ${starred ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={starred}
      aria-label={starred ? "Retirer l'étoile" : 'Mettre une étoile'}
      title={starred ? "Retirer l'étoile" : 'Mettre une étoile'}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}

// Icône de note repliée par défaut. Reste ouverte tant que l'utilisateur ne
// clique pas explicitement sur « Fermer » — jamais de fermeture au clic
// ailleurs. L'état ouvert/fermé et le texte en cours de frappe vivent en
// state local (le composant reste monté tant que le contact reste dans la
// même liste), la sauvegarde Firestore est débouncée pour ne pas ralentir la
// frappe, et systématiquement vidée au blur.
function NoteField({ card, onSetNote }) {
  // Repliée par défaut si la note est vide, dépliée d'emblée si elle contient
  // déjà du texte. Cet état par défaut se réévalue à chaque montage (donc au
  // rechargement de la page, ou quand un contact change de colonne) ainsi
  // que si la note passe de vide à remplie pendant que le champ reste monté
  // (mise à jour Firestore venue d'un autre appareil).
  const [open, setOpen] = useState(Boolean(card.note))
  const [text, setText] = useState(card.note || '')
  const manualOpenRef = useRef(false)
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  useEffect(() => {
    if (!open && card.note) {
      setText(card.note)
      setOpen(true)
    }
    // N'observe que card.note : si l'utilisateur referme une note déjà
    // remplie, elle ne doit pas se rouvrir tant que son contenu ne change
    // pas réellement (donc pas de dépendance sur `open`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.note])

  function flush(value) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    onSetNote(card.id, value)
  }

  function handleChange(e) {
    const v = e.target.value
    setText(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSetNote(card.id, v), 500)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`note-icon ${card.note ? 'has-note' : ''}`}
        onClick={(e) => { e.stopPropagation(); manualOpenRef.current = true; setOpen(true) }}
        title={card.note ? 'Voir / modifier la note' : 'Ajouter une note'}
        aria-label={card.note ? 'Voir / modifier la note' : 'Ajouter une note'}
      >
        {card.note ? '🗒️' : '📝'}
      </button>
    )
  }

  return (
    <div className="note-box" onClick={(e) => e.stopPropagation()}>
      <textarea
        className="note-textarea"
        value={text}
        onChange={handleChange}
        onBlur={() => flush(text)}
        placeholder="Écrire une note…"
        rows={3}
        autoFocus={manualOpenRef.current}
      />
      <button type="button" className="note-close" onClick={() => { flush(text); manualOpenRef.current = false; setOpen(false) }}>
        Fermer
      </button>
    </div>
  )
}

// Date et heure de la prochaine relance, affichée uniquement sur la colonne
// « Rappel -7 jours » (voir FOLLOWUP_COLUMN_ID) : c'est là qu'on planifie le
// prochain appel.
//
// Deux champs natifs empilés plutôt qu'un seul datetime-local : les colonnes
// font 180 px, un datetime-local y est tronqué (« 27/09/2026 14 » et le
// sélecteur coupé). Séparés, la date et l'heure restent entièrement lisibles.
//
// La valeur reste stockée en une seule chaîne followUpAt au format
// « AAAA-MM-JJTHH:mm » — celui qu'attendent sanitize() et l'export CSV.
const FOLLOWUP_DEFAULT_TIME = '09:00'

function splitFollowUp(value) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value || '')
  return { date: m ? m[1] : '', time: m && m[2] ? m[2] : '' }
}

function FollowUpField({ card, onSetFollowUp }) {
  const { date, time } = splitFollowUp(card.followUpAt)
  const due = card.followUpAt ? new Date(card.followUpAt) : null
  const overdue = due && !Number.isNaN(due.valueOf()) && due.getTime() < Date.now()

  // Sans date, l'heure seule n'a pas de sens : on efface. Une date choisie
  // sans heure prend 9h par défaut, modifiable juste en dessous.
  const update = (nextDate, nextTime) => {
    if (!nextDate) return onSetFollowUp(card.id, '')
    onSetFollowUp(card.id, `${nextDate}T${nextTime || FOLLOWUP_DEFAULT_TIME}`)
  }

  return (
    <div
      className={`followup-field ${overdue ? 'overdue' : ''}`}
      role="group"
      aria-label="Date et heure de relance"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="followup-label">{overdue ? 'Relance en retard' : 'Relance le'}</span>
      {card.followUpAt && (
        <button
          type="button"
          className="followup-clear"
          onClick={() => onSetFollowUp(card.id, '')}
          aria-label="Effacer la date de relance"
          title="Effacer la date de relance"
        >
          ✕
        </button>
      )}
      <input
        type="date"
        className="followup-input followup-date"
        value={date}
        onChange={(e) => update(e.target.value, time)}
        aria-label="Date de relance"
      />
      <input
        type="time"
        className="followup-input followup-time"
        value={time}
        onChange={(e) => update(date, e.target.value)}
        disabled={!date}
        aria-label="Heure de relance"
        title={date ? 'Heure de relance' : "Choisissez d'abord une date"}
      />
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label} :</span> {value}
    </div>
  )
}

// Colonne de gauche : liste compacte, pas de cartes, pas de zone de dépôt
// (aucun onDragOver/onDrop ici) — on ne peut qu'en faire sortir des contacts.
function TodoList({ cards, cities, cityFilter, onCityFilterChange, onToggleStar, onSetNote, onMoveCard, matchedIds, onAddContact }) {
  return (
    <aside className="sidebar" data-tab="todo">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>
            À appeler <span className="badge">{cards.length}</span>
          </h2>
          <button
            type="button"
            className="add-contact-btn"
            onClick={onAddContact}
            aria-label="Ajouter un contact manuellement"
            title="Ajouter un contact manuellement"
          >
            +
          </button>
        </div>
        <select
          className="city-filter"
          value={cityFilter}
          onChange={(e) => onCityFilterChange(e.target.value)}
          aria-label="Filtrer par ville"
        >
          <option value="">Toutes les villes</option>
          {cities.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="sidebar-list">
        {cards.length === 0 && (
          <p className="sidebar-empty">Aucun contact{cityFilter ? ' pour cette ville' : ''}.</p>
        )}
        {cards.map((card) => (
          <ContactRow
            key={card.id}
            card={card}
            onToggleStar={onToggleStar}
            onSetNote={onSetNote}
            onMoveCard={onMoveCard}
            highlighted={matchedIds?.has(card.id)}
          />
        ))}
      </div>
    </aside>
  )
}

// Composant d'affichage unique, partagé entre « À appeler » et les 5
// catégories fixes : liste compacte (entreprise, gérant, téléphone) qui se
// déplie au clic pour révéler le détail et la note. Seul le conteneur qui
// l'accueille (et donc la colonne de destination au drop) change.
function ContactRow({ card, onToggleStar, onSetNote, onMoveCard, onSetFollowUp, highlighted }) {
  const [expanded, setExpanded] = useState(false)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const hasDetail = card.address || card.ville || card.website || card.extras.length > 0

  useEffect(() => {
    if (!moveMenuOpen) return
    const close = () => setMoveMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [moveMenuOpen])

  return (
    <div
      className={`contact-row ${highlighted ? 'highlighted' : ''}`}
      draggable
      data-card-id={card.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('dragging')
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
    >
      <div
        className="contact-row-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          // Ce gestionnaire est sur la ligne entière (role="button") mais la
          // zone de note est un descendant : sans ce garde-fou, taper dans le
          // textarea (espace, entrée…) remonte jusqu'ici et se ferait
          // intercepter avant d'atteindre le champ. On laisse passer toute
          // touche tapée depuis un champ de saisie actif.
          const el = document.activeElement
          const isTyping = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
          if (isTyping) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        <span className="contact-company">{card.company}</span>
        <span className="contact-gerant">{card.gerant || '—'}</span>
        {card.phone && (
          <a
            className="contact-phone"
            href={`tel:${card.phone.replace(/[^\d+]/g, '')}`}
            onClick={(e) => e.stopPropagation()}
          >
            {card.phone}
          </a>
        )}
        <span className="contact-row-tools">
          <StarButton starred={card.starred} onClick={(e) => { e.stopPropagation(); onToggleStar(card.id) }} />
          <NoteField card={card} onSetNote={onSetNote} />
          {onMoveCard && (
            <span className="move-menu-wrap">
              <button
                type="button"
                className="move-menu-btn"
                onClick={(e) => { e.stopPropagation(); setMoveMenuOpen((v) => !v) }}
                aria-label="Déplacer vers"
                title="Déplacer vers"
              >
                ⋯
              </button>
              {moveMenuOpen && (
                <div className="move-menu" onClick={(e) => e.stopPropagation()}>
                  {COLUMNS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      className="move-menu-item"
                      onClick={() => { onMoveCard(card.id, col.id); setMoveMenuOpen(false) }}
                    >
                      {col.title}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
        </span>
      </div>
      {onSetFollowUp && <FollowUpField card={card} onSetFollowUp={onSetFollowUp} />}
      {expanded && (
        <div className="contact-detail">
          {card.address && <DetailRow label="Adresse" value={card.address} />}
          {card.ville && <DetailRow label="Ville" value={card.ville} />}
          {card.website && (
            <div className="detail-row">
              <span className="detail-label">Site web :</span>{' '}
              <a href={normalizeUrl(card.website)} target="_blank" rel="noreferrer">{card.website}</a>
            </div>
          )}
          {card.extras.map((f) => <DetailRow key={f.label} label={f.label} value={f.value} />)}
          {!hasDetail && <p className="detail-empty">Aucune autre information.</p>}
        </div>
      )}
    </div>
  )
}

// Les 5 colonnes fixes : uniquement des zones de dépôt, ne bougent jamais.
// Chaque contact y est affiché avec le même ContactRow que « À appeler » ;
// on le reclasse par glisser-déposer d'une colonne à l'autre.
function BoardColumns({ cards, dragOverId, setDragOverId, onDropTo, onToggleStar, onSetNote, onSetFollowUp, onMoveCard, matchedIds }) {
  return (
    <div className="board-columns">
      {COLUMNS.map((col) => {
        const list = cards
          .filter((c) => c.column === col.id)
          .sort((a, b) => b.classifiedAt - a.classifiedAt)
        return (
          <section
            key={col.id}
            className={`column ${col.id} ${dragOverId === col.id ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverId !== col.id) setDragOverId(col.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null)
            }}
            onDrop={(e) => onDropTo(e, col.id)}
            data-testid={`col-${col.id}`}
            data-tab={col.id}
          >
            <h2 className="column-title">
              {col.title} <span className="badge">{list.length}</span>
            </h2>
            <div className="cards">
              {list.length === 0 && <p className="column-empty">Vide</p>}
              {list.map((card) => (
                <ContactRow
                  key={card.id}
                  card={card}
                  onToggleStar={onToggleStar}
                  onSetNote={onSetNote}
                  onMoveCard={onMoveCard}
                  onSetFollowUp={col.id === FOLLOWUP_COLUMN_ID ? onSetFollowUp : null}
                  highlighted={matchedIds?.has(card.id)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const NEW_CITY_VALUE = '__new__'

// Formulaire de création manuelle : la ville se choisit dans la liste des
// villes déjà connues (select fiable, pas de saisie libre source de doublons
// comme « Nice » / « nice » / « Nice  ») avec une option « + Nouvelle ville »
// qui révèle un champ texte dédié pour les villes pas encore vues.
function AddContactModal({ cities, onCancel, onCreate }) {
  const [company, setCompany] = useState('')
  const [gerant, setGerant] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [villeChoice, setVilleChoice] = useState(cities.length ? '' : NEW_CITY_VALUE)
  const [newVille, setNewVille] = useState('')
  const companyRef = useRef(null)

  useEffect(() => {
    companyRef.current?.focus()
  }, [])

  useEscape(onCancel)

  const isNewVille = villeChoice === NEW_CITY_VALUE
  const ville = isNewVille ? newVille : villeChoice
  const canSubmit = company.trim() !== ''

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onCreate({ company, gerant, phone, address, ville, website })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Ajouter un contact">
        <h2>Ajouter un contact</h2>
        <p className="modal-sub">Le contact est créé directement dans « À appeler ».</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="add-company">Entreprise *</label>
            <input id="add-company" ref={companyRef} value={company} onChange={(e) => setCompany(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="add-gerant">Gérant</label>
            <input id="add-gerant" value={gerant} onChange={(e) => setGerant(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="add-phone">Téléphone</label>
            <input id="add-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="add-ville">Ville</label>
            <select id="add-ville" value={villeChoice} onChange={(e) => setVilleChoice(e.target.value)}>
              <option value="">Aucune ville</option>
              {cities.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value={NEW_CITY_VALUE}>+ Nouvelle ville…</option>
            </select>
            {isNewVille && (
              <input
                className="add-ville-new"
                value={newVille}
                onChange={(e) => setNewVille(e.target.value)}
                placeholder="Nom de la nouvelle ville"
                autoFocus
              />
            )}
          </div>
          <div className="form-field">
            <label htmlFor="add-address">Adresse</label>
            <input id="add-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="add-website">Site web</label>
            <input id="add-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
            <button type="submit" className="btn primary" disabled={!canSubmit}>Créer le contact</button>
          </div>
        </form>
      </div>
    </div>
  )
}
