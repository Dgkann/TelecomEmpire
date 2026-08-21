import { useEffect, useRef, useState } from 'react';
import { clearSave, exportSave, importSave, listSaveMeta, SAVE_SLOT_COUNT } from '../game/save';
import { useGame } from '../store/gameStore';

type SaveMeta = NonNullable<ReturnType<typeof listSaveMeta>[number]>;
type ManagerStatus = { tone: 'good' | 'bad' | 'info'; text: string };

function saveContext(slot: number, meta: SaveMeta) {
  return `Slot ${slot + 1}: ${meta.company}\n${meta.city} · ${meta.customers.toLocaleString()} customers\nSaved ${new Date(meta.savedAt).toLocaleString()}`;
}

const sameSnapshot = (a: SaveMeta | null, b: SaveMeta | null) =>
  a?.savedAt === b?.savedAt && a?.company === b?.company;

function firstInactiveSlot(active: number) {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => slot).find((slot) => slot !== active) ?? 0;
}

function downloadSave(raw: string, slot: number) {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telecom-empire-slot-${slot + 1}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SaveManager() {
  const open = useGame((s) => s.showSaveManager);
  const close = useGame((s) => s.setShowSaveManager);
  const saveToSlot = useGame((s) => s.saveToSlot);
  const active = useGame((s) => s.activeSaveSlot);
  const [metas, setMetas] = useState(() => listSaveMeta());
  const [importSlot, setImportSlot] = useState(() => firstInactiveSlot(active));
  const [status, setStatus] = useState<ManagerStatus | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setMetas(listSaveMeta());
      setStatus(null);
    }
  }, [open]);
  useEffect(() => {
    if (importSlot === active) setImportSlot(firstInactiveSlot(active));
  }, [active, importSlot]);
  if (!open) return null;
  const refresh = () => setMetas(listSaveMeta());

  const saveHere = (slot: number) => {
    const latestMetas = listSaveMeta();
    const meta = latestMetas[slot];
    setMetas(latestMetas);
    if (
      meta &&
      !window.confirm(`Overwrite this save with the running network?\n\n${saveContext(slot, meta)}\n\nThis cannot be undone.`)
    ) {
      setStatus({ tone: 'info', text: 'Save cancelled; no snapshot was changed.' });
      return;
    }
    const saved = saveToSlot(slot);
    refresh();
    setStatus(saved
      ? { tone: 'good', text: `Running network saved to slot ${slot + 1}; autosave now follows that slot.` }
      : { tone: 'bad', text: `Slot ${slot + 1} could not be saved. No snapshot was changed.` });
  };

  const deleteSlot = (slot: number) => {
    const latest = listSaveMeta()[slot];
    if (!latest) {
      refresh();
      setStatus({ tone: 'bad', text: `Slot ${slot + 1} is no longer available.` });
      return;
    }
    if (!window.confirm(`Delete this saved network?\n\n${saveContext(slot, latest)}\n\nThis cannot be undone.`)) {
      setStatus({ tone: 'info', text: 'Delete cancelled; no snapshot was changed.' });
      return;
    }
    if (!clearSave(slot)) {
      setStatus({ tone: 'bad', text: `Slot ${slot + 1} could not be deleted. No snapshot was changed.` });
      return;
    }
    refresh();
    setStatus({ tone: 'good', text: `Slot ${slot + 1} was cleared.` });
  };

  const exportSlot = (slot: number) => {
    const raw = exportSave(slot);
    if (!raw) {
      refresh();
      setStatus({ tone: 'bad', text: `Slot ${slot + 1} could not be exported. It may have changed in another tab.` });
      return;
    }
    downloadSave(raw, slot);
    setStatus({ tone: 'good', text: `Slot ${slot + 1} was exported.` });
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div
        className="panel max-h-[calc(100dvh-2rem)] w-full max-w-[620px] overflow-y-auto border-white/[0.14] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-manager-title"
        aria-describedby="save-manager-description"
      >
        <div className="flex items-start justify-between">
          <div><div className="section-title text-neon-cyan">Save archive</div><h2 id="save-manager-title" className="font-display text-2xl font-semibold uppercase">Network snapshots</h2></div>
          <button className="icon-button" onClick={() => close(false)} aria-label="Close save manager">×</button>
        </div>
        <p id="save-manager-description" className="mt-1 text-[12px] text-white/[0.42]">Autosave follows the active slot once per in-game day.</p>
        <div className="mt-4 grid gap-2">
          {Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => {
            const meta = metas[slot];
            return (
              <div key={slot} className={`rounded-xl border p-3 ${active === slot ? 'border-neon-cyan/35 bg-neon-cyan/[0.06]' : 'border-white/[0.08] bg-white/[0.025]'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 font-mono text-sm text-white/60">{slot + 1}</div>
                  <div className="min-w-[150px] flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold"><span>{meta?.company ?? 'Empty slot'}</span>{active === slot && <span className="chip text-[9px] text-neon-cyan">ACTIVE</span>}</div>
                    <div className="num text-[10px] text-white/[0.38]">{meta ? `${meta.city} · ${meta.customers.toLocaleString()} customers · ${new Date(meta.savedAt).toLocaleString()}` : 'Ready for a new snapshot'}</div>
                  </div>
                  <button className="btn py-1.5 text-[11px]" onClick={() => saveHere(slot)}>Save here</button>
                  {meta && <button className="btn py-1.5 text-[11px]" onClick={() => exportSlot(slot)}>Export</button>}
                  {meta && slot !== active && <button className="btn py-1.5 text-[11px] text-neon-red" aria-label={`Delete ${meta.company} from slot ${slot + 1}`} onClick={() => deleteSlot(slot)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} className="hidden" type="file" accept="application/json,.json" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setStatus(null);
            const destination = importSlot;
            let raw: string;
            try {
              raw = await file.text();
            } catch {
              setStatus({ tone: 'bad', text: 'That save file could not be read. No snapshot was changed.' });
              e.target.value = '';
              return;
            }
            const current = useGame.getState();
            if (!current.started || destination === current.activeSaveSlot) {
              if (current.started) {
                setStatus({ tone: 'bad', text: `Slot ${current.activeSaveSlot + 1} is running and cannot be imported over. Choose another slot.` });
                setImportSlot(firstInactiveSlot(current.activeSaveSlot));
              }
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
                setStatus({ tone: 'info', text: 'Import cancelled; no snapshot was changed.' });
                e.target.value = '';
              return;
            }
            const finalState = useGame.getState();
            const finalMeta = listSaveMeta()[destination];
            if (!finalState.started || destination === finalState.activeSaveSlot || !sameSnapshot(existing, finalMeta)) {
              refresh();
              setStatus({ tone: 'bad', text: `Slot ${destination + 1} changed while the file was being checked. Review it and try again.` });
              setImportSlot(firstInactiveSlot(finalState.activeSaveSlot));
              e.target.value = '';
              return;
            }
            try {
              const state = importSave(raw, destination);
              refresh();
              setStatus(state
                ? { tone: 'good', text: `${state.companyName} imported into slot ${destination + 1}.` }
                  : { tone: 'bad', text: 'That save file could not be read. No snapshot was changed.' });
              } catch {
                setStatus({ tone: 'bad', text: 'That save file could not be read. No snapshot was changed.' });
              } finally {
                e.target.value = '';
              }
            }} />
            <label htmlFor="save-manager-import-slot" className="stat-label">Import to</label>
            <select
              id="save-manager-import-slot"
              className="rounded-lg border border-white/10 bg-ink-800 px-2 py-2 text-xs"
              value={importSlot}
              aria-describedby="active-import-note"
              onChange={(e) => { setImportSlot(Number(e.target.value)); setStatus(null); }}
            >
              {Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => (
                <option key={i} value={i} disabled={i === active}>
                  Slot {i + 1} — {i === active ? 'active game (unavailable)' : metas[i]?.company ?? 'empty'}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => input.current?.click()}>Choose save file</button>
            <span className="ml-auto num text-[10px] text-white/30">FORMAT / JSON · VERSIONED</span>
          </div>
          <p id="active-import-note" className="mt-2 text-[11px] text-white/45">
            Slot {active + 1} is the running game and cannot be imported over; its next autosave would replace the imported snapshot.
          </p>
          {status && (
            <div
              role={status.tone === 'bad' ? 'alert' : 'status'}
              className={`mt-2 text-[11px] ${status.tone === 'good' ? 'text-neon-lime' : status.tone === 'bad' ? 'text-neon-red' : 'text-white/55'}`}
            >
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
