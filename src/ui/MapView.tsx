import { useMapQuality } from './useMapQuality';
import { ProjectFootprint, ProjectMapLabel } from './ProjectMap';
import { failureDrill } from '../game/failureDrill';
import FailureDrillPanel, { FailureFootprint } from './FailureDrill';
import { reachGain } from '../game/reach';
import DistrictNavigator from './DistrictNavigator';
import { connectedSiteEstimate } from '../game/connectedBuild';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { computeRoutes, linkUtil } from '../game/network';
import { fibreConnectionCost, fibreConnectionIssue, nodePlacementCost, nodePlacementIssue } from '../game/placement';
import { daylight, incidentLocation } from '../game/simulation';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { suggestedBackhaul } from '../game/investment';
import { fmtMoneyExact } from '../game/economy';
import { projectBlueprint } from '../game/blueprint';
import type { District, GameState, NetLink, NetNode } from '../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, tileDiamond, unIso } from './iso';

import { COMPANY } from './map/palette';
import {
  GroundLayer,
  DistrictOutlines,
  CityTraffic,
  BuildingsLayer,
  ConnectionRings,
  RivalsLayer,
  CoverageLayer,
  CustomersLayer,
} from './map/layers';
import { LinkGlyph, NodeGlyph, TechnicianGlyph } from './map/glyphs';

const PLACEMENT_BLOCKER = '[data-map-placement-blocker="true"]';

function isMapBackgroundTarget(target: EventTarget | null, map: Element) {
  return target instanceof Element && map.contains(target) && target.closest(PLACEMENT_BLOCKER) === null;
}
interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export default function MapView() {
  const locale = useGame((s) => s.locale);
  const drillTarget = useGame((s) => s.drillTarget);
  const liveGame = useGame((s) => s.game) as GameState;
  const { quality, chooseQuality, economical } = useMapQuality(liveGame.nodes.length);
  const autoConnect = useGame((s) => s.autoConnect);
  const planning = useGame((s) => s.planning);
  const blueprint = useGame((s) => s.blueprint);
  const game = useMemo(
    () => (planning ? projectBlueprint(liveGame, blueprint).state : liveGame),
    [liveGame, planning, blueprint],
  );
  const drill = useMemo(() => (drillTarget ? failureDrill(liveGame, drillTarget) : null), [liveGame, drillTarget]);
  const developedIds = useMemo(
    () =>
      new Set(game.strategy.developments.filter((d) => game.minutes - d.at < 7 * 1440).flatMap((d) => d.buildingIds)),
    [game.strategy.developments, game.minutes],
  );
  const plannedIds = useMemo(() => new Set(blueprint.map((entry) => entry.id)), [blueprint]);
  const setTool = useGame((s) => s.setTool);
  const tr = useGame((s) => s.locale) === 'tr';
  const overlay = useGame((s) => s.overlay);
  const tool = useGame((s) => s.tool);
  const linkFrom = useGame((s) => s.linkFrom);
  const selection = useGame((s) => s.selection);
  const focusOn = useGame((s) => s.focusOn);
  const placeNode = useGame((s) => s.placeNode);
  const clickNodeForLink = useGame((s) => s.clickNodeForLink);
  const select = useGame((s) => s.select);
  const openIncident = useGame((s) => s.openIncident);
  const toasts = useGame((s) => s.toasts);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: -60, zoom: 1 });
  // The map is drawn as stacked layers so a change in one never repaints the others.
  // They all share the camera: SVG layers as an attribute, the building canvas as CSS.
  const groundRef = useRef<SVGGElement>(null);
  const underlayRef = useRef<SVGGElement>(null);
  const buildingsWorldRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const svgCamera = (c: Camera) => `translate(${size.w / 2} ${size.h / 2}) scale(${c.zoom}) translate(${c.x} ${c.y})`;
  const cssCamera = (c: Camera) =>
    `translate(${size.w / 2}px, ${size.h / 2}px) scale(${c.zoom}) translate(${c.x}px, ${c.y}px)`;
  const panCamera = useRef<Camera | null>(null);
  const panFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
    },
    [],
  );
  const finishPan = () => {
    if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
    panFrame.current = null;
    if (panCamera.current) setCam(panCamera.current);
    panCamera.current = null;
    svgRef.current?.classList.remove('dragging');
  };
  const [hover, setHover] = useState<{ gx: number; gy: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camX: number;
    camY: number;
    moved: boolean;
    startedOnBackground: boolean;
  } | null>(null);
  const fittedSize = useRef('');

  const worldBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const include = (x: number, y: number, padX = 0, padY = padX) => {
      minX = Math.min(minX, x - padX);
      maxX = Math.max(maxX, x + padX);
      minY = Math.min(minY, y - padY);
      maxY = Math.max(maxY, y + padY);
    };
    for (const district of game.districts) {
      for (const cell of district.cells)
        include(isoX(cell.gx, cell.gy), isoY(cell.gx, cell.gy), TILE_W / 2, TILE_H / 2);
      include(isoX(district.center.gx, district.center.gy), isoY(district.center.gx, district.center.gy) - 78, 60, 18);
    }
    for (const building of game.buildings) {
      include(
        isoX(building.gx, building.gy),
        isoY(building.gx, building.gy) - building.floors * FLOOR_H,
        TILE_W / 2,
        24,
      );
    }
    for (const node of game.nodes) {
      const mast = node.kind === 'tower' ? 26 + node.tier * 3 : 0;
      include(isoX(node.gx, node.gy), isoY(node.gx, node.gy) - mast, 28, 28);
    }
    if (!Number.isFinite(minX)) return { minX: -400, maxX: 400, minY: -220, maxY: 220 };
    return { minX, maxX, minY, maxY };
  }, [game.districts, game.buildings, game.nodes]);

  const fitCamera = useCallback(() => {
    const safe = { left: size.w >= 950 ? 295 : 24, right: 35, top: 118, bottom: 142 };
    const worldW = Math.max(1, worldBounds.maxX - worldBounds.minX);
    const worldH = Math.max(1, worldBounds.maxY - worldBounds.minY);
    const availableW = Math.max(240, size.w - safe.left - safe.right);
    const availableH = Math.max(180, size.h - safe.top - safe.bottom);
    const zoom = Math.min(1.25, Math.max(0.2, Math.min(availableW / worldW, availableH / worldH)));
    const worldCx = (worldBounds.minX + worldBounds.maxX) / 2;
    const worldCy = (worldBounds.minY + worldBounds.maxY) / 2;
    const safeCx = safe.left + availableW / 2;
    const safeCy = safe.top + availableH / 2;
    setCam({
      zoom,
      x: (safeCx - size.w / 2) / zoom - worldCx,
      y: (safeCy - size.h / 2) / zoom - worldCy,
    });
  }, [size, worldBounds]);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
      }
    };

    // Measure before the first paint, then keep it in step.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const key = `${size.w}`;
    if (fittedSize.current === key || size.w <= 0 || size.h <= 0) return;
    fittedSize.current = key;
    fitCamera();
  }, [fitCamera, size]);

  useEffect(() => {
    if (!focusOn) return;
    setCam((c) => ({
      ...c,
      x: -isoX(focusOn.gx, focusOn.gy),
      y: -isoY(focusOn.gx, focusOn.gy),
      zoom: Math.max(c.zoom, 1.1),
    }));
  }, [focusOn]);

  // Quantised so the day/night value only changes a few dozen times per game day.
  const lightingSteps = economical ? 4 : 16;
  const night = Math.round((1 - daylight(game.minutes)) * lightingSteps) / lightingSteps;
  const nodeById = useMemo(() => {
    const m: Record<string, NetNode> = {};
    for (const n of game.nodes) m[n.id] = n;
    return m;
  }, [game.nodes]);

  const nodeGrid = useMemo(() => {
    const map = new Map<string, NetNode>();
    for (const node of game.nodes) map.set(`${node.gx},${node.gy}`, node);
    return map;
  }, [game.nodes]);

  const districtGrid = useMemo(() => {
    const m = new Map<string, District>();
    for (const d of game.districts) for (const c of d.cells) m.set(`${c.gx},${c.gy}`, d);
    return m;
  }, [game.districts]);

  const incidentByTarget = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of game.incidents) if (!i.resolved) m[i.targetId] = i.id;
    return m;
  }, [game.incidents]);

  const handleLinkSelect = useCallback(
    (id: string) => {
      if (planning || drillTarget) return;
      if (incidentByTarget[id]) openIncident(incidentByTarget[id]);
      else select({ type: 'link', id });
    },
    [planning, drillTarget, incidentByTarget, openIncident, select],
  );
  const handleNodeSelect = useCallback(
    (id: string) => {
      if (drillTarget) return;
      if (planning && tool !== 'fiber') {
        setTool('fiber');
        clickNodeForLink(id);
      } else if (tool === 'fiber') clickNodeForLink(id);
      else if (incidentByTarget[id]) openIncident(incidentByTarget[id]);
      else select({ type: 'node', id });
    },
    [drillTarget, planning, tool, setTool, clickNodeForLink, incidentByTarget, openIncident, select],
  );
  const routes = useMemo(() => computeRoutes(game), [game]);
  const selectedRoute = useMemo(() => {
    if (selection?.type !== 'node') return null;
    const route = routes[selection.id];
    if (!route) return { route: null, links: new Set<string>(), bottleneck: null as string | null };
    const links = new Set(route.path);
    const bottleneck =
      route.path
        .map((id) => game.links.find((l) => l.id === id))
        .filter((l): l is NetLink => Boolean(l))
        .sort((a, b) => linkUtil(b) - linkUtil(a))[0]?.id ?? null;
    return { route, links, bottleneck };
  }, [game, selection, routes]);

  const toGrid = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      // size, not rect, because that is what the render transform is centred on.
      const sx = (clientX - rect.left - size.w / 2) / cam.zoom - cam.x;
      const sy = (clientY - rect.top - size.h / 2) / cam.zoom - cam.y;
      const { gx, gy } = unIso(sx, sy);
      const rx = Math.round(gx);
      const ry = Math.round(gy);
      if (rx < 0 || ry < 0 || rx >= game.gridSize || ry >= game.gridSize) return null;
      return { gx: rx, gy: ry };
    },
    [cam, size, game.gridSize],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      camX: cam.x,
      camY: cam.y,
      moved: false,
      startedOnBackground: isMapBackgroundTarget(e.target, e.currentTarget),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.pointerId === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        if (!d.moved) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pointer capture improves dragging but is never required for a click.
          }
        }
        d.moved = true;
        panCamera.current = { ...cam, x: d.camX + dx / cam.zoom, y: d.camY + dy / cam.zoom };
        e.currentTarget.classList.add('dragging');
        if (panFrame.current === null)
          panFrame.current = requestAnimationFrame(() => {
            panFrame.current = null;
            const c = panCamera.current;
            if (!c) return;
            for (const layer of [groundRef, underlayRef, worldRef])
              layer.current?.setAttribute('transform', svgCamera(c));
            if (buildingsWorldRef.current) buildingsWorldRef.current.style.transform = cssCamera(c);
          });
      }
    } else if (tool) {
      const next = toGrid(e.clientX, e.clientY);
      setHover((prev) => (prev?.gx === next?.gx && prev?.gy === next?.gy ? prev : next));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    finishPan();
    if (!d || d.pointerId !== e.pointerId || d.moved || drillTarget) return;
    const cell = toGrid(e.clientX, e.clientY);
    if (!cell) return;

    if (tool && tool !== 'fiber') {
      const releaseTarget = document.elementFromPoint(e.clientX, e.clientY);
      if (!d.startedOnBackground || !isMapBackgroundTarget(releaseTarget, e.currentTarget)) return;
      placeNode(tool, cell.gx, cell.gy);
      return;
    }
    if (tool === 'fiber') return; // fibre is drawn by clicking nodes

    const district = districtGrid.get(`${cell.gx},${cell.gy}`);
    if (district) select({ type: 'district', id: district.id });
  };

  const cancelPointerGesture = (e: React.PointerEvent) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    finishPan();
    setHover(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    finishPan();
    const rect = svgRef.current?.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setCam((c) => {
      const zoom = Math.min(2.6, Math.max(0.2, c.zoom * factor));
      if (!rect || zoom === c.zoom) return { ...c, zoom };
      // Hold whatever is under the pointer still while the scale changes.
      const px = e.clientX - rect.left - size.w / 2;
      const py = e.clientY - rect.top - size.h / 2;
      return {
        zoom,
        x: px / zoom - px / c.zoom + c.x,
        y: py / zoom - py / c.zoom + c.y,
      };
    });
  };

  const linkFromNode = linkFrom ? nodeById[linkFrom] : null;
  const hoveredNode = hover ? (nodeGrid.get(`${hover.gx},${hover.gy}`) ?? null) : null;
  const connectedQuote =
    autoConnect && !planning && tool && tool !== 'fiber' && hover
      ? connectedSiteEstimate(game, tool, hover.gx, hover.gy, routes, locale)
      : null;
  const placementIssue =
    connectedQuote?.error ??
    (tool && tool !== 'fiber' && hover ? nodePlacementIssue(game, tool, hover.gx, hover.gy, tr ? 'tr' : 'en') : null);
  const placementCost = connectedQuote?.total ?? (tool && tool !== 'fiber' ? nodePlacementCost(game, tool) : null);
  const backhaul =
    tool && tool !== 'fiber' && tool !== 'core' && hover && !placementIssue
      ? suggestedBackhaul(game, hover.gx, hover.gy, routes)
      : null;
  const reachDistrict = hover ? districtGrid.get(`${hover.gx},${hover.gy}`) : null;
  const newReach =
    reachDistrict && (tool === 'pop' || tool === 'access') && !placementIssue
      ? reachGain(game, reachDistrict.id, tool, undefined, routes)
      : null;
  const placementColor = placementIssue ? '#ff6577' : COMPANY;
  const fibreIssue =
    linkFromNode && hoveredNode ? fibreConnectionIssue(game, linkFromNode.id, hoveredNode.id, tr ? 'tr' : 'en') : null;
  const fibreCost = linkFromNode && hoveredNode ? fibreConnectionCost(game, linkFromNode.id, hoveredNode.id) : 0;
  const fibreColor = hoveredNode && !fibreIssue ? COMPANY : '#ff6577';
  const selectedDistrictId = selection?.type === 'district' ? selection.id : null;
  const outageDistrictIds = Object.entries(game.stats.outages)
    .filter(([, down]) => down)
    .map(([id]) => id);
  const obligationDistrictIds = game.regulations
    .filter((regulation) => regulation.status === 'pending' && regulation.districtId)
    .map((regulation) => regulation.districtId!);

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-ink-900 ${game.speed === 0 ? 'simulation-paused' : ''} ${economical ? 'map-economical' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-1000"
        style={{
          background: `linear-gradient(180deg, ${mix('#294854', '#0c1d30', night)} 0%, ${mix(
            '#152b38',
            '#091320',
            night,
          )} 100%)`,
        }}
      />
      <DistrictNavigator />
      {drill && <FailureDrillPanel report={drill} />}
      <svg className="map-layer pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g ref={groundRef} transform={svgCamera(cam)} opacity={1 - night * 0.3}>
          <GroundLayer
            districts={game.districts}
            night={0}
            selectedId={selectedDistrictId}
            outageIds={outageDistrictIds}
            obligationIds={obligationDistrictIds}
          />
        </g>
      </svg>
      <svg className="map-layer pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g ref={underlayRef} transform={svgCamera(cam)}>
          <g opacity={1 - night * 0.3}>
            <DistrictOutlines
              districts={game.districts}
              selectedId={selectedDistrictId}
              outageIds={outageDistrictIds}
              obligationIds={obligationDistrictIds}
            />
          </g>
          {!drill && <ProjectFootprint game={game} />}
          {overlay === 'normal' && !economical && <CityTraffic districts={game.districts} />}
          {overlay === 'coverage' && (
            <CoverageLayer nodes={game.nodes} districts={game.districts} spectrum={game.spectrum} />
          )}
          {overlay === 'rivals' && <RivalsLayer game={game} />}
        </g>
      </svg>
      <div
        ref={buildingsWorldRef}
        className="map-layer map-buildings pointer-events-none absolute left-0 top-0"
        style={{ transformOrigin: '0 0', transform: cssCamera(cam) }}
      >
        <BuildingsLayer
          economical={economical}
          developedIds={developedIds}
          buildings={game.buildings}
          night={night}
          dim={overlay === 'load' || overlay === 'rivals' || overlay === 'customers'}
        />
      </div>
      <svg
        ref={svgRef}
        role="application"
        aria-label={
          tr
            ? 'Etkileşimli telekom şebeke haritası. Nokta ve fiber kontrollerine Tab ile ulaşabilir veya yakınlaştırma düğmelerini kullanabilirsin.'
            : 'Interactive telecom network map. Use the site and fibre controls in the tab order, or the zoom buttons.'
        }
        className={`map-surface relative h-full w-full ${drag.current ? 'dragging' : ''} ${tool ? 'building' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelPointerGesture}
        onLostPointerCapture={cancelPointerGesture}
        onPointerLeave={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) cancelPointerGesture(e);
        }}
        onWheel={onWheel}
      >
        <defs>
          <filter id="fibreBloom" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g ref={worldRef} style={{ pointerEvents: drill ? 'none' : undefined }} transform={svgCamera(cam)}>
          <ConnectionRings buildings={game.buildings} minutes={game.minutes} economical={economical} />
          {overlay === 'customers' && <CustomersLayer game={game} />}

          {tool && tool !== 'fiber' && hover && (
            <g opacity={0.92} style={{ pointerEvents: 'none' }}>
              {backhaul && (
                <>
                  <line
                    x1={isoX(hover.gx, hover.gy)}
                    y1={isoY(hover.gx, hover.gy) - 6}
                    x2={isoX(backhaul.node.gx, backhaul.node.gy)}
                    y2={isoY(backhaul.node.gx, backhaul.node.gy) - 6}
                    stroke="#edc684"
                    strokeWidth={2}
                    strokeDasharray="4 5"
                  />
                  <text
                    x={isoX(hover.gx, hover.gy)}
                    y={isoY(hover.gx, hover.gy) - 60}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#ffe1a9"
                    stroke="#112431"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {tr ? 'Önerilen fiber' : 'Suggested fibre'} +{fmtMoneyExact(backhaul.cost)}
                  </text>
                </>
              )}
              {newReach && (
                <g>
                  <rect
                    x={isoX(hover.gx, hover.gy) - 84}
                    y={isoY(hover.gx, hover.gy) - 78}
                    width={168}
                    height={24}
                    rx={5}
                    fill="#132b35"
                    stroke="#73c8ae"
                  />
                  <text
                    x={isoX(hover.gx, hover.gy)}
                    y={isoY(hover.gx, hover.gy) - 68}
                    textAnchor="middle"
                    fill="#9ee8cf"
                    fontSize={8}
                  >
                    +{newReach.homes} {tr ? 'potansiyel hane' : 'potential homes'}
                  </text>
                  <text
                    x={isoX(hover.gx, hover.gy)}
                    y={isoY(hover.gx, hover.gy) - 59}
                    textAnchor="middle"
                    fill="#a4b7be"
                    fontSize={7}
                  >
                    {t(locale, 'afterBackhaulSignups')}
                  </text>
                </g>
              )}
              <polygon points={tileDiamond(hover.gx, hover.gy, 0)} fill={placementColor} opacity={0.3} />
              <circle
                cx={isoX(hover.gx, hover.gy)}
                cy={isoY(hover.gx, hover.gy) - 8}
                r={11}
                fill="#0f1622"
                stroke={placementColor}
                strokeWidth={2}
              />
              <rect
                x={isoX(hover.gx, hover.gy) - 76}
                y={isoY(hover.gx, hover.gy) - 49}
                width={152}
                height={16}
                rx={4}
                fill="#050b14"
                stroke={placementColor}
                strokeWidth={0.8}
              />
              <text
                x={isoX(hover.gx, hover.gy)}
                y={isoY(hover.gx, hover.gy) - 38}
                textAnchor="middle"
                fontSize={7.3}
                fontWeight={700}
                fill={placementColor}
                className="num"
              >
                {placementIssue ??
                  `${connectedQuote ? (tr ? 'Nokta + fiber' : 'Site + fibre') : tr ? 'Hazır' : 'Ready'} · ${placementCost?.toLocaleString(tr ? 'tr-TR' : 'en-US')}`}
              </text>
            </g>
          )}

          {tool === 'fiber' && linkFromNode && hover && (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={isoX(linkFromNode.gx, linkFromNode.gy)}
                y1={isoY(linkFromNode.gx, linkFromNode.gy) - 6}
                x2={isoX(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy)}
                y2={isoY(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy) - 6}
                stroke={fibreColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.8}
              />
              <rect
                x={
                  (isoX(linkFromNode.gx, linkFromNode.gy) +
                    isoX(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy)) /
                    2 -
                  64
                }
                y={
                  (isoY(linkFromNode.gx, linkFromNode.gy) +
                    isoY(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy)) /
                    2 -
                  29
                }
                width={128}
                height={16}
                rx={4}
                fill="#050b14"
                stroke={fibreColor}
                strokeWidth={0.8}
              />
              <text
                x={
                  (isoX(linkFromNode.gx, linkFromNode.gy) +
                    isoX(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy)) /
                  2
                }
                y={
                  (isoY(linkFromNode.gx, linkFromNode.gy) +
                    isoY(hoveredNode?.gx ?? hover.gx, hoveredNode?.gy ?? hover.gy)) /
                    2 -
                  18
                }
                textAnchor="middle"
                fontSize={7.3}
                fontWeight={700}
                fill={fibreColor}
                className="num"
              >
                {hoveredNode
                  ? (fibreIssue ?? `${tr ? 'HAZIR' : 'READY'} · ${fmtMoneyExact(fibreCost)}`)
                  : tr
                    ? 'HEDEF NOKTAYI SEÇ'
                    : 'CHOOSE A DESTINATION SITE'}
              </text>
            </g>
          )}

          {game.links.map((l) => {
            const a = nodeById[l.aId];
            const b = nodeById[l.bId];
            if (!a || !b) return null;
            return (
              <LinkGlyph
                ghost={plannedIds.has(l.id)}
                key={l.id}
                link={l}
                a={a}
                b={b}
                selected={selection?.type === 'link' && selection.id === l.id}
                highlight={overlay === 'load'}
                traced={selectedRoute?.links.has(l.id) ?? false}
                bottleneck={selectedRoute?.bottleneck === l.id}
                onSelect={handleLinkSelect}
                tr={tr}
              />
            );
          })}

          {[...game.nodes]
            .sort((a, b) => a.gx + a.gy - (b.gx + b.gy))
            .map((n) => (
              <NodeGlyph
                isolated={!routes[n.id] && !n.down}
                ghost={plannedIds.has(n.id)}
                key={n.id}
                node={n}
                selected={selection?.type === 'node' && selection.id === n.id}
                fiberState={
                  tool !== 'fiber'
                    ? null
                    : linkFrom === n.id
                      ? 'source'
                      : linkFrom && fibreConnectionIssue(game, linkFrom, n.id)
                        ? 'blocked'
                        : 'eligible'
                }
                hasIncident={!!incidentByTarget[n.id]}
                onSelect={handleNodeSelect}
                tr={tr}
              />
            ))}

          {!drill && <ProjectMapLabel game={game} />}
          {drill && <FailureFootprint game={game} report={drill} />}
          {game.technicians
            .filter((t) => t.state !== 'idle')
            .map((t) => (
              <TechnicianGlyph key={t.id} t={t} />
            ))}

          {game.incidents
            .filter((i) => !i.resolved && i.targetType === 'link')
            .map((i) => {
              const p = incidentLocation(game, i);
              return (
                <g
                  key={i.id}
                  data-map-placement-blocker="true"
                  className="alert-blink"
                  onClick={(e) => (e.stopPropagation(), openIncident(i.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={isoX(p.gx, p.gy)} cy={isoY(p.gx, p.gy) - 14} r={9} fill="#ff5c68" />
                  <text
                    x={isoX(p.gx, p.gy)}
                    y={isoY(p.gx, p.gy) - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#0b0e14"
                  >
                    !
                  </text>
                </g>
              );
            })}

          {game.districts.map((d) => {
            const lx = isoX(d.center.gx, d.center.gy);
            const ly = isoY(d.center.gx, d.center.gy) - 104;
            const outage = outageDistrictIds.includes(d.id);
            const obligation = obligationDistrictIds.includes(d.id);
            const selected = selectedDistrictId === d.id;
            const coverage = tr
              ? `KAPSAMA %${Math.round(d.coverage * 100)}`
              : `${Math.round(d.coverage * 100)}% COVERAGE`;
            const status = outage
              ? tr
                ? 'KESİNTİ'
                : 'OUTAGE'
              : obligation
                ? `${tr ? 'YÜKÜMLÜLÜK' : 'OBLIGATION'} · ${coverage}`
                : selected
                  ? coverage
                  : null;
            return (
              <g key={`lbl${d.id}`} style={{ pointerEvents: 'none' }}>
                <rect
                  x={lx - 62}
                  y={ly - 13}
                  width={124}
                  height={d.unlocked && !status ? 20 : 34}
                  rx={3}
                  fill="#050b14"
                  opacity={0.6}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  className="font-display"
                  fontSize={13}
                  fontWeight={600}
                  letterSpacing="0.22em"
                  fill={d.unlocked ? '#eaf1fa' : '#9fb2c9'}
                  opacity={d.unlocked ? 0.95 : 0.7}
                >
                  {d.name}
                </text>
                <line
                  x1={lx - 22}
                  y1={ly + 5}
                  x2={lx + 22}
                  y2={ly + 5}
                  stroke={outage ? '#d36e76' : obligation ? '#d2a657' : selected ? COMPANY : d.color}
                  strokeWidth={1}
                  opacity={d.unlocked ? 0.5 : 0.25}
                />
                {!d.unlocked && (
                  <text
                    x={lx}
                    y={ly + 19}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={10}
                    fill="#8ea0b8"
                    opacity={0.75}
                  >
                    {tr ? 'Lisans' : 'Licence'} {fmtMoneyExact(d.entryCost)}
                  </text>
                )}
                {d.unlocked && status && (
                  <text
                    x={lx}
                    y={ly + 19}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={8.5}
                    fontWeight={700}
                    fill={outage ? '#d36e76' : obligation ? '#d2a657' : COMPANY}
                  >
                    {status}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Vignette pulls the eye to the middle of the board. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(135% 110% at 50% 46%, transparent 52%, rgba(4,9,17,0.16) 80%, rgba(3,7,13,0.38) 100%)',
        }}
      />

      {/* Fine grain, so the flat fills do not read as plastic. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)',
          backgroundSize: '4px 4px',
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence>
          {toasts
            .filter((t) => t.gx !== undefined)
            .map((t) => {
              const x = size.w / 2 + (isoX(t.gx!, t.gy!) + cam.x) * cam.zoom;
              const y = size.h / 2 + (isoY(t.gx!, t.gy!) + cam.y) * cam.zoom;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 0, scale: 0.8 }}
                  animate={{ opacity: 1, y: -34, scale: 1 }}
                  exit={{ opacity: 0, y: -52 }}
                  transition={{ duration: 0.5 }}
                  className={`absolute -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg ${
                    t.tone === 'good'
                      ? 'bg-neon-cyan/90 text-ink-900'
                      : t.tone === 'bad'
                        ? 'bg-neon-red/90 text-ink-900'
                        : 'bg-white/85 text-ink-900'
                  }`}
                  style={{ left: x, top: y }}
                >
                  {t.text}
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>

      {selection?.type === 'node' && selectedRoute && (
        <div className="panel pointer-events-none absolute bottom-[92px] right-4 w-[230px] p-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-neon-cyan">{t(locale, 'routeTrace')}</span>
            <span
              className={`h-2 w-2 rounded-full ${selectedRoute.route ? 'bg-neon-lime shadow-[0_0_9px_#7ee787]' : 'bg-neon-red shadow-[0_0_9px_#ff5d73]'}`}
            />
          </div>
          {selectedRoute.route ? (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="num text-sm text-white">{selectedRoute.route.path.length}</div>
                <div className="stat-label">{t(locale, 'hops')}</div>
              </div>
              <div>
                <div className="num text-sm text-white">{selectedRoute.route.distance.toFixed(1)}</div>
                <div className="stat-label">{t(locale, 'distance')}</div>
              </div>
              <div>
                <div className="num text-sm text-neon-amber">
                  {selectedRoute.bottleneck
                    ? Math.round(linkUtil(game.links.find((l) => l.id === selectedRoute.bottleneck)!) * 100)
                    : 0}
                  %
                </div>
                <div className="stat-label">{t(locale, 'peak')}</div>
              </div>
              <div className="col-span-3 border-t border-white/[0.07] pt-2 text-left text-[10px] text-white/45">
                {t(locale, 'routeTraceBlurb')}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-neon-red">{t(locale, 'noLivePathToCore')}</div>
          )}
        </div>
      )}

      <div className="absolute bottom-24 right-4 flex flex-col gap-1">
        <details className="relative">
          <summary
            aria-label={tr ? 'Harita görsel ayarları' : 'Map visual settings'}
            className="panel flex h-8 w-8 cursor-pointer list-none items-center justify-center text-[10px]"
          >
            FX
          </summary>
          <div className="panel absolute bottom-0 right-10 w-52 p-3">
            <label className="text-xs" htmlFor="map-quality">
              {t(locale, 'mapDetail')}
            </label>
            <select
              id="map-quality"
              className="mt-2 w-full rounded border border-white/20 bg-ink-900 p-2 text-xs"
              value={quality}
              onChange={(e) => chooseQuality(e.target.value as 'auto' | 'full' | 'performance')}
            >
              <option value="auto">{t(locale, 'autoLabel')}</option>
              <option value="full">{t(locale, 'fullDetail')}</option>
              <option value="performance">{t(locale, 'performanceMode')}</option>
            </select>
            <p className="mt-2 text-[11px] text-white/60">
              {tr
                ? `${economical ? 'Azaltılmış ortam efektleri etkin.' : 'Tüm şehir efektleri etkin.'} Şebeke alarmları görünür kalır.`
                : `${economical ? 'Reduced ambient effects are active.' : 'Full city effects are active.'} Network alerts stay visible.`}
            </p>
          </div>
        </details>
        <button
          className="panel h-8 w-8 text-lg leading-none hover:bg-white/10"
          onClick={() => setCam((c) => ({ ...c, zoom: Math.min(2.6, c.zoom * 1.2) }))}
          aria-label={tr ? 'Yakınlaştır' : 'Zoom in'}
        >
          +
        </button>
        <button
          className="panel h-8 w-8 text-lg leading-none hover:bg-white/10"
          onClick={() => setCam((c) => ({ ...c, zoom: Math.max(0.2, c.zoom / 1.2) }))}
          aria-label={tr ? 'Uzaklaştır' : 'Zoom out'}
        >
          −
        </button>
        <button
          className="panel h-8 w-8 text-[10px] leading-none hover:bg-white/10"
          onClick={fitCamera}
          title={tr ? 'Şehri kullanılabilir harita alanına sığdır' : 'Fit city inside the usable map area'}
          aria-label={tr ? 'Şehri ekrana sığdır' : 'Fit city'}
        >
          fit
        </button>
      </div>
    </div>
  );
}
