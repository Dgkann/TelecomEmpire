import { useMemo } from 'react';
import { NODE_SPECS, linkCapacity } from '../../game/constants';
import { effectiveNodeCapacity } from '../../game/capacity';
import { computeRoutes, isRedundant, servingCoverAfterLoss } from '../../game/network';
import { contractRisk } from '../../game/operations';
import { backupRouteEstimate } from '../../game/redundancyBuild';
import { researchModifiers } from '../../game/research';
import { activeCampaign } from '../../game/strategy';
import { useGame } from '../../store/gameStore';

// Everything the context inspectors read, derived once per render of the panel.
export function useContextModel() {
  const addBackupRoute = useGame((s) => s.addBackupRoute);
  const beginDrill = useGame((s) => s.beginFailureDrill);
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const selection = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  const setTool = useGame((s) => s.setTool);
  const upgradeNode = useGame((s) => s.upgradeNode);
  const scheduleMaintenance = useGame((s) => s.scheduleMaintenance);
  const cancelMaintenance = useGame((s) => s.cancelMaintenance);
  const sellNode = useGame((s) => s.sellNode);
  const upgradeLink = useGame((s) => s.upgradeLink);
  const sellLink = useGame((s) => s.sellLink);
  const unlockDistrict = useGame((s) => s.unlockDistrict);
  const clickNodeForLink = useGame((s) => s.clickNodeForLink);
  const startCampaign = useGame((s) => s.startCampaign);

  const mods = researchModifiers(game.researchDone);

  const node = selection?.type === 'node' ? game.nodes.find((n) => n.id === selection.id) : undefined;
  const link = selection?.type === 'link' ? game.links.find((l) => l.id === selection.id) : undefined;
  const district = selection?.type === 'district' ? game.districts.find((d) => d.id === selection.id) : undefined;
  const building = selection?.type === 'building' ? game.buildings.find((b) => b.id === selection.id) : undefined;
  const buildingContract = building ? game.contracts.find((c) => c.buildingId === building.id) : undefined;
  const buildingRisk = buildingContract ? contractRisk(game, buildingContract) : null;
  const nodeMaintenance = node
    ? game.maintenanceOrders.find((order) => order.nodeId === node.id && order.status !== 'completed')
    : undefined;
  const districtCampaign = district ? activeCampaign(game, district.id) : undefined;
  const districtCampaignHistory = district
    ? game.campaignHistory
        .filter((result) => result.districtId === district.id)
        .slice(-3)
        .reverse()
    : [];
  const nodeMaxTier = node
    ? node.kind === 'core'
      ? mods.maxCoreTier
      : node.kind === 'tower'
        ? mods.maxTowerTier
        : node.kind === 'datacenter' && node.tier === 0 && !game.researchDone.includes('edge_compute')
          ? 0
          : NODE_SPECS[node.kind].maxTier
    : 0;
  const nextNodeCapacity =
    node && node.tier < nodeMaxTier
      ? effectiveNodeCapacity(node.kind, node.tier + 1, game.spectrum, game.researchDone)
      : null;
  const nextLinkCapacity =
    link && link.tier < mods.maxLinkTier ? linkCapacity(link.tier + 1) * mods.linkCapacityMul : null;

  // Topology only changes when something is added, removed or knocked out.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;

  const maintenanceCover = useMemo(
    () => (node ? servingCoverAfterLoss(game, node.id) : { others: 0, safe: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node?.id, topology],
  );

  const { redundant, connected } = useMemo(() => {
    if (!node) return { redundant: false, connected: false };
    const routes = computeRoutes(game);
    return {
      redundant: isRedundant(game, node.id, routes),
      connected: node.kind === 'core' ? !node.down : !!routes[node.id],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, topology]);

  const backup = useMemo(
    () => (node ? backupRouteEstimate(game, node.id) : null),
    // Traffic and the cash balance cannot change which fibre path is independent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node?.id, topology],
  );

  return {
    addBackupRoute,
    beginDrill,
    game,
    locale,
    selection,
    select,
    setTool,
    upgradeNode,
    scheduleMaintenance,
    cancelMaintenance,
    sellNode,
    upgradeLink,
    sellLink,
    unlockDistrict,
    clickNodeForLink,
    startCampaign,
    mods,
    node,
    link,
    district,
    building,
    buildingContract,
    buildingRisk,
    nodeMaintenance,
    districtCampaign,
    districtCampaignHistory,
    nodeMaxTier,
    nextNodeCapacity,
    nextLinkCapacity,
    maintenanceCover,
    redundant,
    connected,
    backup,
  };
}

export type ContextModel = ReturnType<typeof useContextModel>;
