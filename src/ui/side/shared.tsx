export function Stars({ n }: { n: number }) {
  return (
    <span className="text-[11px] text-neon-amber">
      {'★'.repeat(n)}
      <span className="text-white/20">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function scrollToAnchor(id: string) {
  const networkView =
    id === 'traffic-policy' || id === 'interconnect'
      ? 'policy'
      : id === 'maintenance'
        ? 'operations'
        : id === 'transit'
          ? 'interconnect'
          : null;
  // Screens are lazy loaded. A fixed frame count can expire before a mobile
  // browser downloads the target screen, even though navigation succeeds.
  const deadline = performance.now() + 5000;
  const attempt = () => {
    if (networkView) window.dispatchEvent(new CustomEvent('network:view', { detail: networkView }));
    const el = document.getElementById(id);
    const shell = el?.closest('.screen-shell') as HTMLElement | null;
    if (el && shell && shell.clientHeight > 0) {
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        shell.scrollTo({
          top: shell.scrollTop + el.getBoundingClientRect().top - shell.getBoundingClientRect().top - 16,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      });
      return;
    }
    if (performance.now() < deadline) requestAnimationFrame(attempt);
  };
  attempt();
}
