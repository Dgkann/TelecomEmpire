import { useEffect, useMemo, useState } from 'react';
import { TRANSIT_TIERS } from '../../../game/constants';
import { monthlyBreakdown } from '../../../game/economy';
import { computeRoutes, daysUntilFull, forecastDemand, servingCapacity } from '../../../game/network';
import { researchModifiers } from '../../../game/research';
import { networkResilience } from '../../../game/regulator';
import { INTERCONNECT_CONFIG, interconnectOperational } from '../../../game/strategy';
import type { TrafficClass } from '../../../game/types';
import { useGame } from '../../../store/gameStore';

export type NetworkView = 'live' | 'lab' | 'policy' | 'capacity' | 'operations' | 'interconnect';

// Everything the network panels read, derived once per render of the screen.
export function useNetworkModel() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const setTransitTier = useGame((s) => s.setTransitTier);
  const toggleBackup = useGame((s) => s.toggleBackupTransit);
  const toggleAuto = useGame((s) => s.toggleAutoDispatch);
  const setTrafficPolicy = useGame((s) => s.setTrafficPolicy);
  const setInterconnectPlan = useGame((s) => s.setInterconnectPlan);
  const setDataCenterMode = useGame((s) => s.setDataCenterMode);
  const setScreen = useGame((s) => s.setScreen);
  const setOverlay = useGame((s) => s.setOverlay);
  const setTool = useGame((s) => s.setTool);
  const [networkView, setNetworkView] = useState<NetworkView>('live');

  useEffect(() => {
    const onView = (event: Event) => setNetworkView((event as CustomEvent<NetworkView>).detail);
    window.addEventListener('network:view', onView);
    return () => window.removeEventListener('network:view', onView);
  }, []);

  // Routing is a Dijkstra per core, so only redo it when the topology moves.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;
  const { routes, usedSpans } = useMemo(() => {
    const r = computeRoutes(game);
    const used = new Set<string>();
    for (const info of Object.values(r)) for (const id of info.path) used.add(id);
    return { routes: r, usedSpans: used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology]);

  const mods = researchModifiers(game.researchDone);
  const forecast = forecastDemand(game.demandHistory, Math.max(game.dayPeakDemand, game.stats.demandGbps), 30);
  const accessCapacity = servingCapacity(game.nodes);
  const daysLeft = daysUntilFull(forecast, accessCapacity);
  const transit = TRANSIT_TIERS[game.transitTier];
  const interconnect = INTERCONNECT_CONFIG[game.interconnectPlan];
  const interconnectOnline = interconnectOperational(game, routes);
  const transitCapacity =
    transit.capacity * (game.backupTransit ? 1.35 : 1) + (interconnectOnline ? interconnect.capacityBonus : 0);
  const transitUse = game.stats.transitGbps / transitCapacity;
  const demandSeries = [...game.demandHistory.slice(-29), Math.max(game.dayPeakDemand, game.stats.demandGbps)];
  const dayTelemetry = game.telemetry.slice(-24);
  const dataCenters = game.nodes.filter((n) => n.kind === 'datacenter');
  const finance = monthlyBreakdown(game, mods);
  const resilience = networkResilience(game);
  const openMaintenance = game.maintenanceOrders.filter((order) => order.status !== 'completed');
  const trafficClasses: Array<{ id: TrafficClass; label: string; color: string }> = [
    { id: 'residential', label: 'Residential', color: '#68a5ff' },
    { id: 'business', label: 'Business SLA', color: '#a78bfa' },
    { id: 'mobile', label: 'Mobile', color: '#f59e0b' },
    { id: 'wholesale', label: 'Wholesale', color: '#f3b843' },
    { id: 'workload', label: 'Data centre', color: '#2dd4bf' },
  ];

  return {
    game,
    locale,
    focus,
    select,
    setTransitTier,
    toggleBackup,
    toggleAuto,
    setTrafficPolicy,
    setInterconnectPlan,
    setDataCenterMode,
    setScreen,
    setOverlay,
    setTool,
    networkView,
    setNetworkView,
    routes,
    usedSpans,
    mods,
    forecast,
    accessCapacity,
    daysLeft,
    transit,
    interconnect,
    interconnectOnline,
    transitCapacity,
    transitUse,
    demandSeries,
    dayTelemetry,
    dataCenters,
    finance,
    resilience,
    openMaintenance,
    trafficClasses,
  };
}

export type NetworkModel = ReturnType<typeof useNetworkModel>;
