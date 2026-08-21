import { useState } from 'react';
import { motion } from 'framer-motion';
import { DIFFICULTY } from '../game/constants';
import { clearSave, importSave, listSaveMeta, SAVE_SLOT_COUNT } from '../game/save';
import { useGame } from '../store/gameStore';
import type { Difficulty } from '../game/types';

const LOGOS = ['📡', '🛰️', '🌐', '⚡', '🔷', '🦈', '🐙', '🚀'];
const CITIES = [
  { name: 'Marmara', blurb: 'Dense, wealthy, and already contested. The intended way to play.' },
  { name: 'Karadeniz', blurb: 'Spread out and cheaper to license. Fibre runs get long.' },
];

type SaveMeta = NonNullable<ReturnType<typeof listSaveMeta>[number]>;
type ImportStatus = { tone: 'good' | 'bad' | 'info'; text: string };

function saveContext(slot: number, meta: SaveMeta) {
  return `Slot ${slot + 1}: ${meta.company}\n${meta.city} · ${meta.customers.toLocaleString()} customers\nSaved ${new Date(meta.savedAt).toLocaleString()}`;
}

const sameSnapshot = (a: SaveMeta | null, b: SaveMeta | null) =>
  a?.savedAt === b?.savedAt && a?.company === b?.company;

export default function MainMenu() {
  const newGame = useGame((s) => s.newGame);
  const continueGame = useGame((s) => s.continueGame);
  const persistenceError = useGame((s) => s.persistenceError);
  const [metas, setMetas] = useState(() => listSaveMeta());
  const [newSlot, setNewSlot] = useState(() => {
    const empty = listSaveMeta().findIndex((m) => !m);
    return empty < 0 ? 0 : empty;
  });
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState('CoreLink');
  const [logo, setLogo] = useState(LOGOS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [city, setCity] = useState(CITIES[0].name);
  const [importSlot, setImportSlot] = useState(() => {
    const empty = listSaveMeta().findIndex((m) => !m);
    return empty < 0 ? 0 : empty;
  });
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  const deleteSlot = (slot: number, meta: SaveMeta) => {
    if (!window.confirm(`Delete this saved network?\n\n${saveContext(slot, meta)}\n\nThis cannot be undone.`)) return;
    if (!clearSave(slot)) {
      setImportStatus({ tone: 'bad', text: `Slot ${slot + 1} could not be deleted. Check browser storage and try again.` });
      return;
    }
    setMetas(listSaveMeta());
    setImportStatus({ tone: 'good', text: `Slot ${slot + 1} was deleted.` });
  };

  const startNewGame = () => {
    const existing = metas[newSlot];
    if (
      existing &&
      !window.confirm(`Start a new network and overwrite this save?\n\n${saveContext(newSlot, existing)}\n\nThis cannot be undone.`)
    ) return;
    newGame({ companyName: name.trim() || 'CoreLink', logo, difficulty, cityName: city }, newSlot);
  };

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#0b1218]">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative grid w-[1040px] max-w-[92vw] items-center gap-12 lg:grid-cols-[1fr_540px]"
      >
        <div className="hidden lg:block">
          <div className="text-[12px] font-medium text-white/45">Network planning simulator</div>
          <h1 className="mt-3 text-6xl font-semibold leading-[0.92] tracking-[-0.035em] text-white/90">
            Telecom<br /><span className="text-[#79aaa5]">Empire</span>
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/50">
            Light the fibre. Survive the evening peak. Build the network the city cannot live without.
          </p>
          <div className="mt-10 h-44 w-full max-w-sm rounded-sm border border-white/[0.08] bg-black/10 p-5">
            <svg viewBox="0 0 360 130" className="h-full w-full text-neon-cyan" aria-hidden="true">
              <path d="M35 86 105 46l72 32 65-52 82 58" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 7" className="fiber-flow" style={{ animationDuration: '26s' }} />
              {[[35,86],[105,46],[177,78],[242,26],[324,84]].map(([x,y], i) => <g key={i}><circle cx={x} cy={y} r="9" fill="#09111f" stroke="currentColor" strokeWidth="2" /><circle cx={x} cy={y} r="2.5" fill="currentColor" /></g>)}
              <path d="M35 105h289" stroke="rgba(255,255,255,.08)" />
              <text x="35" y="124" fill="rgba(220,231,243,.35)" fontSize="9" fontFamily="IBM Plex Mono">BACKBONE STATUS / READY FOR COMMISSIONING</text>
            </svg>
          </div>
        </div>

        {!setup ? (
          <div className="panel flex flex-col gap-2 border-white/[0.12] p-6">
            <div className="mb-4 lg:hidden">
              <div className="text-[11px] font-medium text-white/45">Network operations</div>
              <div className="mt-1 font-display text-4xl font-semibold uppercase">Telecom <span className="text-neon-cyan">Empire</span></div>
            </div>
            <div className="mb-2">
              <div className="section-title">Control room</div>
              <p className="mt-1 text-[12px] text-white/40">Start a new operator or return to the live network.</p>
            </div>
            {metas.map((meta, slot) => meta && (
              <div key={slot} className="flex gap-2 rounded-lg border border-neon-cyan/25 bg-neon-cyan/[0.06] p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => {
                  if (continueGame(slot)) return;
                  setMetas(listSaveMeta());
                  setImportStatus({ tone: 'bad', text: `Slot ${slot + 1} is no longer readable. It may have changed in another tab.` });
                }}>
                  <div className="text-sm font-semibold text-neon-cyan">Continue · Slot {slot + 1}</div>
                  <div className="num truncate text-[10px] text-white/45">{meta.company} · {meta.city} · {meta.customers.toLocaleString()} customers · {new Date(meta.savedAt).toLocaleString()}</div>
                </button>
                <button className="icon-button text-neon-red" aria-label={`Delete ${meta.company} from slot ${slot + 1}`} onClick={() => deleteSlot(slot, meta)}>×</button>
              </div>
            ))}
            <button className="btn py-3 text-left" onClick={() => setSetup(true)}>
              <span className="text-sm font-semibold">Commission new network</span>
            </button>
            <div className="mt-1 rounded-lg border border-white/[0.08] bg-black/10 p-3">
              <label htmlFor="menu-import-slot" className="stat-label">Import destination</label>
              <div className="mt-1.5 flex gap-2">
                <select
                  id="menu-import-slot"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2 py-2 text-xs"
                  value={importSlot}
                  onChange={(e) => { setImportSlot(Number(e.target.value)); setImportStatus(null); }}
                >
                  {Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => (
                    <option key={slot} value={slot}>Slot {slot + 1} — {metas[slot]?.company ?? 'empty'}</option>
                  ))}
                </select>
                <label className="btn cursor-pointer py-2 text-white/60">
                  <span className="text-xs font-semibold">Choose file</span>
                  <input className="hidden" type="file" accept="application/json,.json" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImportStatus(null);
                    const destination = importSlot;
                    let raw: string;
                    try {
                      raw = await file.text();
                    } catch {
                      setImportStatus({ tone: 'bad', text: 'That save file could not be read. No save was changed.' });
                      e.target.value = '';
                      return;
                    }
                    // Re-check before import so an asynchronous file read cannot overwrite a newly started game.
                    if (useGame.getState().started) {
                      e.target.value = '';
                      return;
                    }
                    const latestMetas = listSaveMeta();
                    setMetas(latestMetas);
                    const existing = latestMetas[destination];
                    if (
                      existing &&
                      !window.confirm(`Import and overwrite this save?\n\n${saveContext(destination, existing)}\n\nThis cannot be undone.`)
                    ) {
                      setImportStatus({ tone: 'info', text: 'Import cancelled; no save was changed.' });
                      e.target.value = '';
                      return;
                    }
                    const finalMeta = listSaveMeta()[destination];
                    if (useGame.getState().started || !sameSnapshot(existing, finalMeta)) {
                      setMetas(listSaveMeta());
                      setImportStatus({ tone: 'bad', text: `Slot ${destination + 1} changed while the file was being checked. Review it and try again.` });
                      e.target.value = '';
                      return;
                    }
                    try {
                      const state = importSave(raw, destination);
                      setMetas(listSaveMeta());
                      setImportStatus(state
                        ? { tone: 'good', text: `${state.companyName} imported into slot ${destination + 1}.` }
                        : { tone: 'bad', text: 'That save file could not be read. No save was changed.' });
                    } catch {
                      setImportStatus({ tone: 'bad', text: 'That save file could not be read. No save was changed.' });
                    } finally {
                      e.target.value = '';
                    }
                  }} />
                </label>
              </div>
              {importStatus && (
                <div
                  role={importStatus.tone === 'bad' ? 'alert' : 'status'}
                  className={`mt-2 text-[11px] ${importStatus.tone === 'good' ? 'text-neon-lime' : importStatus.tone === 'bad' ? 'text-neon-red' : 'text-white/55'}`}
                >
                  {importStatus.text}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="panel flex flex-col gap-5 border-white/[0.12] p-5">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div>
                <div className="section-title">Operator profile</div>
                <div className="text-[11px] text-white/40">Choose your starting conditions.</div>
              </div>
              <div className="font-mono text-[10px] text-neon-cyan/60">NEW / 01</div>
            </div>
            <div>
              <div className="stat-label mb-1.5">Save slot</div>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => (
                  <button key={slot} onClick={() => setNewSlot(slot)} className={`rounded-lg border p-2 text-xs ${newSlot === slot ? 'border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan' : 'border-white/10 bg-white/[0.03] text-white/50'}`}>
                    Slot {slot + 1} · {metas[slot] ? 'overwrite' : 'empty'}
                  </button>
                ))}
              </div>
              <div className="stat-label mb-1.5">Company</div>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 22))}
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-neon-cyan/50"
                  placeholder="Company name"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LOGOS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLogo(l)}
                    className={`grid h-9 w-9 place-items-center rounded-lg border text-lg transition-colors ${
                      logo === l ? 'border-neon-cyan/60 bg-neon-cyan/15' : 'border-white/10 bg-white/[0.04] hover:bg-white/10'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="stat-label mb-1.5">Starting city</div>
              <div className="grid grid-cols-2 gap-2">
                {CITIES.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setCity(c.name)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      city === c.name ? 'border-neon-cyan/60 bg-neon-cyan/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-white/45">{c.blurb}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="stat-label mb-1.5">Difficulty</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      difficulty === d ? 'border-neon-cyan/60 bg-neon-cyan/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="text-sm font-semibold">{DIFFICULTY[d].label}</div>
                    <div className="num mt-0.5 text-[11px] text-white/45">
                      ${(DIFFICULTY[d].startMoney / 1000).toFixed(0)}k start
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-white/40">{DIFFICULTY[difficulty].blurb}</p>
            </div>

            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => setSetup(false)}>
                Back
              </button>
              <button
                className="btn-primary flex-[2]"
                onClick={startNewGame}
              >
                Start building
              </button>
            </div>
            {persistenceError && <p className="text-[11px] text-neon-red" role="alert">{persistenceError}</p>}
          </div>
        )}
      </motion.div>
    </div>
  );
}
