import { AnimatePresence, motion } from 'framer-motion';
import { useContextModel } from './context/model';
import NodeInspector from './context/NodeInspector';
import LinkInspector from './context/LinkInspector';
import BuildingInspector from './context/BuildingInspector';
import DistrictInspector from './context/DistrictInspector';
import { t } from './i18n';

export default function ContextPanel() {
  const cp = useContextModel();
  const { selection, select, node, link, building, district } = cp;

  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          key={selection.type + selection.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="panel scroll-thin absolute right-2 top-12 z-20 max-h-[calc(100%-160px)] w-[min(330px,calc(100%-16px))] overflow-y-auto border-white/[0.14] p-4 shadow-[0_24px_64px_-24px_rgba(0,0,0,.9)] sm:right-4 sm:top-4"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-neon-cyan/80 via-neon-cyan/20 to-transparent" />
          <button
            className="absolute right-3 top-3 text-white/40 hover:text-white"
            onClick={() => select(null)}
            aria-label={t(cp.locale, 'close')}
          >
            ✕
          </button>

          {node && <NodeInspector cp={cp} node={node} />}
          {link && <LinkInspector cp={cp} link={link} />}
          {building && <BuildingInspector cp={cp} building={building} />}
          {district && <DistrictInspector cp={cp} district={district} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
