import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEAL_STATES,
  HEATS,
  UNASSIGNED,
  ASSIGNEES,
  addDays,
  dayName,
  dayNumber,
  dealTotal,
  formatDate,
  formatEuros,
  daysBetween,
  heatLabel,
  isLate,
  isOpen,
  isUnplanned,
  historyEntry,
  makeDeal,
  pipelineStats,
  startOfWeek,
  todayIso,
} from './deals.js'
import { saveDeal, seedDealsOnce, watchDeals } from './dealsStore.js'
import { buildSeedDeals } from './seedDeals.js'
import DealPanel, { NewDealModal } from './DealPanel.jsx'
import { AllDeals, ClosedDeals } from './DealsTables.jsx'

// Qui agit : l'outil n'a pas de comptes (un seul mot de passe partagé), donc
// l'auteur des lignes d'historique est choisi une fois ici et mémorisé dans
// le navigateur, comme la zone des espaces setters.
const AUTHOR_KEY = 'setterplan-closing-author'

function readAuthor() {
  try {
    const value = localStorage.getItem(AUTHOR_KEY)
    return ASSIGNEES.includes(value) ? value : UNASSIGNED
  } catch {
    return UNASSIGNED
  }
}

const TABS = [
  { id: 'calendar', label: 'Calendrier' },
  { id: 'all', label: 'Tous les deals' },
  { id: 'closed', label: 'Signés et perdus' },
]

export default function Closing({ onBack }) {
  const [deals, setDeals] = useState([])
  const [status, setStatus] = useState('connecting')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [author, setAuthor] = useState(readAuthor)
  const [tab, setTab] = useState('calendar')
  const [selectedId, setSelectedId] = useState(null)
  const [newDealOpen, setNewDealOpen] = useState(false)

  const today = todayIso()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayIso()))
  const [filters, setFilters] = useState({ closer: 'all', heat: 'all', state: 'all' })
  const seedAttempted = useRef(false)

  useEffect(() => {
    const unsubscribe = watchDeals(
      (next, fromCache) => {
        setDeals(next)
        setStatus(fromCache ? 'offline' : 'online')
        setLoaded(true)
      },
      (err) => {
        setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
        setLoaded(true)
      }
    )
    return unsubscribe
  }, [])

  // Reprise du Google Sheet, une seule fois : seedDealsOnce ne fait rien si le
  // marqueur meta/closingSeed existe déjà, donc supprimer un deal importé ne
  // le fait pas revenir à la prochaine ouverture.
  useEffect(() => {
    if (!loaded || seedAttempted.current || status === 'denied') return
    seedAttempted.current = true
    seedDealsOnce(buildSeedDeals())
      .then((count) => {
        if (count > 0) setNotice(`${count} deals repris du Google Sheet SUIVI DEAL.`)
      })
      .catch((err) => {
        setError(
          err?.code === 'permission-denied'
            ? "Firestore refuse l'écriture dans « deals » : déployez les règles mises à jour."
            : "L'import des deals du Google Sheet a échoué."
        )
      })
  }, [loaded, status])

  const persist = useCallback((deal) => {
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? deal : d)))
    saveDeal(deal).catch((err) => {
      setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
    })
  }, [])

  // Toute modification suivie d'une trace : l'historique n'est jamais réécrit,
  // on ne fait qu'y ajouter une ligne à la fin.
  const persistWithHistory = useCallback(
    (deal, note) => {
      persist({ ...deal, history: [...deal.history, historyEntry(author, note)] })
    },
    [persist, author]
  )

  const createDeal = useCallback(
    (partial) => {
      const deal = makeDeal(partial)
      deal.history = [historyEntry(author, 'Fiche créée')]
      setDeals((prev) => [...prev, deal])
      saveDeal(deal).catch(() => setStatus('offline'))
      setSelectedId(deal.id)
      return deal
    },
    [author]
  )

  function changeAuthor(value) {
    setAuthor(value)
    try { localStorage.setItem(AUTHOR_KEY, value) } catch { /* navigation privée */ }
  }

  const stats = useMemo(() => pipelineStats(deals, today), [deals, today])
  const selected = deals.find((d) => d.id === selectedId) || null

  // Les filtres ne s'appliquent qu'au calendrier : le bandeau de chiffres
  // montre toujours le pipe complet, sinon « pipe en cours » voudrait dire
  // deux choses différentes selon le filtre actif.
  const visible = useMemo(() => {
    return deals.filter((d) => {
      if (!isOpen(d)) return false
      if (filters.closer !== 'all' && d.closer !== filters.closer) return false
      if (filters.heat !== 'all' && d.heat !== filters.heat) return false
      if (filters.state !== 'all' && d.state !== filters.state) return false
      return true
    })
  }, [deals, filters])

  // Report par glisser-déposer : change la date de prochaine action et laisse
  // une ligne d'historique.
  function moveDealTo(id, date) {
    const deal = deals.find((d) => d.id === id)
    if (!deal || deal.nextActionDate === date) return
    const from = deal.nextActionDate ? formatDate(deal.nextActionDate) : 'À planifier'
    const to = date ? formatDate(date) : 'À planifier'
    persistWithHistory({ ...deal, nextActionDate: date }, `Reporté du ${from} au ${to}`)
  }

  return (
    <div className="app closing">
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
            Planning d'appel <span className="space-name">Closing</span>
          </h1>
        </div>
        <div className="actions">
          <ClosingStatus status={status} />
          <label className="author-picker">
            <span>Je suis</span>
            <select value={author} onChange={(e) => changeAuthor(e.target.value)}>
              {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={() => setNewDealOpen(true)}>Nouveau deal</button>
        </div>
      </header>

      {status === 'denied' && (
        <p className="error">
          Firestore refuse l'accès à la collection <code>deals</code> : déployez les règles du
          fichier <code>firestore.rules</code> dans la console Firebase (Firestore Database &gt;
          Règles). Tant que ce n'est pas fait, rien n'est enregistré.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="notice">
          {notice}
          <button type="button" className="notice-close" onClick={() => setNotice('')} aria-label="Masquer">✕</button>
        </p>
      )}

      <StatsBand stats={stats} />

      <nav className="closing-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`closing-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!loaded ? (
        <p className="hint">Chargement des deals…</p>
      ) : tab === 'calendar' ? (
        <WeekCalendar
          deals={visible}
          today={today}
          weekStart={weekStart}
          onWeekStart={setWeekStart}
          filters={filters}
          onFilters={setFilters}
          onOpen={setSelectedId}
          onMove={moveDealTo}
        />
      ) : tab === 'all' ? (
        <AllDeals deals={deals} onOpen={setSelectedId} />
      ) : (
        <ClosedDeals deals={deals} onOpen={setSelectedId} />
      )}

      {selected && (
        <DealPanel
          deal={selected}
          author={author}
          today={today}
          onClose={() => setSelectedId(null)}
          onPersist={persist}
          onPersistWithHistory={persistWithHistory}
        />
      )}
      {newDealOpen && (
        <NewDealModal
          onCancel={() => setNewDealOpen(false)}
          onCreate={(partial) => { createDeal(partial); setNewDealOpen(false) }}
        />
      )}
    </div>
  )
}

function ClosingStatus({ status }) {
  const label = { online: 'En ligne', offline: 'Hors ligne', denied: 'Accès refusé', connecting: 'Connexion…' }[status]
  return <span className={`status ${status}`}><span className="dot" />{label}</span>
}

// Bandeau de chiffres : lecture seule, calculé sur tous les deals.
function StatsBand({ stats }) {
  return (
    <div className="stats-band">
      <Stat label="Pipe en cours" value={formatEuros(stats.pipe)} sub={`${stats.openCount} deal${stats.openCount > 1 ? 's' : ''}`} />
      <Stat label="Pipe pondéré" value={formatEuros(stats.weighted)} sub="selon la chaleur" />
      <Stat label="CA signé ce mois" value={formatEuros(stats.signedThisMonth)} />
      <Stat
        label="Relances en retard"
        value={String(stats.lateCount)}
        tone={stats.lateCount > 0 ? 'alert' : ''}
      />
    </div>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

// Calendrier de la semaine : « En retard » puis lundi → vendredi, le week-end
// seulement s'il porte des cartes, et « À planifier » dessous.
function WeekCalendar({ deals, today, weekStart, onWeekStart, filters, onFilters, onOpen, onMove }) {
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekendDays = useMemo(() => [addDays(weekStart, 5), addDays(weekStart, 6)], [weekStart])

  const late = useMemo(
    () => deals.filter((d) => isLate(d, today)).sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate)),
    [deals, today]
  )
  const unplanned = useMemo(() => deals.filter(isUnplanned), [deals])

  // Une carte en retard reste dans « En retard » : elle ne réapparaît pas
  // aussi dans sa colonne de jour, sinon elle se traiterait deux fois.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const deal of deals) {
      if (!deal.nextActionDate || isLate(deal, today)) continue
      if (!map.has(deal.nextActionDate)) map.set(deal.nextActionDate, [])
      map.get(deal.nextActionDate).push(deal)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.nextActionTime || '99:99').localeCompare(b.nextActionTime || '99:99'))
    }
    return map
  }, [deals, today])

  const weekendCards = weekendDays.flatMap((d) => byDay.get(d) || [])
  const [weekendOpen, setWeekendOpen] = useState(false)
  const [dragOver, setDragOver] = useState(null)

  // Vue jour sur téléphone : un seul jour visible à la fois (CSS), « En
  // retard » restant accessible en premier onglet.
  const inWeek = days.includes(today)
  const [activeDay, setActiveDay] = useState(() => (inWeek ? today : 'late'))
  useEffect(() => { setActiveDay(days.includes(today) ? today : days[0]) }, [weekStart])

  const dropProps = (key, date) => ({
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== key) setDragOver(key) },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) },
    onDrop: (e) => {
      e.preventDefault()
      setDragOver(null)
      const id = e.dataTransfer.getData('text/plain')
      if (id) onMove(id, date)
    },
  })

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="btn ghost" onClick={() => onWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente">←</button>
          <button type="button" className="btn" onClick={() => onWeekStart(startOfWeek(today))}>Aujourd'hui</button>
          <button type="button" className="btn ghost" onClick={() => onWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante">→</button>
          <span className="cal-week-label">
            Semaine du {formatDate(weekStart)} au {formatDate(addDays(weekStart, 6))}
          </span>
        </div>
        <div className="cal-filters">
          <select value={filters.closer} onChange={(e) => onFilters({ ...filters, closer: e.target.value })} aria-label="Filtrer par closer">
            <option value="all">Tous les closers</option>
            {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filters.heat} onChange={(e) => onFilters({ ...filters, heat: e.target.value })} aria-label="Filtrer par chaleur">
            <option value="all">Toutes les chaleurs</option>
            {HEATS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
          <select value={filters.state} onChange={(e) => onFilters({ ...filters, state: e.target.value })} aria-label="Filtrer par étiquette">
            <option value="all">Toutes les étiquettes</option>
            {DEAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <nav className="cal-day-tabs">
        <button type="button" className={`cal-day-tab ${activeDay === 'late' ? 'active' : ''}`} onClick={() => setActiveDay('late')}>
          En retard <span className="badge">{late.length}</span>
        </button>
        {days.map((day) => (
          <button
            key={day}
            type="button"
            className={`cal-day-tab ${activeDay === day ? 'active' : ''} ${day === today ? 'is-today' : ''}`}
            onClick={() => setActiveDay(day)}
          >
            {dayName(day).slice(0, 3)} {dayNumber(day)} <span className="badge">{(byDay.get(day) || []).length}</span>
          </button>
        ))}
        {weekendCards.length > 0 && (
          <button
            type="button"
            className={`cal-day-tab ${activeDay === 'weekend' ? 'active' : ''}`}
            onClick={() => { setActiveDay('weekend'); setWeekendOpen(true) }}
          >
            Week-end <span className="badge">{weekendCards.length}</span>
          </button>
        )}
      </nav>

      <div className="cal-grid">
        <section
          className={`cal-col cal-late ${dragOver === 'late' ? 'over' : ''}`}
          data-day="late"
          data-active={String(activeDay === 'late')}
          {...dropProps('late', today)}
        >
          <h2 className="cal-col-title">
            En retard <span className="badge">{late.length}</span>
          </h2>
          <div className="cal-col-cards">
            {late.length === 0 && <p className="column-empty">Rien en retard</p>}
            {late.map((deal) => (
              <DealCard key={deal.id} deal={deal} onOpen={onOpen} lateDays={daysBetween(deal.nextActionDate, today)} />
            ))}
          </div>
        </section>

        {days.map((day) => {
          const list = byDay.get(day) || []
          return (
            <section
              key={day}
              className={`cal-col ${day === today ? 'is-today' : ''} ${dragOver === day ? 'over' : ''}`}
              data-day={day}
              data-active={String(activeDay === day)}
              {...dropProps(day, day)}
            >
              <h2 className="cal-col-title">
                <span className="cal-day-name">{dayName(day)}</span>
                <span className="cal-day-num">{dayNumber(day)}</span>
                <span className="badge">{list.length}</span>
              </h2>
              <div className="cal-col-cards">
                {list.length === 0 && <p className="column-empty">Vide</p>}
                {list.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
              </div>
            </section>
          )
        })}

        {weekendCards.length > 0 && (
          <section
            className={`cal-col cal-weekend ${weekendOpen ? 'open' : ''}`}
            data-day="weekend"
            data-active={String(activeDay === 'weekend')}
          >
            <button type="button" className="cal-col-title cal-weekend-toggle" onClick={() => setWeekendOpen((v) => !v)}>
              Week-end <span className="badge">{weekendCards.length}</span>
              <span className="cal-weekend-chevron">{weekendOpen ? '▾' : '▸'}</span>
            </button>
            {weekendOpen && (
              <div className="cal-col-cards">
                {weekendDays.map((day) =>
                  (byDay.get(day) || []).map((deal) => (
                    <DealCard key={deal.id} deal={deal} onOpen={onOpen} dayHint={`${dayName(day)} ${dayNumber(day)}`} />
                  ))
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <section
        className={`cal-backlog ${dragOver === 'backlog' ? 'over' : ''}`}
        {...dropProps('backlog', '')}
      >
        <h2 className="cal-col-title">
          À planifier <span className="badge">{unplanned.length}</span>
        </h2>
        <div className="backlog-cards">
          {unplanned.length === 0 && <p className="column-empty">Tous les deals en cours ont une date.</p>}
          {unplanned.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
        </div>
      </section>
    </div>
  )
}

// Carte compacte : agence, étiquette, montant, chaleur, initiale du closer,
// heure s'il y en a une. Le détail complet est dans le panneau latéral.
export function DealCard({ deal, onOpen, lateDays, dayHint }) {
  const total = dealTotal(deal)
  return (
    <article
      className={`deal-card heat-${deal.heat}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('dragging')
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(deal.id) } }}
      role="button"
      tabIndex={0}
    >
      <div className="deal-card-top">
        <span className="deal-heat" title={`Chaleur : ${heatLabel(deal.heat)}`} aria-label={`Chaleur : ${heatLabel(deal.heat)}`} />
        <span className="deal-agence">{deal.agence}</span>
        <span className="deal-closer" title={`Closer : ${deal.closer}`}>
          {deal.closer === UNASSIGNED ? '?' : deal.closer.slice(0, 1)}
        </span>
      </div>
      <div className="deal-card-bottom">
        <span className="deal-state">{deal.state}</span>
        {total > 0 && <span className="deal-amount">{formatEuros(total)}</span>}
        {deal.nextActionTime && <span className="deal-time">{deal.nextActionTime}</span>}
        {dayHint && <span className="deal-time">{dayHint}</span>}
        {lateDays > 0 && <span className="deal-late">{lateDays} j de retard</span>}
      </div>
    </article>
  )
}
