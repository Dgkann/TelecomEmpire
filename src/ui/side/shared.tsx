export function Stars({ n }: { n: number }) {
  return (
    <span className="text-[11px] text-neon-amber">
      {'★'.repeat(n)}
      <span className="text-white/20">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function scrollToAnchor(id: string, tries = 40) {
  const networkView =
    id === 'traffic-policy' || id === 'interconnect'
      ? 'policy'
      : id === 'maintenance'
        ? 'operations'
        : id === 'transit'
          ? 'interconnect'
          : null;
  if (networkView) window.dispatchEvent(new CustomEvent('network:view', { detail: networkView }));
  const el = document.getElementById(id);
  const shell = el?.closest('.screen-shell') as HTMLElement | null;
  if (el && shell && el.offsetTop > 0) {
    shell.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    return;
  }
  if (tries > 0) requestAnimationFrame(() => scrollToAnchor(id, tries - 1));
}
