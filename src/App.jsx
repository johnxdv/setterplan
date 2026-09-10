import { useEffect, useRef, useState } from 'react'
import { parseContacts } from './csv.js'

const STORAGE_KEY = 'kanban-appels-v1'

const COLUMNS = [
  { id: 'todo', title: 'À appeler', accent: '#7dabff' },
  { id: 'booked', title: 'Rendez-vous booké', accent: '#4ade80' },
  { id: 'followup', title: 'À relancer', accent: '#fde047' },
  { id: 'dead', title: 'Mort', accent: '#fca5a5' },
]

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids = new Set(COLUMNS.map((c) => c.id))
    return parsed
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({ ...c, column: ids.has(c.column) ? c.column : 'todo' }))
  } catch {
    return []
  }
}

export default function App() {
  const [cards, setCards] = useState(loadCards)
  const [dragOver, setDragOver] = useState(null)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
  }, [cards])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const contacts = parseContacts(await file.text())
      if (contacts.length === 0) {
        setError('Aucune ligne exploitable dans ce fichier.')
      } else {
        setCards((prev) => [...prev, ...contacts])
      }
    } catch {
      setError('Impossible de lire ce fichier CSV.')
    }
    e.target.value = ''
  }

  function moveCard(id, column) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, column } : c)))
  }

  function reset() {
    if (cards.length === 0) return
    if (confirm('Vider le tableau ? Toutes les cartes seront supprimées.')) {
      setCards([])
      localStorage.removeItem(STORAGE_KEY)
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

      {error && <p className="error">{error}</p>}
      {cards.length === 0 && !error && (
        <p className="hint">
          Importez un CSV (colonnes libres : nom, téléphone, entreprise, email, notes…) —
          chaque ligne devient une carte dans « À appeler ».
        </p>
      )}

      <main className="board">
        {COLUMNS.map((col) => {
          const list = cards.filter((c) => c.column === col.id)
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
                  <Card key={card.id} card={card} onMove={moveCard} />
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}

function Card({ card, onMove }) {
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
