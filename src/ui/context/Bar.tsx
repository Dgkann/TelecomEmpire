import { motion } from 'framer-motion';
import { utilColor } from '../../game/constants';

export const fmtMins = (m: number, tr = false) =>
  m < 120 ? `${Math.round(m)} ${tr ? 'dk' : 'min'}` : `${Math.round(m / 60)}${tr ? ' sa' : 'h'}`;

export function Bar({ value, label, right }: { value: number; label: string; right?: string }) {
  const pct = Math.min(1, value);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/50">
        <span>{label}</span>
        <span className="num">{right ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: utilColor(value) }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
}
