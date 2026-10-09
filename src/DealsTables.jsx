import { useMemo, useState } from 'react'
import {
  ASSIGNEES,
  HEATS,
  LOSS_REASONS,
  STATUSES,
  STATUS_LOST,
  STATUS_WON,
  dealTotal,
  formatDate,
  formatEuros,
  heatLabel,
  monthKey,
  monthLabel,
  statusLabel,
} from './deals.js'

const normalize = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Colonnes triables de « Tous les deals ». `value` sert au tri, `render` à
// l'affichage : trier sur le montant ne doit pas trier « 10 000 € » comme du
// texte.
const COLUMNS = [
  { id: 'agence', label: 'Agence', value: (d) => normalize(d.agence), render: (d) => d.agence },
  { id: 'ville', label: 'Ville', value: (d) => normalize(d.ville), render: (d) => d.ville || '—' },
  { id: 'closer', label: 'Closer', value: (d) => normalize(d.closer), render: (d) => d.closer },
  { id: 'state', label: 'Étiquette', value: (d) => normalize(d.state), render: (d) => d.state },
  {
    id: 'heat',
    label: 'Chaleur',
    value: (d) => HEATS.findIndex((h) => h.id === d.heat),
    render: (d) => <span className={`heat-pill heat-${d.heat}`}>{heatLabel(d.heat)}</span>,
  },
  { id: 'total', label: 'Offre', value: (d) => dealTotal(d), render: (d) => (dealTotal(d) > 0 ? formatEuros(dealTotal(d)) : '—'), numeric: true },
  {
    id: 'next',
    label: 'Prochaine action',
    value: (d) => d.nextActionDate || '9999',
    render: (d) => (d.nextActionDate ? formatDate(d.nextActionDate) : 'À planifier'),
  },
  { id: 'status', label: 'Statut', value: (d) => d.status, render: (d) => statusLabel(d.status) },
]

export function AllDeals({ deals, onOpen }) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: 'all', closer: 'all', heat: 'all', ville: 'all' })
  const [sort, setSort] = useState({ id: 'next', asc: true })

  const villes = useMemo(() => {
    const set = new Set(deals.map((d) => d.ville).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [deals])

  const rows = useMemo(() => {
    const term = normalize(search)
    const column = COLUMNS.find((c) => c.id === sort.id) || COLUMNS[0]
    const list = deals.filter((d) => {
      if (filters.status !== 'all' && d.status !== filters.status) return false
      if (filters.closer !== 'all' && d.closer !== filters.closer) return false
      if (filters.heat !== 'all' && d.heat !== filters.heat) return false
      if (filters.ville !== 'all' && d.ville !== filters.ville) return false
      if (term && !normalize(d.agence).includes(term)) return false
      return true
    })
    return list.sort((a, b) => {
      const va = column.value(a)
      const vb = column.value(b)
      const cmp = column.numeric ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return sort.asc ? cmp : -cmp
    })
  }, [deals, filters, search, sort])

  function toggleSort(id) {
    setSort((s) => (s.id === id ? { id, asc: !s.asc } : { id, asc: true }))
  }

  return (
    <div className="deals-view">
      <div className="deals-filters">
        <input
          type="text"
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une agence…"
          aria-label="Rechercher une agence"
        />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Filtrer par statut">
          <option value="all">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filters.closer} onChange={(e) => setFilters({ ...filters, closer: e.target.value })} aria-label="Filtrer par closer">
          <option value="all">Tous les closers</option>
          {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.heat} onChange={(e) => setFilters({ ...filters, heat: e.target.value })} aria-label="Filtrer par chaleur">
          <option value="all">Toutes les chaleurs</option>
          {HEATS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
        <select value={filters.ville} onChange={(e) => setFilters({ ...filters, ville: e.target.value })} aria-label="Filtrer par ville">
          <option value="all">Toutes les villes</option>
          {villes.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="count">{rows.length} deal{rows.length > 1 ? 's' : ''}</span>
      </div>

      <div className="deals-table-wrap">
        <table className="deals-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.id}>
                  <button type="button" className="th-sort" onClick={() => toggleSort(c.id)}>
                    {c.label}{sort.id === c.id ? (sort.asc ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="column-empty">Aucun deal ne correspond.</td></tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} onClick={() => onOpen(d.id)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(d.id) }}>
                {COLUMNS.map((c) => <td key={c.id} data-label={c.label}>{c.render(d)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Historique des deals clos + les trois chiffres qui en découlent.
export function ClosedDeals({ deals, onOpen }) {
  const closed = useMemo(
    () => deals.filter((d) => d.status !== 'open')
      .sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')),
    [deals]
  )

  const byMonth = useMemo(() => {
    const map = new Map()
    for (const d of closed) {
      if (d.status !== STATUS_WON) continue
      const key = monthKey(d.closedAt) || 'sans-date'
      map.set(key, (map.get(key) || 0) + dealTotal(d))
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [closed])

  // Taux de closing : signés / (signés + perdus). Les deals encore en cours
  // n'entrent pas au dénominateur, ils ne sont pas encore tranchés.
  const byCloser = useMemo(() => {
    const map = new Map()
    for (const d of closed) {
      const row = map.get(d.closer) || { won: 0, lost: 0, revenue: 0 }
      if (d.status === STATUS_WON) { row.won++; row.revenue += dealTotal(d) } else row.lost++
      map.set(d.closer, row)
    }
    return [...map.entries()]
      .map(([closer, r]) => ({ closer, ...r, rate: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate || b.won - a.won)
  }, [closed])

  const byReason = useMemo(() => {
    const lost = closed.filter((d) => d.status === STATUS_LOST)
    return LOSS_REASONS
      .map((reason) => ({ reason, count: lost.filter((d) => d.lossReason === reason).length }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((r) => ({ ...r, share: Math.round((r.count / lost.length) * 100) }))
  }, [closed])

  return (
    <div className="deals-view">
      <div className="closed-grid">
        <section className="closed-box">
          <h3>CA signé par mois</h3>
          {byMonth.length === 0 && <p className="column-empty">Aucune signature pour l'instant.</p>}
          <ul className="closed-list">
            {byMonth.map(([key, amount]) => (
              <li key={key}><span>{monthLabel(key)}</span><strong>{formatEuros(amount)}</strong></li>
            ))}
          </ul>
        </section>

        <section className="closed-box">
          <h3>Taux de closing par closer</h3>
          {byCloser.length === 0 && <p className="column-empty">Aucun deal clos.</p>}
          <ul className="closed-list">
            {byCloser.map((r) => (
              <li key={r.closer}>
                <span>{r.closer}</span>
                <strong>{r.rate} %</strong>
                <span className="closed-detail">{r.won} signé{r.won > 1 ? 's' : ''} / {r.won + r.lost} clos · {formatEuros(r.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="closed-box">
          <h3>Motifs de perte</h3>
          {byReason.length === 0 && <p className="column-empty">Aucun deal perdu.</p>}
          <ul className="closed-list">
            {byReason.map((r) => (
              <li key={r.reason}>
                <span>{r.reason}</span>
                <strong>{r.count}</strong>
                <span className="closed-detail">{r.share} %</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="deals-table-wrap">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Agence</th><th>Closer</th><th>Statut</th><th>Motif</th><th>Montant</th><th>Commission</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {closed.length === 0 && <tr><td colSpan={7} className="column-empty">Aucun deal clos.</td></tr>}
            {closed.map((d) => (
              <tr key={d.id} onClick={() => onOpen(d.id)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(d.id) }}>
                <td data-label="Agence">{d.agence}</td>
                <td data-label="Closer">{d.closer}</td>
                <td data-label="Statut">
                  <span className={`status-pill ${d.status}`}>{statusLabel(d.status)}</span>
                </td>
                <td data-label="Motif">{d.lossReason || '—'}</td>
                <td data-label="Montant">{dealTotal(d) > 0 ? formatEuros(dealTotal(d)) : '—'}</td>
                <td data-label="Commission">{d.commission > 0 ? formatEuros(d.commission) : '—'}</td>
                <td data-label="Date">{d.closedAt ? formatDate(d.closedAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
