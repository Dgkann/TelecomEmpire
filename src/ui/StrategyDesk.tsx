import ExpansionPlanner from './ExpansionPlanner';
import { plural } from '../game/util';
import { useState } from 'react';
import { useGame } from '../store/gameStore';
import { DECISIONS, decisionIssue, challengeProgress } from '../game/board';
import { acquisitionQuote } from '../game/acquisitions';
import { rivalArpu } from '../game/competitors';
import { fmtMoney } from '../game/economy';
import { MINUTES_PER_DAY } from '../game/constants';

const issues: Record<string, [string, string]> = {
  expired: ['This proposal has expired.', 'Teklifin süresi doldu.'],
  invalid: ['Choose an available option.', 'Geçerli bir seçenek seç.'],
  cash: ['Insufficient cash.', 'Nakit yetersiz.'],
  service: ['Needs 40% coverage and 65 satisfaction.', '%40 kapsama ve 65 memnuniyet gerekiyor.'],
  developed: ['This district is fully developed.', 'Bu ilçenin gelişimi tamamlandı.'],
  event: ['Wait for the current city event to finish.', 'Mevcut şehir etkinliğinin bitmesini bekle.'],
  crews: ['Hire a crew below skill level 5 first.', 'Önce becerisi 5 seviyesinin altında bir ekip işe al.'],
  missing: ['This rival is no longer available.', 'Bu rakip artık mevcut değil.'],
  closed: ['This company has closed.', 'Bu şirket kapandı.'],
  rank: ['Requires Regional Operator rank.', 'Bölgesel Operatör seviyesi gerekiyor.'],
  competition: ['At least one independent rival must remain.', 'En az bir bağımsız rakip kalmalı.'],
  auction: ['Finish the spectrum auction first.', 'Önce spektrum ihalesini tamamla.'],
  core: ['Requires a live core.', 'Çalışan bir çekirdek gerekiyor.'],
  space: ['Not enough room to integrate this network.', 'Şebeke entegrasyonu için yeterli alan yok.'],
  licence: ['License a district reached by this rival first.', 'Önce rakibin hizmet verdiği bir ilçenin lisansını al.'],
};

export default function StrategyDesk() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const decide = useGame((s) => s.resolveBoardDecision);
  const acquire = useGame((s) => s.acquireRival);
  const claim = useGame((s) => s.claimCharter);
  const focus = useGame((s) => s.focus);
  const [tab, setTab] = useState<'decisions' | 'market' | 'city' | 'expansion'>('decisions');
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const tr = locale === 'tr';
  const lang = tr ? 1 : 0;
  const days = (at: number) => Math.max(0, Math.ceil((at - game.minutes) / MINUTES_PER_DAY));
  const decision = game.strategy.decision;
  const definition = decision ? DECISIONS[decision.kind] : null;
  const challenge = challengeProgress(game);
  const quote = selectedRival ? acquisitionQuote(game, selectedRival) : null;
  return (
    <section
      id="strategy-desk"
      className="panel p-4 lg:col-span-3"
      aria-label={tr ? 'Strateji masası' : 'Strategy desk'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="stat-label text-neon-amber">
            {tr ? 'Büyümenin bir sonraki adımı' : 'The next stage of growth'}
          </div>
          <h2 className="mt-1 text-lg font-semibold">{tr ? 'Strateji masası' : 'Strategy desk'}</h2>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={tr ? 'Strateji bölümleri' : 'Strategy sections'}>
          {(['decisions', 'market', 'city', 'expansion'] as const).map((id, i) => (
            <button
              key={id}
              className={tab === id ? 'btn-primary text-xs' : 'btn text-xs'}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {
                (tr
                  ? ['Kararlar', 'Rekabet', 'Şehir ve hedefler', 'Genişleme']
                  : ['Decisions', 'Competition', 'City & charters', 'Expansion'])[i]
              }
              {id === 'decisions' && decision ? ' •' : ''}
            </button>
          ))}
        </div>
      </div>
      {tab === 'expansion' && <ExpansionPlanner />}
      {tab === 'decisions' && (
        <div className="mt-4">
          {decision && definition ? (
            <>
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold text-neon-cyan">{definition.title[lang]}</h3>
                <span className="text-xs text-neon-amber">
                  {game.districts.find((d) => d.id === decision.districtId)?.name} · {days(decision.dueAt)}{' '}
                  {tr ? 'gün kaldı' : 'days left'}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/60">{definition.description[lang]}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {definition.options.map((o) => {
                  const issue = decisionIssue(game, decision.id, o.id);
                  return (
                    <article key={o.id} className="flex flex-col rounded-md border border-white/10 bg-black/15 p-3">
                      <h4 className="text-sm font-semibold">{o.title[lang]}</h4>
                      <p className="my-2 flex-1 text-xs leading-relaxed text-white/60">{o.detail[lang]}</p>
                      <div className="mb-2 font-mono text-neon-amber">{fmtMoney(o.cost)}</div>
                      {issue && <p className="mb-2 text-xs text-neon-amber">{issues[issue]?.[lang]}</p>}
                      <button className="btn text-xs" disabled={!!issue} onClick={() => decide(decision.id, o.id)}>
                        {tr ? 'Bu seçeneği uygula' : 'Choose this option'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-white/10 bg-black/10 p-4 text-sm text-white/60">
              {tr
                ? `Yeni şehir teklifi yaklaşık ${days(game.strategy.nextDecisionAt)} gün içinde gelecek. Kararların maliyeti ve sonucu burada gösterilir.`
                : `A new city proposal arrives in about ${days(game.strategy.nextDecisionAt)} ${plural(days(game.strategy.nextDecisionAt), 'day')}. Review its costs and consequences here.`}
            </p>
          )}
        </div>
      )}
      {tab === 'market' && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-white/60">
            {tr
              ? 'Fiyat endeksi 1,00 piyasa ortalamasıdır. Daha ucuz rakipler müşteri baskısı yaratır; satın alma için Bölgesel Operatör seviyesine ulaş.'
              : 'A price index of 1.00 is the market average. Cheaper rivals increase customer pressure; acquisitions unlock at Regional Operator rank.'}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {game.competitors.map((c) => (
              <article key={c.id} className="rounded-md border border-white/10 p-3">
                <h3 className="font-semibold" style={{ color: c.color }}>
                  {c.name}
                </h3>
                <dl className="mt-2 space-y-1 text-xs text-white/60">
                  <div className="flex justify-between">
                    <dt>{tr ? 'Fiyat endeksi' : 'Price index'}</dt>
                    <dd className={c.priceIndex < 1 ? 'text-neon-amber' : ''}>
                      {c.priceIndex.toFixed(2)} · {fmtMoney(rivalArpu(c))}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{tr ? 'Nakit' : 'Cash'}</dt>
                    <dd>{fmtMoney(c.cash)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{tr ? 'Teknoloji' : 'Technology'}</dt>
                    <dd>{c.tech.toFixed(2)}</dd>
                  </div>
                </dl>
                <div className="mt-2 space-y-1">
                  {game.districts
                    .filter((d) => d.unlocked)
                    .map((d) => (
                      <div key={d.id} className="flex justify-between text-[11px] text-white/60">
                        <span>{d.name}</span>
                        <span>
                          {Math.round((c.share[d.id] ?? 0) * 100)}% {tr ? 'pay' : 'share'}
                        </span>
                      </div>
                    ))}
                </div>
                <button
                  className="btn mt-3 w-full text-xs"
                  aria-expanded={selectedRival === c.id}
                  onClick={() => setSelectedRival(selectedRival === c.id ? null : c.id)}
                >
                  {tr ? 'Satın almayı incele' : 'Review acquisition'}
                </button>
              </article>
            ))}
          </div>
          {quote?.rival && (
            <article
              className="rounded-md border border-neon-amber/40 bg-neon-amber/5 p-4"
              aria-label={tr ? 'Satın alma teklifi' : 'Acquisition quote'}
            >
              <h3 className="font-semibold">{quote.rival.name}</h3>
              <p className="my-2 text-xs leading-relaxed text-white/65">
                {tr
                  ? 'Yalnızca lisanslı ilçelerde sabit müşteriler ve bağlı POP noktaları devralınır. Spektrum aktarılır; rakibin kasası ve mobil müşterileri dahil değildir. Ek müşteri trafiği kapasiteni zorlayabilir.'
                  : 'Integrates fixed customers and connected POPs in licensed districts only. Spectrum transfers; rival cash and mobile customers are excluded. Additional customers may strain your capacity.'}
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                {[
                  [tr ? 'Şirket bedeli' : 'Company price', quote.price],
                  [tr ? 'Şebeke entegrasyonu' : 'Network integration', quote.integrationCost],
                  [tr ? 'Toplam' : 'Total', quote.total],
                  [tr ? 'Ek aylık gider' : 'Added monthly cost', quote.monthlyCost],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-white/55">{label}</div>
                    <strong className="text-neon-amber">{fmtMoney(Number(value))}</strong>
                  </div>
                ))}
              </div>
              {quote.issue && <p className="mt-3 text-xs text-neon-amber">{issues[quote.issue]?.[lang]}</p>}
              <button
                className="btn-primary mt-3 text-xs"
                disabled={!!quote.issue}
                onClick={() => {
                  acquire(quote.rival!.id);
                  setSelectedRival(null);
                }}
              >
                {tr ? 'Satın al ve entegre et' : 'Acquire and integrate'} · {fmtMoney(quote.total)}
              </button>
            </article>
          )}
        </div>
      )}
      {tab === 'city' && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-md border border-white/10 p-3">
            <h3 className="font-semibold">
              {tr ? 'Operatör hedefi' : 'Operator charter'} · {game.strategy.challengesCompleted}
            </h3>
            {challenge ? (
              <>
                <p className="my-2 text-sm text-white/65">
                  {
                    {
                      resilience: ['Redundant fixed sites', 'Yedekli sabit noktalar'],
                      enterprise: ['Business contracts', 'Kurumsal sözleşmeler'],
                      mobile: ['Mobile customers', 'Mobil müşteriler'],
                    }[challenge.kind][lang]
                  }
                  : {challenge.current} / {challenge.target}
                </p>
                <progress
                  className="w-full accent-teal-400"
                  value={Math.min(challenge.current, challenge.target)}
                  max={challenge.target}
                />
                <p className="my-2 text-xs text-white/60">
                  {tr ? 'Şebeke sağlığı en az 85 olmalı.' : 'Network health must be at least 85.'}{' '}
                  {Math.round(game.stats.health)}/100 · {days(challenge.dueAt)}{' '}
                  {tr ? 'gün' : plural(days(challenge.dueAt), 'day')}
                </p>
                <button
                  className="btn-primary text-xs"
                  disabled={!challenge.complete || game.minutes >= challenge.dueAt}
                  onClick={claim}
                >
                  {tr ? 'Hedef ödülünü al' : 'Claim charter reward'} · {fmtMoney(challenge.reward)} + 20 RP
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/60">
                {tr
                  ? `Şehir Operatörü seviyesinde açılır. Sıradaki değerlendirme: ${days(game.strategy.nextChallengeAt)} gün. Her turda hedefler kademeli olarak yükselir.`
                  : `Unlocks at City Operator rank. Next review: ${days(game.strategy.nextChallengeAt)} ${plural(days(game.strategy.nextChallengeAt), 'day')}. Targets increase across successive rounds.`}
              </p>
            )}
          </article>
          <article className="rounded-md border border-white/10 p-3">
            <h3 className="font-semibold">{tr ? 'Gelişen mahalleler' : 'Growing neighbourhoods'}</h3>
            <p className="my-2 text-xs text-white/60">
              {tr
                ? 'En az %40 kapsama ve 65 memnuniyet sağlayan ilçeler zamanla büyür. Yeni haneler henüz abone değildir.'
                : 'Districts with at least 40% coverage and 65 satisfaction grow over time. New homes start without a subscription.'}
            </p>
            {game.strategy.developments.slice(0, 4).map((d, i) => {
              const district = game.districts.find((x) => x.id === d.districtId)!;
              return (
                <button
                  key={`${d.at}-${i}`}
                  className="btn mt-1 flex w-full justify-between text-xs"
                  onClick={() => focus(district.center.gx, district.center.gy)}
                >
                  <span>{district.name}</span>
                  <span>
                    +{d.households} {tr ? 'hane' : plural(d.households, 'home')} ↗
                  </span>
                </button>
              );
            })}
          </article>
        </div>
      )}
      {game.strategy.history.length > 0 && (
        <details className="mt-4 border-t border-white/10 pt-3">
          <summary className="cursor-pointer text-xs text-white/60">
            {tr ? 'Karar ve gelişim geçmişi' : 'Decision and development history'}
          </summary>
          <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs text-white/60">
            {game.strategy.history.map((h) => (
              <li key={h.id}>
                <span className="mr-2 text-white/35">{Math.floor(h.at / MINUTES_PER_DAY)}d</span>
                {tr ? h.textTr : h.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
