import { useEffect, useMemo, useState } from 'react'
import {
  ASSIGNEES,
  DEAL_STATES,
  DEFAULT_HEAT,
  DEFAULT_STATE,
  HEATS,
  LOSS_REASONS,
  STATUS_LOST,
  STATUS_OPEN,
  STATUS_WON,
  UNASSIGNED,
  addDays,
  dealLinesTotal,
  dealTotal,
  formatDate,
  formatEuros,
  isOpen,
  nextMonday,
  statusLabel,
  todayIso,
} from './deals.js'

const euros = (value) => {
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Panneau latéral : toute la fiche, modifiable, et l'historique complet.
// Les champs texte s'enregistrent en quittant le champ, les listes au choix :
// on n'écrit pas dans Firestore à chaque frappe.
export default function DealPanel({ deal, author, today, onClose, onPersist, onPersistWithHistory }) {
  const [draft, setDraft] = useState(deal)
  const [modal, setModal] = useState(null) // done | won | lost

  useEffect(() => { setDraft(deal) }, [deal.id, deal.updatedAt])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !modal) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, modal])

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  // Enregistre si quelque chose a bougé ; sinon on ne touche pas au document.
  function commit(patch) {
    const next = { ...draft, ...patch }
    const changed = Object.keys(patch).some((k) => deal[k] !== next[k])
    setDraft(next)
    if (changed) onPersist(next)
  }

  const total = dealTotal(draft)
  const lines = dealLinesTotal(draft)
  const needsNextAction = isOpen(draft) && (!draft.nextActionLabel.trim() || !draft.nextActionDate)

  const history = useMemo(() => [...deal.history].reverse(), [deal.history])

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="deal-panel" role="dialog" aria-label={`Fiche ${deal.agence}`}>
        <header className="panel-header">
          <div>
            <h2>{draft.agence}</h2>
            <p className="panel-sub">
              {statusLabel(draft.status)}
              {draft.status === STATUS_LOST && draft.lossReason ? ` — ${draft.lossReason}` : ''}
              {draft.status === STATUS_WON && draft.closedAt ? ` le ${formatDate(draft.closedAt)}` : ''}
              {' · '}{formatEuros(total)}
            </p>
          </div>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Fermer la fiche">✕</button>
        </header>

        {isOpen(draft) && (
          <div className="panel-actions">
            <button type="button" className="btn primary" onClick={() => setModal('done')}>Fait</button>
            <button type="button" className="btn won" onClick={() => setModal('won')}>Signé</button>
            <button type="button" className="btn lost" onClick={() => setModal('lost')}>Perdu</button>
          </div>
        )}
        {!isOpen(draft) && (
          <div className="panel-actions">
            <button
              type="button"
              className="btn"
              onClick={() => onPersistWithHistory(
                { ...draft, status: STATUS_OPEN, lossReason: '', closedAt: '' },
                'Deal rouvert'
              )}
            >
              Rouvrir le deal
            </button>
          </div>
        )}

        <div className="panel-body">
          {needsNextAction && (
            <p className="panel-warning">
              Prochaine action incomplète : un deal en cours doit avoir un texte et une date.
            </p>
          )}

          <Section title="Prochaine action">
            <Field label="À faire">
              <input
                type="text"
                value={draft.nextActionLabel}
                onChange={(e) => set({ nextActionLabel: e.target.value })}
                onBlur={() => commit({ nextActionLabel: draft.nextActionLabel })}
                placeholder="Ex. rappeler pour poser un 2e RDV"
              />
            </Field>
            <div className="field-row">
              <Field label="Date">
                <input
                  type="date"
                  value={draft.nextActionDate}
                  onChange={(e) => commit({ nextActionDate: e.target.value })}
                />
              </Field>
              <Field label="Heure (facultative)">
                <input
                  type="time"
                  value={draft.nextActionTime}
                  onChange={(e) => commit({ nextActionTime: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          <Section title="Agence">
            <Field label="Nom de l'agence">
              <input
                type="text"
                value={draft.agence}
                onChange={(e) => set({ agence: e.target.value })}
                onBlur={() => commit({ agence: draft.agence.trim() || 'Sans nom' })}
              />
            </Field>
            <Field label="Ville">
              <input
                type="text"
                value={draft.ville}
                onChange={(e) => set({ ville: e.target.value })}
                onBlur={() => commit({ ville: draft.ville.trim() })}
              />
            </Field>
          </Section>

          <Section title="Contact">
            <Field label="Nom">
              <input type="text" value={draft.contactName} onChange={(e) => set({ contactName: e.target.value })} onBlur={() => commit({ contactName: draft.contactName.trim() })} />
            </Field>
            <div className="field-row">
              <Field label="Téléphone">
                <input type="tel" value={draft.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} onBlur={() => commit({ contactPhone: draft.contactPhone.trim() })} />
              </Field>
              <Field label="E-mail">
                <input type="email" value={draft.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} onBlur={() => commit({ contactEmail: draft.contactEmail.trim() })} />
              </Field>
            </div>
            {draft.contactPhone && (
              <a className="panel-call" href={`tel:${draft.contactPhone.replace(/[^\d+]/g, '')}`}>Appeler {draft.contactPhone}</a>
            )}
          </Section>

          <Section title="Suivi">
            <div className="field-row">
              <Field label="Setter">
                <select value={draft.setter} onChange={(e) => commit({ setter: e.target.value })}>
                  {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Closer">
                <select value={draft.closer} onChange={(e) => commit({ closer: e.target.value })}>
                  {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
            <div className="field-row">
              <Field label="Étiquette d'état">
                <select value={draft.state} onChange={(e) => commit({ state: e.target.value })}>
                  {DEAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Chaleur">
                <select value={draft.heat} onChange={(e) => commit({ heat: e.target.value })}>
                  {HEATS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Offre">
            <div className="field-row">
              <Field label="Logiciel (€)">
                <input type="number" min="0" step="100" value={draft.amountSoftware || ''} onChange={(e) => set({ amountSoftware: euros(e.target.value) })} onBlur={() => commit({ amountSoftware: draft.amountSoftware })} />
              </Field>
              <Field label="Site (€)">
                <input type="number" min="0" step="100" value={draft.amountSite || ''} onChange={(e) => set({ amountSite: euros(e.target.value) })} onBlur={() => commit({ amountSite: draft.amountSite })} />
              </Field>
              <Field label="Options (€)">
                <input type="number" min="0" step="100" value={draft.amountOptions || ''} onChange={(e) => set({ amountOptions: euros(e.target.value) })} onBlur={() => commit({ amountOptions: draft.amountOptions })} />
              </Field>
            </div>
            <p className="panel-total">
              Total : <strong>{formatEuros(total)}</strong>
              {draft.amountTotal ? ' (prix package, saisi à la main)' : ' (calculé)'}
              {draft.amountTotal && lines > 0 && lines !== draft.amountTotal
                ? ` — somme des lignes : ${formatEuros(lines)}`
                : ''}
            </p>
            <div className="field-row">
              <Field label="Total forcé (offre package, vide = calculé)">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={draft.amountTotal ?? ''}
                  onChange={(e) => set({ amountTotal: e.target.value === '' ? null : euros(e.target.value) })}
                  onBlur={() => commit({ amountTotal: draft.amountTotal })}
                />
              </Field>
              <Field label="Commission setter (€)">
                <input type="number" min="0" step="50" value={draft.commission || ''} onChange={(e) => set({ commission: euros(e.target.value) })} onBlur={() => commit({ commission: draft.commission })} />
              </Field>
            </div>
          </Section>

          <Section title={`Historique (${history.length})`}>
            <ol className="history">
              {history.length === 0 && <li className="detail-empty">Aucune ligne pour l'instant.</li>}
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="history-line">
                  <span className="history-meta">{formatStamp(h.at)} · {h.author}</span>
                  <span className="history-note">{h.note}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </aside>

      {modal === 'done' && (
        <DoneModal
          deal={draft}
          today={today}
          onCancel={() => setModal(null)}
          onConfirm={({ note, state, date, time, label }) => {
            onPersistWithHistory(
              { ...draft, state, nextActionDate: date, nextActionTime: time, nextActionLabel: label },
              `${note} → ${state}, prochaine action le ${date ? formatDate(date) : 'à planifier'}`
            )
            setModal(null)
          }}
        />
      )}
      {modal === 'won' && (
        <WonModal
          deal={draft}
          today={today}
          onCancel={() => setModal(null)}
          onConfirm={({ date, note }) => {
            onPersistWithHistory(
              { ...draft, status: STATUS_WON, closedAt: date, nextActionDate: '', nextActionTime: '' },
              `Signé le ${formatDate(date)} pour ${formatEuros(dealTotal(draft))}${note ? ` — ${note}` : ''}`
            )
            setModal(null)
            onClose()
          }}
        />
      )}
      {modal === 'lost' && (
        <LostModal
          onCancel={() => setModal(null)}
          onConfirm={({ reason, note }) => {
            onPersistWithHistory(
              { ...draft, status: STATUS_LOST, lossReason: reason, closedAt: today, nextActionDate: '', nextActionTime: '' },
              `Perdu (${reason})${note ? ` — ${note}` : ''}`
            )
            setModal(null)
            onClose()
          }}
        />
      )}
    </>
  )
}

function formatStamp(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Section({ title, children }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

// « Fait » : la note est obligatoire, c'est elle qui alimente l'historique.
function DoneModal({ deal, today, onCancel, onConfirm }) {
  const [note, setNote] = useState('')
  const [state, setState] = useState(deal.state)
  const [label, setLabel] = useState(deal.nextActionLabel)
  const [date, setDate] = useState(addDays(today, 1))
  const [time, setTime] = useState('')

  const shortcuts = [
    { id: 'tomorrow', label: 'Demain', value: addDays(today, 1) },
    { id: 'j3', label: 'J+3', value: addDays(today, 3) },
    { id: 'monday', label: 'Lundi prochain', value: nextMonday(today) },
  ]

  return (
    <Modal title={`Action faite — ${deal.agence}`} onCancel={onCancel}>
      <Field label="Qu'avez-vous fait ? (obligatoire)">
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
      <Field label="Nouvelle étiquette d'état">
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {DEAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Prochaine action">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. relancer par téléphone" />
      </Field>
      <div className="date-shortcuts">
        {shortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ghost ${date === s.value ? 'on' : ''}`}
            onClick={() => setDate(s.value)}
          >
            {s.label} <span className="shortcut-date">{formatDate(s.value)}</span>
          </button>
        ))}
      </div>
      <div className="field-row">
        <Field label="Date de la prochaine action">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Heure (facultative)">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        <button
          type="button"
          className="btn primary"
          disabled={!note.trim()}
          onClick={() => onConfirm({ note: note.trim(), state, date, time, label: label.trim() })}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  )
}

function WonModal({ deal, today, onCancel, onConfirm }) {
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  return (
    <Modal title={`Signé — ${deal.agence}`} onCancel={onCancel}>
      <p className="modal-sub">Montant enregistré : {formatEuros(dealTotal(deal))}. Le deal sort du calendrier.</p>
      <Field label="Date de signature">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (facultative)">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn won" disabled={!date} onClick={() => onConfirm({ date, note: note.trim() })}>
          Confirmer la signature
        </button>
      </div>
    </Modal>
  )
}

function LostModal({ onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  return (
    <Modal title="Deal perdu" onCancel={onCancel}>
      <Field label="Motif (obligatoire)">
        <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
          <option value="">Choisir un motif…</option>
          {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Note (facultative)">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn lost" disabled={!reason} onClick={() => onConfirm({ reason, note: note.trim() })}>
          Confirmer la perte
        </button>
      </div>
    </Modal>
  )
}

function Modal({ title, onCancel, children }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

// Création manuelle d'une fiche. Seul le nom de l'agence est exigé : le reste
// se complète dans le panneau, une fiche incomplète vaut mieux qu'un deal
// oublié parce que le formulaire était trop long.
export function NewDealModal({ onCancel, onCreate }) {
  const today = todayIso()
  const [form, setForm] = useState({
    agence: '',
    ville: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    setter: UNASSIGNED,
    closer: UNASSIGNED,
    state: DEFAULT_STATE,
    heat: DEFAULT_HEAT,
    amountSoftware: 0,
    amountSite: 0,
    amountOptions: 0,
    nextActionLabel: '',
    nextActionDate: addDays(today, 1),
  })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal title="Nouveau deal" onCancel={onCancel}>
      <Field label="Nom de l'agence (obligatoire)">
        <input type="text" value={form.agence} onChange={(e) => set({ agence: e.target.value })} autoFocus />
      </Field>
      <div className="field-row">
        <Field label="Ville">
          <input type="text" value={form.ville} onChange={(e) => set({ ville: e.target.value })} />
        </Field>
        <Field label="Contact">
          <input type="text" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Téléphone">
          <input type="tel" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Setter">
          <select value={form.setter} onChange={(e) => set({ setter: e.target.value })}>
            {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Closer">
          <select value={form.closer} onChange={(e) => set({ closer: e.target.value })}>
            {ASSIGNEES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Étiquette d'état">
          <select value={form.state} onChange={(e) => set({ state: e.target.value })}>
            {DEAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Chaleur">
          <select value={form.heat} onChange={(e) => set({ heat: e.target.value })}>
            {HEATS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Logiciel (€)">
          <input type="number" min="0" step="100" value={form.amountSoftware || ''} onChange={(e) => set({ amountSoftware: euros(e.target.value) })} />
        </Field>
        <Field label="Site (€)">
          <input type="number" min="0" step="100" value={form.amountSite || ''} onChange={(e) => set({ amountSite: euros(e.target.value) })} />
        </Field>
        <Field label="Options (€)">
          <input type="number" min="0" step="100" value={form.amountOptions || ''} onChange={(e) => set({ amountOptions: euros(e.target.value) })} />
        </Field>
      </div>
      <Field label="Prochaine action">
        <input type="text" value={form.nextActionLabel} onChange={(e) => set({ nextActionLabel: e.target.value })} placeholder="Ex. appeler pour fixer un RDV" />
      </Field>
      <Field label="Date de la prochaine action">
        <input type="date" value={form.nextActionDate} onChange={(e) => set({ nextActionDate: e.target.value })} />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        <button
          type="button"
          className="btn primary"
          disabled={!form.agence.trim()}
          onClick={() => onCreate({ ...form, agence: form.agence.trim() })}
        >
          Créer la fiche
        </button>
      </div>
    </Modal>
  )
}
