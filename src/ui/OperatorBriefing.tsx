import type { InsightSeverity, OperationsInsight } from '../game/operations';

// Shared with the priority list beneath the briefing, so an insight keeps its colour when it moves.
export const INSIGHT_TONE: Record<InsightSeverity, string> = {
  critical: '#ff5d73',
  warning: '#ffc857',
  opportunity: '#7ee787',
};

const LABELS: Record<InsightSeverity, [string, string]> = {
  critical: ['Immediate action', 'Hemen müdahale'],
  warning: ['Next priority', 'Sıradaki öncelik'],
  opportunity: ['Best next move', 'En iyi sonraki hamle'],
};

export default function OperatorBriefing({
  item,
  tr,
  onActivate,
}: {
  item: OperationsInsight;
  tr: boolean;
  onActivate: () => void;
}) {
  const tone = INSIGHT_TONE[item.severity];
  return (
    <section
      className="panel relative mb-2 overflow-hidden p-3.5"
      aria-label={tr ? 'Operasyon brifingi' : 'Operations briefing'}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tone }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 pl-1">
        <span className="text-[10px] font-semibold text-white/55">{LABELS[item.severity][tr ? 1 : 0]}</span>
        <span className="num text-[9px] text-white/30">{tr ? 'Tek görev' : 'One task'}</span>
      </div>
      <h2 className="mt-1.5 pl-1 text-sm font-semibold leading-snug text-white/90">{item.title}</h2>
      <p className="mt-1.5 pl-1 text-[11px] leading-relaxed text-white/55">{item.detail}</p>
      <button
        className="mt-3 min-h-7 rounded-sm border px-2.5 py-1.5 text-left text-[11px] font-semibold"
        style={{ borderColor: `${tone}66`, color: tone, background: `${tone}0d` }}
        onClick={onActivate}
      >
        {item.action}
      </button>
    </section>
  );
}
