import { useMemo, useState } from 'react';
import { districtRedundancy } from '../../game/network';
import { operationsInsights } from '../../game/operations';
import { pendingRegulations } from '../../game/regulator';
import { researchModifiers } from '../../game/research';
import { useGame } from '../../store/gameStore';
import { operationsCopy } from '../operationsCopy';

export type ActionSection = 'live' | 'alerts' | 'obligations' | 'offers' | 'posts';

// Everything the action-centre sections read, derived once per render of the panel.
export function useSideModel() {
  const locale = useGame((s) => s.locale);
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const openIncident = useGame((s) => s.openIncident);
  const focus = useGame((s) => s.focus);
  const acceptOffer = useGame((s) => s.acceptOffer);
  const declineOffer = useGame((s) => s.declineOffer);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const inspectedOfferId = useGame((s) => s.inspectedOfferId);
  const inspectOffer = useGame((s) => s.inspectOffer);
  const planning = useGame((s) => s.planning);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const [chosenSection, setChosenSection] = useState<ActionSection>('live');
  const mobileOpen = manuallyOpen || !!inspectedOfferId;
  const activeSection: ActionSection = inspectedOfferId ? 'offers' : chosenSection;
  const setMobileOpen = (value: boolean | ((open: boolean) => boolean)) => {
    const open = typeof value === 'function' ? value(mobileOpen) : value;
    setManuallyOpen(open);
    if (!open) inspectOffer(null);
  };
  const setActiveSection = (section: ActionSection) => {
    setChosenSection(section);
    setManuallyOpen(mobileOpen);
    inspectOffer(null);
  };

  // Redundancy costs a Dijkstra per span, and this panel redraws every tick.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;
  const offerKey = game.offers.map((o) => o.id).join(',');
  const redundancyBy = useMemo(() => {
    const map = new Map<string, { done: number; total: number; complete: boolean }>();
    for (const o of game.offers) {
      if (o.requiresRedundancy && !map.has(o.districtId)) map.set(o.districtId, districtRedundancy(game, o.districtId));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, offerKey]);

  const mods = researchModifiers(game.researchDone);
  const active = game.incidents.filter((i) => !i.resolved);
  const outages = Object.entries(game.stats.outages).filter(([, v]) => v);
  const obligations = pendingRegulations(game);
  const insights = operationsInsights(game).map((item) => operationsCopy(item, game, tr));
  const priorityCount =
    insights.length + active.length + obligations.length + game.offers.length + (game.activeEvent ? 1 : 0);
  const sections: { id: ActionSection; label: string; count: number; tone: string }[] = [
    { id: 'live', label: tr ? 'Gündem' : 'Live', count: insights.length + (game.activeEvent ? 1 : 0), tone: '#4de3ff' },
    { id: 'alerts', label: tr ? 'Arızalar' : 'Faults', count: active.length + outages.length, tone: '#ff5d73' },
    { id: 'obligations', label: tr ? 'Takvim' : 'Due', count: obligations.length, tone: '#ffc857' },
    { id: 'offers', label: tr ? 'Teklif' : 'Deals', count: game.offers.length, tone: '#7ee787' },
    { id: 'posts', label: tr ? 'Akış' : 'Feed', count: game.posts.length, tone: '#69a7ff' },
  ];

  return {
    locale,
    game,
    tr,
    openIncident,
    focus,
    acceptOffer,
    declineOffer,
    select,
    setScreen,
    inspectedOfferId,
    inspectOffer,
    planning,
    mobileOpen,
    setMobileOpen,
    activeSection,
    setActiveSection,
    redundancyBy,
    mods,
    active,
    outages,
    obligations,
    insights,
    priorityCount,
    sections,
  };
}

export type SideModel = ReturnType<typeof useSideModel>;
