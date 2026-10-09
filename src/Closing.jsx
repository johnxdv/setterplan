import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ASSIGNEES,
  DEAL_STATES,
  HEATS,
  UNASSIGNED,
  addDays,
  addMonths,
  dayName,
  dayNumber,
  dealAuthor,
  dealTotal,
  daysBetween,
  formatDate,
  formatEuros,
  heatLabel,
  historyEntry,
  isLate,
  isOpen,
  isUnplanned,
  makeDeal,
  monthLabel,
  monthKey,
  pipelineStats,
  sameMonth,
  startOfMonth,
  startOfWeek,
  todayIso,
} from './deals.js'
import { saveDeal, seedDealsOnce, watchDeals } from './dealsStore.js'
import { buildSeedDeals } from './seedDeals.js'
import DealPanel, { NewDealModal } from './DealPanel.jsx'
import { AllDeals, ClosedDeals } from './DealsTables.jsx'

const TABS = [
  { id: 'calendar', label: 'Calendrier' },
  { id: 'all', label: 'Tous les deals' },
  { id: 'closed', label: 'Signés et perdus' },
]

// Nombre de cartes visibles dans une case du mois avant le « +N ».
const CARDS_PER_DAY = 3

export default function Closing({ onBack }) {
  const [deals, setDeals] = useState([])
  const [status, setStatus] = useState('connecting')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('calendar')
  const [selectedId, setSelectedId] = useState(null)
  const [newDealOpen, setNewDealOpen] = useState(false)

  const today = todayIso()
  const [monthStart, setMonthStart] = useState(() => startOfMonth(todayIso()))
  const [filters, setFilters] = useState({ closer: 'all', heat: 'all', state: 'all' })
  const seedAttempted = useRef(false)
  const planAttempted = useRef(false)

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

  // La date de prochaine action est obligatoire pour un deal en cours. Les
  // fiches plus anciennes qui n'en ont pas sont datées d'aujourd'hui : elles
  // remontent dans « À faire aujourd'hui » au lieu de disparaître.
  useEffect(() => {
    if (!loaded || planAttempted.current || status === 'denied') return
    const orphans = deals.filter(isUnplanned)
    if (orphans.length === 0) return
    planAttempted.current = true
    for (const deal of orphans) {
      saveDeal({
        ...deal,
        nextActionDate: today,
        history: [...deal.history, historyEntry(dealAuthor(deal), 'Prochaine action datée à aujourd\'hui (aucune date)')],
      }).catch(() => setStatus('offline'))
    }
    setNotice(`${orphans.length} deal${orphans.length > 1 ? 's' : ''} sans date replacé${orphans.length > 1 ? 's' : ''} sur aujourd'hui.`)
  }, [loaded, status, deals, today])

  const persist = useCallback((deal) => {
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? deal : d)))
    saveDeal(deal).catch((err) => {
      setStatus(err?.code === 'permission-denied' ? 'denied' : 'offline')
    })
  }, [])

  // Toute modification suivie d'une trace, signée par le closer du deal.
  // L'historique n'est jamais réécrit, on ne fait qu'y ajouter une ligne.
  const persistWithHistory = useCallback(
    (deal, note) => {
      persist({ ...deal, history: [...deal.history, historyEntry(dealAuthor(deal), note)] })
    },
    [persist]
  )

  const createDeal = useCallback((partial) => {
    const deal = makeDeal(partial)
    deal.history = [historyEntry(dealAuthor(deal), 'Fiche créée')]
    setDeals((prev) => [...prev, deal])
    saveDeal(deal).catch(() => setStatus('offline'))
    setSelectedId(deal.id)
    return deal
  }, [])

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
    if (!deal || !date || deal.nextActionDate === date) return
    persistWithHistory(
      { ...deal, nextActionDate: date },
      `Reporté du ${formatDate(deal.nextActionDate)} au ${formatDate(date)}`
    )
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
        <MonthCalendar
          deals={visible}
          today={today}
          monthStart={monthStart}
          onMonthStart={setMonthStart}
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
      <Stat label="CA signé total" value={formatEuros(stats.signedTotal)} sub="toutes périodes" />
      <Stat label="CA signé ce mois" value={formatEuros(stats.signedThisMonth)} />
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

// Vue mois (lundi → dimanche) avec, à gauche, ce qu'il y a à faire
// aujourd'hui. Un deal en retard n'apparaît plus dans la grille : il reste
// dans la colonne de gauche tant qu'il n'est pas traité ou reporté.
function MonthCalendar({ deals, today, monthStart, onMonthStart, filters, onFilters, onOpen, onMove }) {
  const [dragOver, setDragOver] = useState(null)
  const [dayModal, setDayModal] = useState(null)
  // Vue jour sur téléphone : la grille du mois n'y est pas lisible.
  const [dayCursor, setDayCursor] = useState(today)

  useEffect(() => {
    if (!sameMonth(dayCursor, monthStart)) setDayCursor(monthStart)
  }, [monthStart])

  const late = useMemo(
    () => deals.filter((d) => isLate(d, today)).sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate)),
    [deals, today]
  )

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

  const todayDeals = byDay.get(today) || []

  // Grille : semaines entières, du lundi qui précède le 1er au dimanche qui
  // suit le dernier jour du mois. Les jours des mois voisins restent
  // affichés, en gris, et acceptent un dépôt (ce sont de vraies dates).
  const weeks = useMemo(() => {
    const nextMonth = addMonths(monthStart, 1)
    const out = []
    // Tant que le lundi de la semaine précède le 1er du mois suivant, la
    // semaine contient au moins un jour du mois : on s'arrête juste après.
    for (let cursor = startOfWeek(monthStart); cursor < nextMonth; cursor = addDays(cursor, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
    }
    return out
  }, [monthStart])

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

  const cursorDeals = byDay.get(dayCursor) || []

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="btn ghost" onClick={() => onMonthStart(addMonths(monthStart, -1))} aria-label="Mois précédent">←</button>
          <button type="button" className="btn" onClick={() => onMonthStart(startOfMonth(today))}>Aujourd'hui</button>
          <button type="button" className="btn ghost" onClick={() => onMonthStart(addMonths(monthStart, 1))} aria-label="Mois suivant">→</button>
          <span className="cal-week-label cal-month-label">{monthLabel(monthKey(monthStart))}</span>
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

      <div className="cal-body">
        <section
          className={`today-col ${dragOver === 'today' ? 'over' : ''}`}
          {...dropProps('today', today)}
        >
          <h2 className="cal-col-title">
            À faire aujourd'hui <span className="badge">{late.length + todayDeals.length}</span>
          </h2>
          <div className="today-cards">
            {late.length + todayDeals.length === 0 && <p className="column-empty">Rien à faire aujourd'hui.</p>}
            {late.map((deal) => (
              <DealCard key={deal.id} deal={deal} onOpen={onOpen} lateDays={daysBetween(deal.nextActionDate, today)} />
            ))}
            {todayDeals.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
          </div>
        </section>

        <div className="month-grid">
          <div className="month-head">
            {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="month-weeks">
            {weeks.map((week) => (
              <div className="month-week" key={week[0]}>
                {week.map((day) => {
                  const list = byDay.get(day) || []
                  const shown = list.slice(0, CARDS_PER_DAY)
                  const rest = list.length - shown.length
                  return (
                    <div
                      key={day}
                      className={[
                        'month-day',
                        day === today ? 'is-today' : '',
                        sameMonth(day, monthStart) ? '' : 'other-month',
                        dragOver === day ? 'over' : '',
                      ].join(' ').trim()}
                      {...dropProps(day, day)}
                      onClick={() => list.length > 0 && setDayModal(day)}
                      role={list.length > 0 ? 'button' : undefined}
                      tabIndex={list.length > 0 ? 0 : undefined}
                      onKeyDown={(e) => { if (list.length > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDayModal(day) } }}
                    >
                      <span className="month-day-num">{dayNumber(day)}</span>
                      {shown.map((deal) => <CompactCard key={deal.id} deal={deal} />)}
                      {rest > 0 && <span className="month-day-more">+{rest}</span>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <section className="day-view">
          <div className="day-view-nav">
            <button type="button" className="btn ghost" onClick={() => setDayCursor(addDays(dayCursor, -1))} aria-label="Jour précédent">←</button>
            <span className="day-view-label">{dayName(dayCursor)} {dayNumber(dayCursor)}</span>
            <button type="button" className="btn ghost" onClick={() => setDayCursor(addDays(dayCursor, 1))} aria-label="Jour suivant">→</button>
          </div>
          <div className="today-cards">
            {cursorDeals.length === 0 && <p className="column-empty">Rien ce jour-là.</p>}
            {cursorDeals.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
          </div>
        </section>
      </div>

      {dayModal && (
        <div className="modal-overlay" onClick={() => setDayModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{dayName(dayModal)} {dayNumber(dayModal)} {monthLabel(monthKey(dayModal))}</h2>
            <p className="modal-sub">{(byDay.get(dayModal) || []).length} deal(s) à traiter ce jour-là.</p>
            <div className="today-cards day-modal-cards">
              {(byDay.get(dayModal) || []).map((deal) => (
                <DealCard key={deal.id} deal={deal} onOpen={(id) => { setDayModal(null); onOpen(id) }} />
              ))}
            </div>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setDayModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Carte compacte du calendrier : juste de quoi reconnaître le deal d'un coup
// d'œil. Le détail est dans « À faire aujourd'hui » et dans la fiche.
function CompactCard({ deal }) {
  return (
    <span
      className={`compact-card heat-${deal.heat}`}
      draggable
      title={`${deal.agence} — ${deal.state} — ${heatLabel(deal.heat)}`}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span className="deal-heat" aria-hidden="true" />
      <span className="compact-agence">{deal.agence}</span>
    </span>
  )
}

// Carte complète : agence, étiquette, montant, chaleur, initiale du closer,
// heure s'il y en a une, et le retard éventuel.
export function DealCard({ deal, onOpen, lateDays }) {
  const total = dealTotal(deal)
  return (
    <article
      className={`deal-card heat-${deal.heat} ${lateDays > 0 ? 'is-late' : ''}`}
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
        {lateDays > 0 && <span className="late-badge">En retard de {lateDays} j</span>}
        <span className="deal-state">{deal.state}</span>
        {total > 0 && <span className="deal-amount">{formatEuros(total)}</span>}
        {deal.nextActionTime && <span className="deal-time">{deal.nextActionTime}</span>}
      </div>
    </article>
  )
}
