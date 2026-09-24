import { linkUtil, nodeUtil } from '../../game/network';
import type { NetLink, NetNode } from '../../game/types';
import { SITE_VISUAL } from '../SiteIcon';

// Spoken names for sites and fibres, shared by the map and the network screen's lists so a screen
// reader hears the same thing in both places.
export function siteLabel(node: NetNode, tr: boolean) {
  const kind = tr ? SITE_VISUAL[node.kind].labelTr : SITE_VISUAL[node.kind].label;
  const load = Math.round(Math.min(1, nodeUtil(node)) * 100);
  return tr
    ? `${node.name}, ${kind}, seviye ${node.tier}, yüzde ${load} yük${node.down ? ', devre dışı' : ''}`
    : `${node.name}, ${kind}, tier ${node.tier}, ${load} percent load${node.down ? ', down' : ''}`;
}

export function fibreLabel(link: NetLink, a: NetNode, b: NetNode, tr: boolean) {
  const load = Math.round(linkUtil(link) * 100);
  return tr
    ? `${a.name} – ${b.name} fiber hattı, seviye ${link.tier}, yüzde ${load} yük${link.down ? ', kesik' : ''}`
    : `${a.name} to ${b.name} fibre, tier ${link.tier}, ${load} percent load${link.down ? ', down' : ''}`;
}
