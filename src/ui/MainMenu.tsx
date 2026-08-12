import { useState } from 'react';
import { motion } from 'framer-motion';
import { DIFFICULTY } from '../game/constants';
import { clearSave, saveMeta } from '../game/save';
import { useGame } from '../store/gameStore';
import type { Difficulty } from '../game/types';

const LOGOS = ['📡', '🛰️', '🌐', '⚡', '🔷', '🦈', '🐙', '🚀'];
const CITIES = [
  { name: 'Marmara', blurb: 'Dense, wealthy, and already contested. The intended way to play.' },
  { name: 'Karadeniz', blurb: 'Spread out and cheaper to license. Fibre runs get long.' },
];

export default function MainMenu() {
  const newGame = useGame((s) => s.newGame);
  const continueGame = useGame((s) => s.continueGame);
  const [meta, setMeta] = useState(saveMeta());
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState('CoreLink');
  const [logo, setLogo] = useState(LOGOS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [city, setCity] = useState(CITIES[0].name);

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-ink-900">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(900px 500px at 20% 10%, rgba(62,230,214,0.14), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(167,139,250,0.14), transparent 60%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-[560px] max-w-[92vw]"
      >
        <div className="mb-8 text-center">
          <div className="text-[11px] uppercase tracking-[0.5em] text-neon-cyan/70">Build the network</div>
          <h1 className="mt-1 text-5xl font-bold tracking-tight">
            Telecom <span className="text-neon-cyan">Empire</span>
          </h1>
          <p className="mt-3 text-sm text-white/45">
            One small ISP, one city, and a lot of fibre to lay.
          </p>
        </div>

        {!setup ? (
          <div className="panel flex flex-col gap-2 p-5">
            {meta && (
              <button
                className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 p-4 text-left transition-colors hover:bg-neon-cyan/20"
                onClick={() => continueGame()}
              >
                <div className="text-sm font-semibold text-neon-cyan">Continue</div>
                <div className="num text-[11px] text-white/50">
                  {meta.company} · {meta.customers.toLocaleString()} customers · saved{' '}
                  {new Date(meta.savedAt).toLocaleString()}
                </div>
              </button>
            )}
            <button className="btn py-3 text-left" onClick={() => setSetup(true)}>
              <span className="text-sm font-semibold">New game</span>
            </button>
            {meta && (
              <button
                className="btn py-3 text-left text-white/50"
                onClick={() => {
                  clearSave();
                  setMeta(null);
                }}
              >
                <span className="text-sm">Delete save</span>
              </button>
            )}
          </div>
        ) : (
          <div className="panel flex flex-col gap-5 p-5">
            <div>
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
                onClick={() => newGame({ companyName: name.trim() || 'CoreLink', logo, difficulty, cityName: city })}
              >
                Start building
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
