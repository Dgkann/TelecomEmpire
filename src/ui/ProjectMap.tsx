import { TENDER_PROGRAMMES, ACCEPTANCE_MINUTES } from '../game/procurement';
import type { GameState } from '../game/types';
import { useGame } from '../store/gameStore';
import { isoX, isoY, tileDiamond } from './iso';

export function ProjectFootprint({ game }: { game: GameState }) {
  const project = game.procurement.tenders.find((t) => t.status === 'delivery');
  const district = game.districts.find((d) => d.id === project?.districtId);
  if (!project || !district) return null;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {district.cells.map((c) => (
        <polygon
          key={`${c.gx}-${c.gy}`}
          points={tileDiamond(c.gx, c.gy)}
          fill="#d2a657"
          fillOpacity={0.16}
          stroke="#e3bc72"
          strokeOpacity={0.4}
          strokeWidth={0.7}
        />
      ))}
    </g>
  );
}
export function ProjectMapLabel({ game }: { game: GameState }) {
  const project = game.procurement.tenders.find((t) => t.status === 'delivery');
  const district = game.districts.find((d) => d.id === project?.districtId);
  if (!project || !district) return null;
  return (
    <g
      pointerEvents="none"
      transform={`translate(${isoX(district.center.gx, district.center.gy)} ${isoY(district.center.gx, district.center.gy) - 146})`}
      aria-label="Active city project"
    >
      <rect x={-89} y={-14} width={178} height={25} rx={4} fill="#273333" stroke="#d2a657" strokeWidth={1} />
      <text textAnchor="middle" y={2} fill="#f2ce8b" fontSize={12} fontWeight={600}>
        City project · {(project.qualifyingMinutes / 60).toFixed(1)} / 6h
      </text>
    </g>
  );
}
export function DistrictProjectCard({ districtId }: { districtId: string }) {
  const game = useGame((s) => s.game)!;
  const setScreen = useGame((s) => s.setScreen);
  const tender = game.procurement.tenders.find(
    (t) => t.districtId === districtId && (t.status === 'open' || t.status === 'delivery'),
  );
  if (!tender) return null;
  return (
    <section
      className="rounded border border-neon-amber/30 bg-neon-amber/5 p-3"
      aria-label="District infrastructure project"
    >
      <p className="text-[11px] text-neon-amber">
        {tender.status === 'open' ? 'City tender available' : 'Your city delivery project'}
      </p>
      <h3 className="mt-1 text-sm font-semibold">{TENDER_PROGRAMMES[tender.kind].title}</h3>
      {tender.status === 'delivery' && (
        <>
          <p className="mt-2 text-xs text-white/60">Acceptance: {(tender.qualifyingMinutes / 60).toFixed(1)} / 6h</p>
          <div className="mt-1 h-1 bg-white/10">
            <div
              className="h-full bg-neon-amber"
              style={{ width: (tender.qualifyingMinutes / ACCEPTANCE_MINUTES) * 100 + '%' }}
            />
          </div>
        </>
      )}
      <button className="btn mt-3 w-full text-xs" onClick={() => setScreen('projects')}>
        Open project brief
      </button>
    </section>
  );
}
