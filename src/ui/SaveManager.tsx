import { useEffect, useRef, useState } from 'react';
import { clearSave, exportSave, importSave, listSaveMeta, SAVE_SLOT_COUNT } from '../game/save';
import { useGame } from '../store/gameStore';

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
  const toast = useGame((s) => s.toast);
  const [metas, setMetas] = useState(() => listSaveMeta());
  const [importSlot, setImportSlot] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setMetas(listSaveMeta());
  }, [open]);
  if (!open) return null;
  const refresh = () => setMetas(listSaveMeta());

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="panel w-full max-w-[620px] border-white/[0.14] p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><div className="section-title text-neon-cyan">Save archive</div><h2 className="font-display text-2xl font-semibold uppercase">Network snapshots</h2></div>
          <button className="icon-button" onClick={() => close(false)} aria-label="Close save manager">×</button>
        </div>
        <p className="mt-1 text-[12px] text-white/42">Autosave follows the active slot once per in-game day.</p>
        <div className="mt-4 grid gap-2">
          {Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => {
            const meta = metas[slot];
            return (
              <div key={slot} className={`rounded-xl border p-3 ${active === slot ? 'border-neon-cyan/35 bg-neon-cyan/[0.06]' : 'border-white/[0.08] bg-white/[0.025]'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 font-mono text-sm text-white/60">{slot + 1}</div>
                  <div className="min-w-[150px] flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold"><span>{meta?.company ?? 'Empty slot'}</span>{active === slot && <span className="chip text-[9px] text-neon-cyan">ACTIVE</span>}</div>
                    <div className="num text-[10px] text-white/38">{meta ? `${meta.city} · ${meta.customers.toLocaleString()} customers · ${new Date(meta.savedAt).toLocaleString()}` : 'Ready for a new snapshot'}</div>
                  </div>
                  <button className="btn py-1.5 text-[11px]" onClick={() => { saveToSlot(slot); setTimeout(refresh, 0); }}>Save here</button>
                  {meta && <button className="btn py-1.5 text-[11px]" onClick={() => { const raw = exportSave(slot); if (raw) downloadSave(raw, slot); }}>Export</button>}
                  {meta && slot !== active && <button className="btn py-1.5 text-[11px] text-neon-red" onClick={() => { clearSave(slot); refresh(); }}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4">
          <input ref={input} className="hidden" type="file" accept="application/json,.json" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const state = importSave(await file.text(), importSlot);
            toast(state ? `Imported into slot ${importSlot + 1}.` : 'That save file could not be read.', state ? 'good' : 'bad');
            refresh();
            e.target.value = '';
          }} />
          <label className="stat-label">Import to</label>
          <select className="rounded-lg border border-white/10 bg-ink-800 px-2 py-2 text-xs" value={importSlot} onChange={(e) => setImportSlot(Number(e.target.value))}>
            {Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => <option key={i} value={i}>Slot {i + 1}</option>)}
          </select>
          <button className="btn" onClick={() => input.current?.click()}>Choose save file</button>
          <span className="ml-auto num text-[10px] text-white/30">FORMAT / JSON · VERSIONED</span>
        </div>
      </div>
    </div>
  );
}
