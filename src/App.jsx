import { useCallback, useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { SPACES, getSpace } from './spaces.js'
import { boardRefFor } from './firebase.js'
import Board from './Board.jsx'

// Navigation par ancre : « #/ » = menu des espaces, « #/victor » = tableau de
// Victor. L'URL reste partageable, le bouton Précédent du navigateur ramène
// au menu, et un rechargement rouvre le même espace.
function spaceIdFromHash() {
  const id = window.location.hash.replace(/^#\/?/, '').trim()
  return getSpace(id) ? id : null
}

export default function App() {
  const [spaceId, setSpaceId] = useState(spaceIdFromHash)

  useEffect(() => {
    const onHashChange = () => setSpaceId(spaceIdFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const openSpace = useCallback((id) => { window.location.hash = `#/${id}` }, [])
  const backToMenu = useCallback(() => { window.location.hash = '#/' }, [])

  const space = spaceId ? getSpace(spaceId) : null
  if (!space) return <SpaceMenu onOpen={openSpace} />

  // key={space.id} : changer d'espace remonte entièrement le tableau, donc
  // aucun contact, filtre ou recherche d'un setter ne peut survivre à la
  // bascule vers un autre.
  return <Board key={space.id} space={space} onBack={backToMenu} />
}

// Page d'accueil : un espace par setter. Le compteur de contacts est lu en
// direct sur le document de chaque espace (lecture seule).
function SpaceMenu({ onOpen }) {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    const unsubscribes = SPACES.map((s) =>
      onSnapshot(
        boardRefFor(s.id),
        (snap) => {
          const cards = snap.exists() ? snap.data().cards : []
          setCounts((prev) => ({ ...prev, [s.id]: Array.isArray(cards) ? cards.length : 0 }))
        },
        () => setCounts((prev) => ({ ...prev, [s.id]: null }))
      )
    )
    return () => unsubscribes.forEach((u) => u())
  }, [])

  return (
    <div className="menu">
      <header className="menu-header">
        <h1>Planning d'appel</h1>
        <p className="menu-sub">Choisissez un espace de travail.</p>
      </header>
      <div className="menu-grid">
        {SPACES.map((s) => {
          const count = counts[s.id]
          return (
            <button key={s.id} type="button" className="space-card" onClick={() => onOpen(s.id)}>
              <span className="space-card-initial" aria-hidden="true">{s.name.slice(0, 1)}</span>
              <span className="space-card-name">{s.name}</span>
              <span className="space-card-count">
                {count == null
                  ? '—'
                  : `${count} contact${count > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
      </div>
      <p className="menu-foot">
        Chaque espace a ses propres contacts : une action dans l'un n'affecte jamais les autres.
      </p>
    </div>
  )
}
