import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { parseContacts } from './csv.js'
import { boardRef } from './firebase.js'

// Colonnes fixes de droite : zones de dépôt permanentes. « À appeler » n'en
// fait pas partie : c'est une liste, pas une colonne (voir TodoList).
const COLUMNS = [
  { id: 'no_answer', title: "N'a pas répondu" },
  { id: 'followup', title: 'Relance nécessaire' },
  { id: 'dead', title: 'Mort' },
  { id: 'booked', title: 'Rendez-vous booké' },
]

const COLUMN_IDS = new Set(['todo', ...COLUMNS.map((c) => c.id)])

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

export default function App() {
  const [cards, setCards] = useState([])
  const [status, setStatus] = useState('connecting') // connecting | online | offline | denied
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [cityFilter, setCityFilter] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
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
  }, [])

  // Écriture : le document porte l'état complet du tableau.
  function persist(next) {
    cardsRef.current = next
    setCards(next)
    setDoc(boardRef, { cards: next, updatedAt: serverTimestamp() }).catch((err) => {
      setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
    })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const contacts = parseContacts(await file.text())
      if (contacts.length === 0) {
        setError('Aucune ligne exploitable dans ce fichier.')
      } else {
        // Le nouvel import remplace entièrement « À appeler ». Les contacts
        // déjà classés dans une des 4 catégories fixes ne sont jamais
        // touchés, et un contact du CSV qui les matche (même entreprise +
        // même téléphone) n'est pas réintroduit en double dans « À appeler ».
        const classified = cardsRef.current.filter((c) => c.column !== 'todo')
        const classifiedKeys = new Set(classified.map((c) => contactKey(c.company, c.phone)))
        const fresh = contacts.filter((c) => !classifiedKeys.has(contactKey(c.company, c.phone)))
        persist([...classified, ...fresh])
      }
    } catch {
      setError('Impossible de lire ce fichier CSV.')
    }
    e.target.value = ''
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

  function reset() {
    if (cardsRef.current.length === 0) return
    if (confirm('Vider le tableau ? Tous les contacts seront supprimés.')) {
      persist([])
    }
  }

  // Seules les 4 colonnes fixes sont des zones de dépôt : « À appeler » ne
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

  return (
    <div className="app">
      <header className="topbar">
        <h1>Espace de grind de Victor</h1>
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
          <button className="btn ghost" onClick={reset} disabled={cards.length === 0}>
            Réinitialiser
          </button>
          <span className="count">{cards.length} contact{cards.length > 1 ? 's' : ''}</span>
        </div>
      </header>

      {status === 'denied' && (
        <p className="error">
          Firestore refuse l'accès au document <code>board/current</code> : les modifications
          restent locales. Autorisez la lecture/écriture dans les règles de sécurité du projet.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {loaded && cards.length === 0 && !error && (
        <p className="hint">
          Importez un CSV pour commencer — chaque ligne devient un contact dans « À appeler ».
        </p>
      )}

      {!loaded ? (
        <p className="hint">Chargement du tableau…</p>
      ) : (
        <main className="workspace">
          <TodoList
            cards={todoCards}
            cities={cities}
            cityFilter={cityFilter}
            onCityFilterChange={setCityFilter}
            onToggleStar={toggleStar}
            onSetNote={setNote}
          />
          <BoardColumns
            cards={cards}
            dragOverId={dragOverId}
            setDragOverId={setDragOverId}
            onDropTo={onDropTo}
            onToggleStar={toggleStar}
            onSetNote={setNote}
          />
        </main>
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
        'Firestore refuse la lecture/écriture sur board/current. Vérifiez les règles de sécurité du projet.',
      connecting: 'Connexion à Firestore…',
    }[status]
  return (
    <span className={`status ${status}`} title={title} data-testid="status">
      <span className="dot" />
      {label}
    </span>
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

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label} :</span> {value}
    </div>
  )
}

// Colonne de gauche : liste compacte, pas de cartes, pas de zone de dépôt
// (aucun onDragOver/onDrop ici) — on ne peut qu'en faire sortir des contacts.
function TodoList({ cards, cities, cityFilter, onCityFilterChange, onToggleStar, onSetNote }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>
          À appeler <span className="badge">{cards.length}</span>
        </h2>
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
          <ContactRow key={card.id} card={card} onToggleStar={onToggleStar} onSetNote={onSetNote} />
        ))}
      </div>
    </aside>
  )
}

// Composant d'affichage unique, partagé entre « À appeler » et les 4
// catégories fixes : liste compacte (entreprise, gérant, téléphone) qui se
// déplie au clic pour révéler le détail et la note. Seul le conteneur qui
// l'accueille (et donc la colonne de destination au drop) change.
function ContactRow({ card, onToggleStar, onSetNote }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = card.address || card.ville || card.website || card.extras.length > 0

  return (
    <div
      className="contact-row"
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
        <span className="contact-phone">{card.phone}</span>
        <span className="contact-row-tools">
          <StarButton starred={card.starred} onClick={(e) => { e.stopPropagation(); onToggleStar(card.id) }} />
          <NoteField card={card} onSetNote={onSetNote} />
        </span>
      </div>
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

// Les 4 colonnes fixes : uniquement des zones de dépôt, ne bougent jamais.
// Chaque contact y est affiché avec le même ContactRow que « À appeler » ;
// on le reclasse par glisser-déposer d'une colonne à l'autre.
function BoardColumns({ cards, dragOverId, setDragOverId, onDropTo, onToggleStar, onSetNote }) {
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
          >
            <h2 className="column-title">
              {col.title} <span className="badge">{list.length}</span>
            </h2>
            <div className="cards">
              {list.length === 0 && <p className="column-empty">Vide</p>}
              {list.map((card) => (
                <ContactRow key={card.id} card={card} onToggleStar={onToggleStar} onSetNote={onSetNote} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
