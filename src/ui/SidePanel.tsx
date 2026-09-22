import { useSideModel } from './side/model';
import LiveSection from './side/LiveSection';
import AlertsSection from './side/AlertsSection';
import ObligationsSection from './side/ObligationsSection';
import OffersSection from './side/OffersSection';
import PostsSection from './side/PostsSection';

export default function SidePanel() {
  const sp = useSideModel();
  const { tr, planning, mobileOpen, setMobileOpen, activeSection, setActiveSection, priorityCount, sections } = sp;

  if (planning) return null;
  return (
    <>
      <button
        className="pointer-events-auto absolute left-2 top-2 z-30 rounded-lg border border-neon-cyan/40 bg-ink-900/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neon-cyan shadow-panel lg:hidden"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="mobile-action-center"
      >
        {tr ? 'Operasyonlar' : 'Actions'}
        {priorityCount > 0 ? ` · ${priorityCount}` : ''}
      </button>
      <div
        id="mobile-action-center"
        className={`pointer-events-none absolute inset-x-2 bottom-[88px] top-2 z-30 w-auto min-h-0 flex-col gap-2 lg:bottom-4 lg:left-4 lg:right-auto lg:top-4 lg:flex lg:w-[268px] ${mobileOpen ? 'flex' : 'hidden'}`}
      >
        <div className="pointer-events-auto panel flex items-center justify-between p-2.5 lg:hidden">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neon-cyan">
              {tr ? 'Operasyon merkezi' : 'Action center'}
            </div>
            <div className="text-[10px] text-white/35">
              {tr ? 'Teklifler, arızalar, olaylar ve yükümlülükler' : 'Offers, alerts, events, and obligations'}
            </div>
          </div>
          <button
            className="btn px-2 py-1 text-xs"
            onClick={() => setMobileOpen(false)}
            aria-label={tr ? 'Operasyon merkezini kapat' : 'Close action center'}
          >
            ✕
          </button>
        </div>
        <div className="pointer-events-auto panel shrink-0 overflow-hidden p-1.5">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-white/70">{tr ? 'Operasyonlar' : 'Operations queue'}</span>
            <span className="num text-[9px] text-neon-cyan">
              {priorityCount} {tr ? 'gündem' : 'active'}
            </span>
          </div>
          <div
            className="grid grid-cols-5 gap-1"
            role="tablist"
            aria-label={tr ? 'Operasyon merkezi bölümleri' : 'Action center sections'}
          >
            {sections.map((section) => {
              const selected = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`side-tab-${section.id}`}
                  aria-selected={selected}
                  aria-controls="side-tabpanel"
                  aria-label={`${section.label} (${section.count})`}
                  onClick={() => setActiveSection(section.id)}
                  className={`relative rounded-md border px-1 py-1.5 text-center transition-colors ${
                    selected
                      ? 'border-white/20 bg-white/10'
                      : 'border-transparent bg-white/[0.025] hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="num block text-[11px] font-semibold" style={{ color: section.tone }}>
                    {section.count}
                  </span>
                  <span className="block text-[10px] font-semibold text-white/65">{section.label}</span>
                  {selected && (
                    <span className="absolute inset-x-2 bottom-0 h-px" style={{ background: section.tone }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div
          id="side-tabpanel"
          className="scroll-thin pointer-events-auto min-h-0 flex-1 overflow-y-auto pr-1"
          role="tabpanel"
          aria-labelledby={`side-tab-${activeSection}`}
        >
          <div className="flex flex-col gap-2">
            <LiveSection sp={sp} />

            <AlertsSection sp={sp} />

            <ObligationsSection sp={sp} />

            <OffersSection sp={sp} />

            <PostsSection sp={sp} />
          </div>
        </div>
      </div>
    </>
  );
}
