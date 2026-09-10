import { useEffect, useRef, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { parseContacts } from './csv.js'
import { boardRef } from './firebase.js'

const COLUMNS = [
  { id: 'todo', title: 'À appeler', accent: '#7dabff' },
  { id: 'booked', title: 'Rendez-vous booké', accent: '#4ade80' },
  { id: 'followup', title: 'À relancer', accent: '#fde047' },
  { id: 'dead', title: 'Mort', accent: '#fca5a5' },
]

const COLUMN_IDS = new Set(COLUMNS.map((c) => c.id))

function sanitize(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id,
      name: c.name || 'Sans nom',
      phone: c.phone || '',
      company: c.company || '',
      email: c.email || '',
      extras: Array.isArray(c.extras) ? c.extras : [],
      followUpAt: typeof c.followUpAt === 'string' ? c.followUpAt : '',
      column: COLUMN_IDS.has(c.column) ? c.column : 'todo',
    }))
}

export default function App() {
  const [cards, setCards] = useState([])
  const [status, setStatus] = useState('connecting') // connecting | online | offline | denied
  const [dragOver, setDragOver] = useState(null)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const cardsRef = useRef([])
  const loadedRef = useRef(false)
  const [loaded, setLoaded] = useState(false)

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

  // La date reste attachée à la carte même si elle quitte « À relancer » :
  // elle est simplement masquée ailleurs, et retrouvée si la carte revient.
  function setFollowUp(id, value) {
    persist(cardsRef.current.map((c) => (c.id === id ? { ...c, followUpAt: value } : c)))
  }

  function reset() {
    if (cardsRef.current.length === 0) return
    if (confirm('Vider le tableau ? Toutes les cartes seront supprimées.')) {
      persist([])
    }
  }

  function onDrop(e, columnId) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) moveCard(id, columnId)
  }

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
          Importez un CSV (colonnes libres : nom, téléphone, entreprise, email, notes…) —
          chaque ligne devient une carte dans « À appeler ».
        </p>
      )}
      {!loaded && <p className="hint">Chargement du tableau…</p>}

      <main className="board">
        {COLUMNS.map((col) => {
          let list = cards.filter((c) => c.column === col.id)
          if (col.id === 'followup') list = sortByFollowUp(list)
          return (
            <section
              key={col.id}
              className={`column ${col.id} ${dragOver === col.id ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOver !== col.id) setDragOver(col.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null)
              }}
              onDrop={(e) => onDrop(e, col.id)}
              data-testid={`col-${col.id}`}
            >
              <h2 className="column-title">
                {col.title} <span className="badge">{list.length}</span>
              </h2>
              <div className="cards">
                {list.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    onMove={moveCard}
                    onSetFollowUp={setFollowUp}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}

function StatusPill({ status }) {
  const label = {
    online: 'En ligne',
    offline: 'Hors ligne',
    denied: 'Accès refusé',
    connecting: 'Connexion…',
  }[status]
  const title = {
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

// Les dates sont stockées au format du champ natif (YYYY-MM-DDTHH:mm),
// donc triables telles quelles en ordre lexicographique.
function sortByFollowUp(list) {
  return [...list].sort((a, b) => {
    if (!a.followUpAt) return b.followUpAt ? 1 : 0
    if (!b.followUpAt) return -1
    return a.followUpAt.localeCompare(b.followUpAt)
  })
}

function formatFollowUp(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const p = (n) => String(n).padStart(2, '0')
  return `Relance le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`
}

function FollowUp({ card, onSet }) {
  const inputRef = useRef(null)
  const [fallback, setFallback] = useState(false)

  function openPicker() {
    const el = inputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      // showPicker() refusé (navigateur ancien, hors geste utilisateur)
    }
    // Repli : on affiche le champ natif en clair.
    setFallback(true)
    setTimeout(() => el.focus(), 0)
  }

  const late = card.followUpAt && new Date(card.followUpAt).getTime() < Date.now()

  return (
    <div className="relance">
      <input
        ref={inputRef}
        type="datetime-local"
        className={`relance-input ${fallback ? 'visible' : ''}`}
        value={card.followUpAt || ''}
        onChange={(e) => onSet(card.id, e.target.value)}
        aria-label="Date et heure de relance"
      />
      {card.followUpAt ? (
        <>
          <button
            type="button"
            className={`relance-date ${late ? 'late' : ''}`}
            onClick={openPicker}
            title="Modifier la date de relance"
          >
            {formatFollowUp(card.followUpAt)}
          </button>
          <button
            type="button"
            className="relance-clear"
            onClick={() => onSet(card.id, '')}
            title="Effacer la relance"
            aria-label="Effacer la relance"
          >
            ×
          </button>
        </>
      ) : (
        <button type="button" className="relance-set" onClick={openPicker}>
          Fixer une relance
        </button>
      )}
    </div>
  )
}

function Card({ card, onMove, onSetFollowUp }) {
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
      <div className="card-name">{card.name}</div>
      {card.phone && (
        <a className="card-phone" href={`tel:${card.phone.replace(/[^+\d]/g, '')}`}>
          {card.phone}
        </a>
      )}
      {card.company && <div className="card-company">{card.company}</div>}
      {card.email && <div className="card-extra">{card.email}</div>}
      {card.extras?.map((f) => (
        <div className="card-extra" key={f.label}>
          <span className="label">{f.label} :</span> {f.value}
        </div>
      ))}
      {card.column === 'followup' && (
        <FollowUp card={card} onSet={onSetFollowUp} />
      )}
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
