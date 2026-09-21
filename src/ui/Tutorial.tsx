import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { residentialSubs } from '../game/simulation';
import { computeRoutes, isRedundant } from '../game/network';
import { useGame } from '../store/gameStore';
import type { GameState } from '../game/types';

interface TutorialStep {
  title: string;
  body: string;
  titleTr: string;
  bodyTr: string;
  done: (g: GameState) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Place a second POP',
    body: 'Pick POP and move over the city until the preview turns green, then place the new T1 site inside your licensed district.',
    titleTr: 'İkinci POP noktasını kur',
    bodyTr:
      'POP seçeneğini seç, önizleme yeşil olana kadar şehirde hareket et ve T1 noktasını lisanslı ilçene yerleştir.',
    done: (g) => g.nodes.filter((n) => n.kind === 'pop').length >= 2,
  },
  {
    title: 'Light the fibre',
    body: 'Choose Fibre, click the new POP, then click the core router; eligible endpoints glow cyan and the route shows its price before you build.',
    titleTr: 'Fiber hattını etkinleştir',
    bodyTr:
      'Fiber seçeneğini seç, yeni POP noktasına ve ardından çekirdek yönlendiriciye tıkla. Uygun uçlar camgöbeği görünür.',
    done: (g) => {
      const routes = computeRoutes(g);
      return g.nodes.filter((n) => n.kind === 'pop' && !n.down && routes[n.id]).length >= 2;
    },
  },
  {
    title: 'Grow to 400 customers',
    body: 'Coverage spreads out from your sites over the next few days. Watch buildings turn cyan as they subscribe.',
    titleTr: '400 müşteriye ulaş',
    bodyTr: 'Kapsama birkaç gün içinde noktalarından çevreye yayılır. Abone olan binaların renk değiştirmesini izle.',
    done: (g) => residentialSubs(g) >= 400,
  },
  {
    title: 'Watch the evening peak',
    body: 'Traffic peaks around 19:00–20:00 at about 1.5× the midday load; upgrade a POP from T1 to T2 and watch its map badge and capacity change.',
    titleTr: 'Akşam yoğunluğunu izle',
    bodyTr:
      'Trafik 19:00–20:00 civarında zirve yapar ve öğle yükünün yaklaşık 1,5 katına çıkar. Bir POP noktasını T1 seviyesinden T2 seviyesine yükselt.',
    done: (g) => g.nodes.some((n) => n.kind === 'pop' && n.tier >= 2),
  },
  {
    title: 'Protect a customer site',
    body: 'Add a second fibre route to a POP or access site so one cut cannot isolate it; protected sites qualify for stricter contracts and audits.',
    titleTr: 'Müşteri noktasını koru',
    bodyTr: 'Bir kesintinin noktayı ayırmaması için POP veya erişim noktasına ikinci bir fiber rotası ekle.',
    done: (g) => {
      const sites = g.nodes.filter((node) => node.kind === 'pop' || node.kind === 'access');
      const routes = computeRoutes(g);
      return sites.some((site) => isRedundant(g, site.id, routes));
    },
  },
  {
    title: 'Expand to a new district',
    body: 'Click a greyed-out district and buy its licence, then plan coverage, capacity and a resilient path back to the core.',
    titleTr: 'Yeni bir ilçeye genişle',
    bodyTr:
      'Gri görünen bir ilçeye tıklayıp lisansını al. Ardından kapsama, kapasite ve çekirdeğe dayanıklı bağlantıyı planla.',
    done: (g) => g.districts.filter((d) => d.unlocked).length >= 2,
  },
];

export default function Tutorial() {
  const game = useGame((s) => s.game)!;
  const advance = useGame((s) => s.advanceTutorial);
  const skip = useGame((s) => s.skipTutorial);
  const selection = useGame((s) => s.selection);
  const locale = useGame((s) => s.locale);
  const planning = useGame((s) => s.planning);
  const setTool = useGame((s) => s.setTool);
  const setSpeed = useGame((s) => s.setSpeed);
  const select = useGame((s) => s.select);
  const focus = useGame((s) => s.focus);
  const [expanded, setExpanded] = useState(false);
  const stepIndex = game.tutorialStep;
  const step = STEPS[stepIndex];

  // Advance as soon as the goal is met.
  useEffect(() => {
    if (step && step.done(game)) advance(stepIndex);
  }, [game, step, stepIndex, advance]);

  useEffect(() => {
    if (stepIndex >= STEPS.length && !game.tutorialDone) skip();
  }, [stepIndex, game.tutorialDone, skip]);

  useEffect(() => setExpanded(false), [stepIndex]);

  if (game.tutorialDone || !step || planning) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`panel pointer-events-none absolute right-2 top-12 z-20 w-[calc(100%-16px)] border-neon-cyan/25 px-3 py-2.5 sm:right-4 sm:top-4 sm:w-[400px] sm:px-4 sm:py-3 xl:w-[520px] ${selection ? 'hidden' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neon-cyan/35 bg-neon-cyan/10 font-mono text-xs font-semibold text-neon-cyan">
            {stepIndex + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-neon-cyan">
                  {locale === 'tr' ? 'Kurulum rehberi' : 'Commissioning guide'}
                </div>
                <div className="text-sm font-semibold">{locale === 'tr' ? step.titleTr : step.title}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="pointer-events-auto text-[11px] text-neon-cyan sm:hidden"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? (locale === 'tr' ? 'Azalt' : 'Less') : locale === 'tr' ? 'Ayrıntı' : 'Details'}
                </button>
                <button className="pointer-events-auto text-[11px] text-white/45 hover:text-white" onClick={skip}>
                  {locale === 'tr' ? 'Rehberi geç' : 'Skip guide'}
                </button>
              </div>
            </div>
            <p className={`${expanded ? 'block' : 'hidden'} mt-1 text-[12px] leading-snug text-white/60 sm:block`}>
              {locale === 'tr' ? step.bodyTr : step.body}
            </p>
            <button
              className="btn pointer-events-auto mt-2 min-h-9 text-xs"
              onClick={() => {
                if (stepIndex === 0) setTool('pop');
                else if (stepIndex === 1 || stepIndex === 4) setTool('fiber');
                else if (stepIndex === 2) setSpeed(4);
                else if (stepIndex === 3) {
                  const pop = game.nodes.find((n) => n.kind === 'pop');
                  if (pop) {
                    select({ type: 'node', id: pop.id });
                    focus(pop.gx, pop.gy);
                  }
                } else {
                  const district = game.districts.find((d) => !d.unlocked);
                  if (district) {
                    select({ type: 'district', id: district.id });
                    focus(district.center.gx, district.center.gy);
                  }
                }
              }}
            >
              {
                (locale === 'tr'
                  ? [
                      'POP seç',
                      'Fiber seç',
                      'Zamanı 4× ilerlet',
                      'POP noktasını incele',
                      'Yedek fiber seç',
                      'Yeni ilçeyi incele',
                    ]
                  : [
                      'Select POP',
                      'Select fibre',
                      'Advance time at 4×',
                      'Inspect a POP',
                      'Select backup fibre',
                      'Inspect a new district',
                    ])[stepIndex]
              }
            </button>
            <div className="mt-2 hidden gap-1 sm:flex">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full ${i < stepIndex ? 'bg-neon-cyan' : i === stepIndex ? 'bg-neon-cyan/55' : 'bg-white/10'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
