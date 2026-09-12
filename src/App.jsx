import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { parseContacts } from './csv.js'
import { boardRef } from './firebase.js'

// Colonnes fixes de droite : zones de dépôt permanentes. « À appeler » n'en
// fait pas partie : c'est une liste, pas une colonne (voir TodoList).
const COLUMNS = [
  { id: 'no_answer', title: "N'a pas répondu", accent: '#fb923c' },
  { id: 'followup', title: 'Relance nécessaire', accent: '#fde047' },
  { id: 'dead', title: 'Mort', accent: '#fca5a5' },
  { id: 'booked', title: 'Rendez-vous booké', accent: '#4ade80' },
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
        persist([...cardsRef.current, ...contacts])
      }
    } catch {
      setError('Impossible de lire ce fichier CSV.')
    }
    e.target.value = ''
  }

  function moveCard(id, column) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, column } : c)))
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
            onMove={moveCard}
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

function StarButton({ starred, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`star-btn ${starred ? 'on' : ''} ${className}`}
      onClick={onClick}
      aria-pressed={starred}
      aria-label={starred ? "Retirer l'étoile" : 'Mettre une étoile'}
      title={starred ? "Retirer l'étoile" : 'Mettre une étoile'}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}

// Icône/lien de note repliée par défaut. Reste ouverte tant que l'utilisateur
// ne clique pas explicitement sur « Fermer » — jamais de fermeture au clic
// ailleurs. L'état ouvert/fermé et le texte en cours de frappe vivent en
// state local (le composant reste monté tant que le contact reste dans la
// même liste), la sauvegarde Firestore est débouncée pour ne pas ralentir la
// frappe, et systématiquement vidée au blur.
function NoteField({ card, onSetNote, variant = 'icon' }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(card.note || '')
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

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
    if (variant === 'label') {
      return (
        <button
          type="button"
          className="note-link"
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        >
          {card.note ? '🗒️ Note' : '📝 Ajouter une note'}
        </button>
      )
    }
    return (
      <button
        type="button"
        className={`note-icon ${card.note ? 'has-note' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
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
        autoFocus
      />
      <button type="button" className="note-close" onClick={() => { flush(text); setOpen(false) }}>
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
          <TodoRow key={card.id} card={card} onToggleStar={onToggleStar} onSetNote={onSetNote} />
        ))}
      </div>
    </aside>
  )
}

function TodoRow({ card, onToggleStar, onSetNote }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = card.address || card.ville || card.website || card.extras.length > 0

  return (
    <div
      className="todo-row"
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
        className="todo-row-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        <span className="todo-company">{card.company}</span>
        <span className="todo-gerant">{card.gerant || '—'}</span>
        <span className="todo-phone">{card.phone}</span>
        <span className="todo-row-tools">
          <StarButton starred={card.starred} onClick={(e) => { e.stopPropagation(); onToggleStar(card.id) }} />
          <NoteField card={card} onSetNote={onSetNote} />
        </span>
      </div>
      {expanded && (
        <div className="todo-detail">
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
function BoardColumns({ cards, dragOverId, setDragOverId, onDropTo, onMove, onToggleStar, onSetNote }) {
  return (
    <div className="board-columns">
      {COLUMNS.map((col) => {
        const list = cards.filter((c) => c.column === col.id)
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
                <FixedCard key={card.id} card={card} onMove={onMove} onToggleStar={onToggleStar} onSetNote={onSetNote} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FixedCard({ card, onMove, onToggleStar, onSetNote }) {
  return (
    <article
      className="card"
      draggable
      data-card-id={card.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('dragging')
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
    >
      <StarButton starred={card.starred} onClick={() => onToggleStar(card.id)} className="card-star" />
      <div className="card-name">{card.company}</div>
      {card.phone && (
        <a className="card-phone" href={`tel:${card.phone.replace(/[^+\d]/g, '')}`}>
          {card.phone}
        </a>
      )}
      {card.gerant && <div className="card-company">{card.gerant}</div>}
      {card.ville && <div className="card-extra"><span className="label">Ville :</span> {card.ville}</div>}
      {card.address && <div className="card-extra"><span className="label">Adresse :</span> {card.address}</div>}
      {card.website && (
        <div className="card-extra">
          <span className="label">Site :</span>{' '}
          <a href={normalizeUrl(card.website)} target="_blank" rel="noreferrer">{card.website}</a>
        </div>
      )}
      {card.extras.map((f) => (
        <div className="card-extra" key={f.label}>
          <span className="label">{f.label} :</span> {f.value}
        </div>
      ))}

      <NoteField card={card} onSetNote={onSetNote} variant="label" />

      <div className="card-move">
        {COLUMNS.filter((c) => c.id !== card.column).map((c) => (
          <button
            key={c.id}
            className="chip"
            style={{ borderColor: c.accent, color: c.accent }}
            onClick={() => onMove(card.id, c.id)}
            title={`Déplacer vers « ${c.title} »`}
          >
            {c.title}
          </button>
        ))}
      </div>
    </article>
  )
}
