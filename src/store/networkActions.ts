import { initialNodeTier, nodeCapitalCost } from '../game/constants';
import { commissionCapacityPlan } from '../game/capacityLab';
import { buildSolar, setEnergyPlan as applyEnergyPlan } from '../game/energy';
import { launchDistrict as buildDistrictLaunch } from '../game/expansion';
import { buildBackupRoute } from '../game/redundancyBuild';
import { buildConnectedSite } from '../game/connectedBuild';
import {
  FIBER_COST_PER_UNIT,
  FIBER_UPGRADE_COST_PER_UNIT,
  MINUTES_PER_DAY,
  NODE_SPECS,
  linkCapacity,
  nodeUpgradeCost,
} from '../game/constants';
import { effectiveNodeCapacity } from '../game/capacity';
import { computeRoutes } from '../game/network';
import { dispatchCandidates, repairCost } from '../game/incidents';
import { recordLedger } from '../game/financeLedger';
import { fibreConnectionCost, fibreConnectionIssue, nodePlacementCost, nodePlacementIssue } from '../game/placement';
import { researchModifiers } from '../game/research';
import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { projectBlueprint, type BuildStep } from '../game/blueprint';
import { dispatch as dispatchTechnician, pushLog } from '../game/simulation';
import { uid } from '../game/rng';
import {
  DATA_CENTER_MODE_CONFIG,
  DATA_CENTER_MODE_COOLDOWN,
  INTERCONNECT_CONFIG,
  MAINTENANCE_CONFIG,
  TRAFFIC_POLICY_CONFIG,
  maintenanceCost,
  maintenanceStart,
  dataCenterModeChangeCost,
} from '../game/strategy';
import { line } from '../game/lang';
import { say, withGame } from './shared';
import type { GetState, SetState } from './shared';
import type { Store } from './types';

// Building, planning, repairing and running the network: sites, fibre, districts, dispatch and policy.
export const networkActions = (set: SetState, get: GetState) =>
  ({
    beginBlueprint: () => {
      if (!get().game || get().game!.gameOver || get().drillTarget) return;
      withGame(set, (g) => {
        g.speed = 0;
      });
      set({ planning: true, blueprint: [], screen: 'map', tool: 'pop', selection: null, linkFrom: null });
    },

    discardBlueprint: () => set({ planning: false, blueprint: [], tool: null, linkFrom: null, selection: null }),

    undoBlueprint: () => set((s) => ({ blueprint: s.blueprint.slice(0, -1), linkFrom: null, selection: null })),

    commitBlueprint: () => {
      const s = get();
      if (!s.game || !s.planning || !s.blueprint.length) return;
      const result = projectBlueprint(s.game, s.blueprint, s.locale);
      if (result.error) {
        s.toast(result.error, 'bad');
        return;
      }
      if (result.disconnected) {
        s.toast(
          say(s.locale, 'Connect every planned site to a core first.', 'Önce plandaki tüm noktaları çekirdeğe bağla.'),
          'bad',
        );
        return;
      }
      pushLog(
        result.state,
        line(
          `Network plan commissioned: ${s.blueprint.length} ${plural(s.blueprint.length, 'item')}.`,
          `Ağ planı kuruldu: ${s.blueprint.length} kalem.`,
        ),
        'good',
      );
      set({
        game: { ...result.state, speed: 0 },
        planning: false,
        blueprint: [],
        tool: null,
        linkFrom: null,
        selection: null,
      });
      s.toast(say(s.locale, 'Network plan commissioned.', 'Ağ planı kuruldu.'), 'good');
    },

    commissionUpgrades: (items) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return false;
      const next = commissionCapacityPlan(s.game, items);
      if (!next) {
        s.toast(
          say(
            s.locale,
            'Order could not be commissioned. Refresh the lab and check cash, faults and research.',
            'Sipariş verilemedi. Laboratuvarı yenile; nakit, arıza ve araştırma durumunu gözden geçir.',
          ),
          'bad',
        );
        return false;
      }
      set({ game: next });
      s.toast(
        say(
          s.locale,
          `${items.length} ${plural(items.length, 'capacity upgrade')} commissioned`,
          `${items.length} kapasite yükseltmesi sipariş edildi`,
        ),
        'good',
      );
      return true;
    },

    addBackupRoute: (nodeId) => {
      const s = get();
      if (!s.game || s.planning) return;
      const game = buildBackupRoute(s.game, nodeId);
      if (!game) {
        s.toast(
          say(s.locale, 'No affordable independent route is available.', 'Bütçeye uygun bağımsız bir rota yok.'),
          'bad',
        );
        return;
      }
      set({ game });
      s.toast(
        say(s.locale, 'Backup fibre live · single-cut protection', 'Yedek fiber devrede · tek kesintiye karşı koruma'),
        'good',
      );
    },

    placeNode: (kind, gx, gy) => {
      const s = get();
      const g = s.game;
      if (!g || s.drillTarget) return;
      if (s.planning) {
        const steps: BuildStep[] = [...s.blueprint, { type: 'node', id: uid('plan'), kind, gx, gy }];
        const preview = projectBlueprint(g, steps, s.locale);
        if (preview.error) s.toast(preview.error, 'bad', gx, gy);
        else set({ blueprint: steps });
        return;
      }
      if (s.autoConnect) {
        const result = buildConnectedSite(g, kind, gx, gy, s.locale);
        if (result.error) {
          s.toast(result.error, 'bad', gx, gy);
          return;
        }
        set({ game: result.state });
        s.toast(say(s.locale, 'Site connected · ready for service', 'Nokta bağlandı · hizmete hazır'), 'good', gx, gy);
        return;
      }
      const spec = NODE_SPECS[kind];
      const issue = nodePlacementIssue(g, kind, gx, gy, s.locale);
      if (issue) {
        s.toast(issue, 'bad', gx, gy);
        return;
      }
      const district = g.districts.find((d) => d.cells.some((c) => c.gx === gx && c.gy === gy));
      if (!district) return;
      const cost = nodePlacementCost(g, kind);

      const capacity = effectiveNodeCapacity(kind, initialNodeTier(kind), g.spectrum, g.researchDone);
      const count = g.nodes.filter((n) => n.kind === kind).length + 1;
      const nodeId = uid('n');
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(
          draft,
          'network_build',
          line(`${spec.label}: ${district.name}`, `${spec.labelTr}: ${district.name}`),
          -cost,
        );
        draft.nodes = [
          ...draft.nodes,
          {
            id: nodeId,
            kind,
            name: `${district.name} ${spec.label}${count > 1 ? ` ${count}` : ''}`,
            gx,
            gy,
            districtId: district.id,
            tier: initialNodeTier(kind),
            capacityGbps: capacity,
            trafficGbps: 0,
            health: 100,
            down: false,
            builtAt: draft.minutes,
            servicedAt: draft.minutes,
          },
        ];
        if (kind === 'datacenter') {
          draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: 'colocation' };
          // Zero marks a newly built site whose initial workload can be changed immediately.
          draft.dataCenterModeChangedAt = { ...draft.dataCenterModeChangedAt, [nodeId]: 0 };
        }
        pushLog(
          draft,
          line(`${spec.label} built in ${district.name}.`, `${district.name} ilçesine ${spec.labelTr} kuruldu.`),
          'good',
        );
      });
      s.toast(say(s.locale, `${spec.label} built`, `${spec.labelTr} kuruldu`), 'good', gx, gy);
    },

    clickNodeForLink: (nodeId) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      if (s.planning && s.linkFrom && s.linkFrom !== nodeId) {
        const steps: BuildStep[] = [
          ...s.blueprint,
          { type: 'link', id: uid('planlink'), aId: s.linkFrom, bId: nodeId },
        ];
        const preview = projectBlueprint(g, steps, s.locale);
        if (preview.error) s.toast(preview.error, 'bad');
        else set({ blueprint: steps, linkFrom: null });
        return;
      }
      if (!s.linkFrom) {
        set({ linkFrom: nodeId });
        return;
      }
      if (s.linkFrom === nodeId) {
        set({ linkFrom: null });
        return;
      }
      const a = g.nodes.find((n) => n.id === s.linkFrom);
      const b = g.nodes.find((n) => n.id === nodeId);
      if (!a || !b) {
        set({ linkFrom: null });
        return;
      }
      const issue = fibreConnectionIssue(g, a.id, b.id, s.locale);
      if (issue) {
        s.toast(issue, 'bad');
        set({ linkFrom: null });
        return;
      }
      const length = Math.hypot(a.gx - b.gx, a.gy - b.gy);
      const cost = fibreConnectionCost(g, a.id, b.id);
      const mods = researchModifiers(g.researchDone);
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(
          draft,
          'network_build',
          line(`Fibre: ${a.name} to ${b.name}`, `Fiber: ${a.name} → ${b.name}`),
          -cost,
        );
        draft.links = [
          ...draft.links,
          {
            id: uid('l'),
            aId: a.id,
            bId: b.id,
            capacityGbps: linkCapacity(1) * mods.linkCapacityMul,
            trafficGbps: 0,
            down: false,
            tier: 1,
            length,
            builtAt: draft.minutes,
          },
        ];
        pushLog(
          draft,
          line(`Fibre span lit: ${a.name} ↔ ${b.name}.`, `Fiber hattı devrede: ${a.name} ↔ ${b.name}.`),
          'good',
        );
      });
      set({ linkFrom: null });
      s.toast(say(s.locale, 'Fibre lit', 'Fiber devrede'), 'good', (a.gx + b.gx) / 2, (a.gy + b.gy) / 2);
    },

    upgradeNode: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const node = g.nodes.find((n) => n.id === id);
      if (!node) return;
      if (
        g.incidents.some((incident) => !incident.resolved && incident.targetType === 'node' && incident.targetId === id)
      ) {
        s.toast(
          say(s.locale, 'Resolve the site fault before upgrading it.', 'Yükseltmeden önce noktadaki arızayı gider.'),
          'bad',
        );
        return;
      }
      if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
        s.toast(
          say(
            s.locale,
            'Finish or clear the planned work before upgrading this site.',
            'Bu noktayı yükseltmeden önce planlı işi bitir veya iptal et.',
          ),
          'bad',
        );
        return;
      }
      const mods = researchModifiers(g.researchDone);
      const spec = NODE_SPECS[node.kind];
      const maxTier =
        node.kind === 'core' ? mods.maxCoreTier : node.kind === 'tower' ? mods.maxTowerTier : spec.maxTier;
      if (node.tier >= maxTier) {
        s.toast(
          say(s.locale, 'Needs new research to go further.', 'Daha ileri gitmek için yeni araştırma gerekiyor.'),
          'bad',
        );
        return;
      }
      const cost = nodeUpgradeCost(node.kind, node.tier);
      if (node.kind === 'datacenter' && node.tier === 0 && !g.researchDone.includes('edge_compute')) {
        s.toast(
          say(
            s.locale,
            'Research edge compute to expand to a full data centre.',
            'Tam merkeze genişletmek için Edge araştırması gerekiyor.',
          ),
          'bad',
        );
        return;
      }
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(
          draft,
          'network_upgrade',
          line(`${node.name}: tier ${node.tier + 1}`, `${node.name}: ${node.tier + 1}. seviye`),
          -cost,
        );
        draft.nodes = draft.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                tier: n.tier + 1,
                capacityGbps: effectiveNodeCapacity(n.kind, n.tier + 1, draft.spectrum, draft.researchDone),
                health: Math.max(n.health, 92),
                servicedAt: draft.minutes,
              }
            : n,
        );
      });
      s.toast(say(s.locale, `${node.name} upgraded`, `${node.name} yükseltildi`), 'good', node.gx, node.gy);
    },

    repairNode: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const node = g.nodes.find((n) => n.id === id);
      if (!node) return;
      const cost = Math.round((100 - node.health) * 260);
      if (cost <= 0) return;
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(draft, 'network_service', line(`Service: ${node.name}`, `Bakım: ${node.name}`), -cost);
        draft.nodes = draft.nodes.map((n) => (n.id === id ? { ...n, health: 100, servicedAt: draft.minutes } : n));
      });
      s.toast(say(s.locale, 'Maintenance done', 'Bakım tamamlandı'), 'good', node.gx, node.gy);
    },

    scheduleMaintenance: (id, mode) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const node = g.nodes.find((entry) => entry.id === id);
      if (!node) return;
      if (mode === 'defer') {
        s.toast(
          say(
            s.locale,
            `${node.name} stays in service, and its failure odds keep climbing.`,
            `${node.name} hizmette kalıyor, arıza ihtimali artmayı sürdürüyor.`,
          ),
          'info',
        );
        return;
      }
      if (node.down || g.incidents.some((incident) => !incident.resolved && incident.targetId === id)) {
        s.toast(
          say(
            s.locale,
            'Resolve the active fault before planning service.',
            'Bakım planlamadan önce açık arızayı gider.',
          ),
          'bad',
        );
        return;
      }
      if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
        s.toast(
          say(s.locale, 'This site already has planned work queued.', 'Bu nokta için zaten planlı iş var.'),
          'bad',
        );
        return;
      }
      const cost = maintenanceCost(node, mode);
      if (g.money < cost) {
        s.toast(
          say(s.locale, 'Not enough cash for this maintenance window.', 'Bu bakım penceresi için nakit yetmiyor.'),
          'bad',
        );
        return;
      }
      const config = MAINTENANCE_CONFIG[mode];
      const scheduledAt = maintenanceStart(g.minutes, mode);
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(
          draft,
          'network_service',
          line(`${config.label}: ${node.name}`, `${config.labelTr}: ${node.name}`),
          -cost,
        );
        draft.maintenanceOrders = [
          ...draft.maintenanceOrders,
          {
            id: uid('maint'),
            nodeId: id,
            mode,
            status: 'scheduled',
            scheduledAt,
            startedAt: null,
            minutesLeft: config.durationMinutes,
            technicianId: null,
            cost,
          },
        ];
        pushLog(
          draft,
          line(
            `${config.label} booked for ${node.name}.`,
            `${node.name} için ${config.labelTr.toLocaleLowerCase('tr-TR')} planlandı.`,
          ),
          'info',
        );
      });
      s.toast(
        mode === 'urgent'
          ? say(s.locale, 'Crew queued for dispatch', 'Ekip sevk sırasına alındı')
          : say(s.locale, '02:00 maintenance booked', 'Bakım 02:00 için planlandı'),
        'good',
        node.gx,
        node.gy,
      );
    },

    // Work that has not started yet can be called off and the fee returned.
    cancelMaintenance: (orderId) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const order = g.maintenanceOrders.find((entry) => entry.id === orderId);
      if (!order) return;
      if (order.status !== 'scheduled') {
        s.toast(
          say(
            s.locale,
            'The crew is already on site, so this cannot be called off.',
            'Ekip sahaya çıktığı için bu iş iptal edilemez.',
          ),
          'bad',
        );
        return;
      }
      const node = g.nodes.find((entry) => entry.id === order.nodeId);
      withGame(set, (draft) => {
        draft.money += order.cost;
        recordLedger(
          draft,
          'network_service',
          line(`Cancelled: ${node?.name ?? 'site'}`, `İptal: ${node?.name ?? 'nokta'}`),
          order.cost,
        );
        draft.maintenanceOrders = draft.maintenanceOrders.filter((entry) => entry.id !== orderId);
        pushLog(
          draft,
          line(
            `Planned work at ${node?.name ?? 'a site'} was called off.`,
            `${node?.name ?? 'Bir nokta'} için planlı iş iptal edildi.`,
          ),
          'info',
        );
      });
      s.toast(say(s.locale, 'Maintenance cancelled and refunded.', 'Bakım iptal edildi, ücret iade edildi.'), 'good');
    },

    sellNode: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const attachedLinkIds = new Set(
        g.links.filter((link) => link.aId === id || link.bId === id).map((link) => link.id),
      );
      const blockingIncident = g.incidents.find(
        (incident) =>
          !incident.resolved &&
          ((incident.targetType === 'node' && incident.targetId === id) ||
            (incident.targetType === 'link' && attachedLinkIds.has(incident.targetId))),
      );
      if (blockingIncident) {
        s.toast(
          say(
            s.locale,
            'Resolve faults on this site and its fibre before decommissioning it.',
            'Noktayı kaldırmadan önce kendisindeki ve fiberindeki arızaları gider.',
          ),
          'bad',
        );
        return;
      }
      if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
        s.toast(
          say(
            s.locale,
            'Complete the planned work before decommissioning this site.',
            'Bu noktayı kaldırmadan önce planlı işi tamamla.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        const node = draft.nodes.find((n) => n.id === id);
        if (!node) return;
        const refund = Math.round(nodeCapitalCost(node.kind, node.tier) * 0.35);
        draft.money += refund;
        recordLedger(draft, 'asset_sale', line(`Decommissioned: ${node.name}`, `Kaldırıldı: ${node.name}`), refund);
        draft.nodes = draft.nodes.filter((n) => n.id !== id);
        draft.links = draft.links.filter((l) => l.aId !== id && l.bId !== id);
        draft.dataCenterModes = Object.fromEntries(
          Object.entries(draft.dataCenterModes).filter(([nodeId]) => nodeId !== id),
        );
        draft.dataCenterModeChangedAt = Object.fromEntries(
          Object.entries(draft.dataCenterModeChangedAt).filter(([nodeId]) => nodeId !== id),
        );
        pushLog(
          draft,
          line(
            `${node.name} decommissioned (+${fmtMoneyExact(refund)}).`,
            `${node.name} kaldırıldı (+${fmtMoneyExact(refund)}).`,
          ),
          'info',
        );
      });
      set({ selection: null });
    },

    upgradeLink: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const link = g.links.find((l) => l.id === id);
      if (!link) return;
      const mods = researchModifiers(g.researchDone);
      if (link.tier >= mods.maxLinkTier) {
        s.toast(
          say(s.locale, 'Higher grade optics need research.', 'Daha üst sınıf optik için araştırma gerekiyor.'),
          'bad',
        );
        return;
      }
      const cost = Math.round(link.length * FIBER_UPGRADE_COST_PER_UNIT * link.tier);
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(draft, 'network_upgrade', line('Fibre capacity upgrade', 'Fiber kapasite yükseltmesi'), -cost);
        draft.links = draft.links.map((l) =>
          l.id === id ? { ...l, tier: l.tier + 1, capacityGbps: linkCapacity(l.tier + 1) * mods.linkCapacityMul } : l,
        );
      });
      s.toast(say(s.locale, 'Fibre upgraded', 'Fiber yükseltildi'), 'good');
    },

    sellLink: (id) => {
      const s = get();
      if (
        s.game?.incidents.some(
          (incident) => !incident.resolved && incident.targetType === 'link' && incident.targetId === id,
        )
      ) {
        s.toast(
          say(
            s.locale,
            'Resolve the fault before removing this fibre span.',
            'Bu fiber hattını kaldırmadan önce arızayı gider.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        const link = draft.links.find((l) => l.id === id);
        if (!link) return;
        const refund = Math.round(link.length * FIBER_COST_PER_UNIT * 0.2);
        draft.money += refund;
        recordLedger(draft, 'asset_sale', line('Fibre recovery', 'Fiber geri kazanımı'), refund);
        draft.links = draft.links.filter((l) => l.id !== id);
      });
      set({ selection: null });
    },

    launchDistrict: (id, kind) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return;
      const next = buildDistrictLaunch(s.game, id, kind);
      if (!next) {
        s.toast(
          say(
            s.locale,
            'Launch unavailable. Review the current cash and network requirements.',
            'Açılış yapılamıyor. Nakit ve şebeke gereksinimlerini gözden geçir.',
          ),
          'bad',
        );
        return;
      }
      const site = next.nodes[next.nodes.length - 1];
      const launchedIn = next.districts.find((d) => d.id === id)!.name;
      pushLog(
        next,
        line(`Starter network commissioned in ${launchedIn}.`, `${launchedIn} ilçesinde başlangıç şebekesi kuruldu.`),
        'good',
      );
      set({
        game: { ...next, speed: 0 },
        screen: 'map',
        tool: null,
        linkFrom: null,
        selection: { type: 'district', id },
      });
      s.focus(site.gx, site.gy);
      s.toast(
        say(
          s.locale,
          'District connected. Win your first 100 customers, then protect the route.',
          'İlçe bağlandı. İlk 100 müşterini kazan, sonra rotayı koru.',
        ),
        'good',
      );
    },

    unlockDistrict: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const district = g.districts.find((d) => d.id === id);
      if (!district || district.unlocked) return;
      if (g.money < district.entryCost) {
        s.toast(say(s.locale, 'Not enough money for the licence.', 'Lisans için yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= district.entryCost;
        recordLedger(
          draft,
          'district_licence',
          line(`${district.name} licence`, `${district.name} lisansı`),
          -district.entryCost,
        );
        draft.districts = draft.districts.map((d) => (d.id === id ? { ...d, unlocked: true } : d));
        pushLog(
          draft,
          line(`Licensed to build in ${district.name}.`, `${district.name} ilçesinde kurulum lisansı alındı.`),
          'good',
        );
      });
      s.toast(
        say(s.locale, `${district.name} licensed`, `${district.name} lisanslandı`),
        'good',
        district.center.gx,
        district.center.gy,
      );
    },

    dispatchTech: (incidentId, mode, techId) => {
      const s = get();
      const g = s.game;
      if (!g || g.gameOver || s.planning || s.drillTarget) return;
      const inc = g.incidents.find((i) => i.id === incidentId);
      if (!inc || inc.resolved) return;
      if (inc.assignedTechId) {
        s.toast(
          say(s.locale, 'A crew is already assigned to that incident.', 'Bu arızaya zaten bir ekip atandı.'),
          'bad',
        );
        return;
      }
      const candidates = dispatchCandidates(g, inc, mode);
      const tech = (techId ? candidates.find((c) => c.technician.id === techId) : candidates[0])?.technician;
      if (!tech) {
        s.toast(
          techId
            ? say(
                s.locale,
                'That crew is no longer available. Choose another crew.',
                'Bu ekip artık müsait değil. Başka bir ekip seç.',
              )
            : say(s.locale, 'Every crew is already out.', 'Bütün ekipler sahada.'),
          'bad',
        );
        return;
      }
      // Emergency work needs cash up front.
      if (mode === 'emergency') {
        const cost = repairCost(inc, 'emergency');
        if (g.money < cost) {
          s.toast(
            say(s.locale, 'Not enough cash for an emergency call-out.', 'Acil çağrı için nakit yetmiyor.'),
            'bad',
          );
          return;
        }
      }
      withGame(set, (draft) => dispatchTechnician(draft, incidentId, tech.id, mode));
      set({ openIncidentId: null });
      s.toast(say(s.locale, `${tech.name} is on the way`, `${tech.name} yola çıktı`), 'info');
    },

    setTrafficPolicy: (policy) => {
      const s = get();
      const g = s.game;
      if (!g || policy === g.trafficPolicy) return;
      if (policy !== 'balanced' && !g.researchDone.includes('noc')) {
        s.toast(
          say(
            s.locale,
            'A Network Operations Centre is required for traffic policy control.',
            'Trafik politikası kontrolü için Şebeke Operasyon Merkezi gerekiyor.',
          ),
          'bad',
        );
        return;
      }
      if (policy === 'mobile' && !g.researchDone.includes('mobile_5g')) {
        s.toast(
          say(
            s.locale,
            '5G Standalone research unlocks the mobile network slice.',
            '5G Standalone araştırması mobil ağ dilimini açar.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.trafficPolicy = policy;
        pushLog(
          draft,
          line(
            `Traffic policy changed to ${policy.replace(/_/g, ' ')}.`,
            `Trafik politikası ${TRAFFIC_POLICY_CONFIG[policy].labelTr} olarak değiştirildi.`,
          ),
          'info',
        );
      });
      s.toast(say(s.locale, 'Traffic policy applied', 'Trafik politikası uygulandı'), 'good');
    },

    setInterconnectPlan: (plan) => {
      const s = get();
      const g = s.game;
      if (!g || plan === g.interconnectPlan) return;
      const config = INTERCONNECT_CONFIG[plan];
      const routes = config.requiresDataCenter ? computeRoutes(g) : {};
      if (
        config.requiresDataCenter &&
        !g.nodes.some((node) => node.kind === 'datacenter' && !node.down && routes[node.id])
      ) {
        s.toast(
          say(
            s.locale,
            'The CDN partner needs an online data centre.',
            'CDN ortağı için çalışan bir veri merkezi gerekiyor.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.interconnectPlan = plan;
        pushLog(
          draft,
          line(`${config.label} interconnection activated.`, `${config.labelTr} bağlantısı etkinleştirildi.`),
          'info',
        );
      });
      s.toast(say(s.locale, `${config.label} selected`, `${config.labelTr} seçildi`), 'good');
    },

    setDataCenterMode: (nodeId, mode) => {
      const s = get();
      const g = s.game;
      const node = g?.nodes.find((entry) => entry.id === nodeId && entry.kind === 'datacenter');
      if (!g || !node || g.dataCenterModes[nodeId] === mode) return;
      const changedAt = g.dataCenterModeChangedAt[nodeId] ?? 0;
      const availableAt = changedAt > 0 ? changedAt + DATA_CENTER_MODE_COOLDOWN : -Infinity;
      if (g.minutes < availableAt) {
        const wait = Math.ceil((availableAt - g.minutes) / MINUTES_PER_DAY);
        s.toast(
          say(
            s.locale,
            `Workload change available in ${wait} ${plural(wait, 'day')}.`,
            `İş yükü değişimi ${wait} gün sonra yapılabilir.`,
          ),
          'bad',
        );
        return;
      }
      const config = DATA_CENTER_MODE_CONFIG[mode];
      const cost = dataCenterModeChangeCost(node);
      if (g.money < cost) {
        s.toast(
          say(
            s.locale,
            'Not enough cash to reconfigure this data centre.',
            'Bu veri merkezini yeniden yapılandırmak için nakit yetmiyor.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.money -= cost;
        recordLedger(
          draft,
          'network_service',
          line(`${node.name}: ${config.label} reconfiguration`, `${node.name}: ${config.labelTr} yapılandırması`),
          -cost,
        );
        draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: mode };
        draft.dataCenterModeChangedAt = { ...draft.dataCenterModeChangedAt, [nodeId]: draft.minutes };
        pushLog(
          draft,
          line(
            `${node.name} switched to ${config.label}.`,
            `${node.name} ${config.labelTr.toLocaleLowerCase('tr-TR')} moduna geçti.`,
          ),
          'info',
        );
      });
      s.toast(
        say(
          s.locale,
          `${config.label} workload applied · ${fmtMoneyExact(cost)}`,
          `${config.labelTr} iş yükü uygulandı · ${fmtMoneyExact(cost)}`,
        ),
        'good',
      );
    },

    setTransitTier: (tier) => {
      const s = get();
      const g = s.game;
      if (!g || tier === g.transitTier) return;
      withGame(set, (draft) => {
        draft.transitTier = tier;
        pushLog(draft, line('Upstream transit changed.', 'Üst bağlantı transiti değiştirildi.'), 'info');
      });
      s.toast(say(s.locale, 'Transit updated', 'Transit güncellendi'), 'good');
    },

    setEnergyPlan: (plan) => {
      const s = get();
      if (!s.game || s.planning) return false;
      const next = applyEnergyPlan(s.game, plan);
      if (!next) return false;
      set({ game: next });
      s.toast(say(s.locale, 'Energy tariff updated', 'Enerji tarifesi güncellendi'), 'good');
      return true;
    },

    installSolar: (nodeId) => {
      const s = get();
      if (!s.game || s.planning) return false;
      const next = buildSolar(s.game, nodeId, researchModifiers(s.game.researchDone).hasOnsiteSolar);
      if (!next) return false;
      set({ game: next });
      s.toast(say(s.locale, 'On-site generation commissioned', 'Saha üretimi devreye alındı'), 'good');
      return true;
    },

    toggleBackupTransit: () => withGame(set, (draft) => void (draft.backupTransit = !draft.backupTransit)),

    toggleAutoDispatch: () => withGame(set, (draft) => void (draft.autoDispatch = !draft.autoDispatch)),
  }) satisfies Partial<Store>;
