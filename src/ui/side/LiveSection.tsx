import { AnimatePresence, motion } from 'framer-motion';
import { fmtClock } from '../../game/simulation';
import { t } from '../i18n';
import DevelopmentGoals from '../DevelopmentGoals';
import { scrollToAnchor } from './shared';
import type { SideModel } from './model';

export default function LiveSection({ sp }: { sp: SideModel }) {
  const { locale, game, tr, openIncident, focus, select, setScreen, activeSection, setMobileOpen, insights } = sp;
  return (
    <>
      {activeSection === 'live' && (
        <>
          <button
            className="btn mb-2 w-full text-xs"
            onClick={() => {
              setScreen('company');
              setMobileOpen(false);
              scrollToAnchor('strategy-desk');
            }}
          >
            {tr ? 'Strateji masası' : 'Strategy desk'}
            {game.strategy.decision ? (tr ? ' · Karar bekliyor' : ' · Decision waiting') : ' ↗'}
          </button>
          <DevelopmentGoals onNavigate={() => setMobileOpen(false)} />
          <AnimatePresence>
            {game.activeEvent && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="pointer-events-auto panel border-neon-violet/40 p-3"
              >
                <div className="text-[10px] uppercase tracking-widest text-neon-violet">
                  {tr ? 'Şehir etkinliği' : 'City event'}
                </div>
                <div className="text-sm font-semibold">{game.activeEvent.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-white/50">{game.activeEvent.blurb}</div>
                <div className="num mt-1.5 text-[11px] text-neon-violet">
                  +{Math.round((game.activeEvent.mul - 1) * 100)}% traffic · until {fmtClock(game.activeEvent.endsAt)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {insights.length > 0 && (
            <div className="pointer-events-auto panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-neon-cyan">
                  {tr ? 'Operasyon merkezi' : 'Action center'}
                </div>
                <span className="num text-[9px] text-white/35">{tr ? 'Öncelik sırası' : 'Live priorities'}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {insights.map((item) => {
                  const tone =
                    item.severity === 'critical' ? '#ff5d73' : item.severity === 'warning' ? '#ffc857' : '#7ee787';
                  return (
                    <button
                      key={item.id}
                      className="group rounded-lg border border-white/[0.08] bg-white/[0.035] p-2.5 text-left transition-colors hover:bg-white/[0.075]"
                      onClick={() => {
                        setMobileOpen(false);
                        if (item.target.type === 'screen') {
                          const { id, anchor } = item.target;
                          setScreen(id);
                          // The target screen has not mounted yet.
                          if (anchor) scrollToAnchor(anchor);
                          return;
                        }
                        focus(item.target.gx, item.target.gy);
                        select({ type: item.target.type, id: item.target.id });
                        if (item.id.startsWith('incident-')) openIncident(item.id.slice('incident-'.length));
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: tone, boxShadow: `0 0 9px ${tone}` }}
                        />
                        <span className="truncate text-[11px] font-semibold text-white/85">{item.title}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/[0.42]">{item.detail}</div>
                      <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: tone }}>
                        {item.action} →
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!game.activeEvent && insights.length === 0 && (
            <div className="panel p-4 text-center">
              <div className="text-xs font-semibold text-neon-lime">{tr ? 'Şebeke dengeli' : 'Network steady'}</div>
              <div className="mt-1 text-[10px] leading-snug text-white/40">{t(locale, 'noImmediatePriorities')}</div>
            </div>
          )}
        </>
      )}
    </>
  );
}
