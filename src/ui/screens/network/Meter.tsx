import { utilColor } from '../../../game/constants';

export function Meter({ v, label, right }: { v: number; label: string; right: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between text-[11px]">
        <span className="truncate text-white/60">{label}</span>
        <span className="num shrink-0 pl-2 text-white/45">{right}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, v * 100)}%`, background: utilColor(v) }}
        />
      </div>
    </div>
  );
}
