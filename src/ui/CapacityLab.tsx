import { useMemo, useState } from 'react';
import { capacityOptions, capacityPlan, testCapacity, upgradeKey, type CapacityUpgrade } from '../game/capacityLab';
import { fmtMoney, fmtMoneyExact } from '../game/economy';
import { useGame } from '../store/gameStore';
import { t } from './i18n';

export default function CapacityLab() {
  const [snapshot, setSnapshot] = useState(() => useGame.getState().game!);
  const [multiplier, setMultiplier] = useState(2);
  const [cutLinkId, setCutLinkId] = useState<string | null>(null);
  const [items, setItems] = useState<CapacityUpgrade[]>([]);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const locale = useGame((s) => s.locale);
  const commission = useGame((s) => s.commissionUpgrades);
  const cash = useGame((s) => s.game!.money);
  const blocked = useGame((s) => s.planning || !!s.drillTarget);
  const options = useMemo(() => capacityOptions(snapshot), [snapshot]);
  const plan = useMemo(() => capacityPlan(snapshot, items), [snapshot, items]);
  const before = useMemo(() => testCapacity(snapshot, { multiplier, cutLinkId }), [snapshot, multiplier, cutLinkId]);
  const after = useMemo(() => testCapacity(plan.state, { multiplier, cutLinkId }), [plan.state, multiplier, cutLinkId]);
  const chosen = new Set(items.map(upgradeKey));
  const ranked = [...options].sort(
    (a, b) => (before.pressure.get(upgradeKey(b)) ?? 0) - (before.pressure.get(upgradeKey(a)) ?? 0),
  );
  const visible = ranked.filter((o) => `${o.label} ${o.type}`.toLowerCase().includes(filter.toLowerCase()));
  const refresh = () => {
    setSnapshot(useGame.getState().game!);
    setItems([]);
    setMessage('Snapshot refreshed.');
  };
  const toggle = (option: CapacityUpgrade) => {
    setItems((list) =>
      chosen.has(upgradeKey(option))
        ? list.filter((i) => upgradeKey(i) !== upgradeKey(option))
        : [...list, { type: option.type, id: option.id, tier: option.tier }],
    );
    setMessage('');
  };
  return (
    <section className="capacity-lab lg:col-span-2" aria-label="Network Lab">
      <div className="lab-heading">
        <div>
          <h2>{t(locale, 'networkLab')}</h2>
          <p>{t(locale, 'networkLabBlurb')}</p>
        </div>
        <button className="btn text-xs" onClick={refresh}>
          {t(locale, 'refreshSnapshot')}
        </button>
      </div>
      <div className="lab-controls">
        <fieldset>
          <legend>{t(locale, 'trafficScenario')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 1.5, 2, 3, 4].map((m) => (
              <button
                key={m}
                aria-pressed={multiplier === m}
                className={`lab-preset ${multiplier === m ? 'active' : ''}`}
                onClick={() => setMultiplier(m)}
              >
                {m === 1 ? 'Current' : `${m}× demand`}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          {t(locale, 'failureScenario')}
          <select
            aria-label="Lab fibre failure"
            value={cutLinkId ?? ''}
            onChange={(e) => setCutLinkId(e.target.value || null)}
          >
            <option value="">{t(locale, 'allCurrentRoutes')}</option>
            {options
              .filter((o) => o.type === 'link' && !snapshot.links.find((l) => l.id === o.id)?.down)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  Cut: {o.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="lab-workspace">
        <div className="lab-analysis">
          <div className="lab-result-heading">
            <div>
              <span>{t(locale, 'trafficDelivered')}</span>
              <strong>
                {Math.round(before.delivery * 100)}% <span aria-hidden="true">→</span>{' '}
                <em>{Math.round(after.delivery * 100)}%</em>
              </strong>
            </div>
            <p>
              {after.served.toFixed(2)} / {after.demand.toFixed(2)} Gbps
              <br />
              <span>with your proposed upgrades</span>
            </p>
          </div>
          <div className="lab-legend">
            <span>
              <i className="lab-current" />
              {t(locale, 'currentNetwork')}
            </span>
            <span>
              <i className="lab-proposed" />
              {t(locale, 'proposedNetwork')}
            </span>
          </div>
          <div role="img" aria-label="District service delivery comparison" className="lab-districts">
            {before.districts.map((d, i) => (
              <div className="lab-district" key={d.id}>
                <div>
                  <strong>{d.name}</strong>
                  <span>{d.demand > 0 ? `${d.demand.toFixed(2)} Gbps requested` : 'No current demand'}</span>
                </div>
                <div className="lab-track-pair">
                  <div>
                    <i className="lab-current" style={{ width: `${d.delivery * 100}%` }} />
                  </div>
                  <div>
                    <i className="lab-proposed" style={{ width: `${after.districts[i].delivery * 100}%` }} />
                  </div>
                </div>
                <b>
                  {Math.round(d.delivery * 100)}% / {Math.round(after.districts[i].delivery * 100)}%
                </b>
              </div>
            ))}
          </div>
          <p className="lab-note">
            Snapshot at day {Math.floor(snapshot.minutes / 1440) + 1}. Fixed, mobile, business and data-centre traffic
            share real route and transit limits. This test holds customers and prices constant; it is not a growth
            forecast.
          </p>
          {cutLinkId && (
            <p className="lab-warning">
              The selected fibre is cut only in this test. Capacity upgrades cannot reconnect an isolated site. Build an
              independent route from the map.
            </p>
          )}
        </div>
        <aside className="lab-order" aria-label="Capacity upgrade order">
          <h3>
            {t(locale, 'commissioningOrder')} <span>{items.length}/32</span>
          </h3>
          <dl>
            <div>
              <dt>{t(locale, 'capitalSpend')}</dt>
              <dd>{fmtMoneyExact(plan.cost)}</dd>
            </div>
            <div>
              <dt>{t(locale, 'addedMonthlyCosts')}</dt>
              <dd>+{fmtMoneyExact(plan.monthly)}</dd>
            </div>
            <div>
              <dt>{t(locale, 'cashAfterOrder')}</dt>
              <dd className={cash < plan.cost ? 'text-neon-red' : ''}>{fmtMoney(cash - plan.cost)}</dd>
            </div>
          </dl>
          {!items.length ? (
            <p className="lab-note">{t(locale, 'chooseUpgradesBlurb')}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={upgradeKey(item)}>
                  <span>{options.find((o) => upgradeKey(o) === upgradeKey(item))?.label}</span>
                  <button
                    aria-label={`Remove ${options.find((o) => upgradeKey(o) === upgradeKey(item))?.label}`}
                    onClick={() => toggle(item)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {plan.error && (
            <p role="alert" className="lab-warning">
              {plan.error}
            </p>
          )}
          <button
            className="btn-primary w-full"
            disabled={!items.length || !!plan.error || cash < plan.cost || blocked}
            onClick={() => {
              if (commission(items)) {
                setItems([]);
                setSnapshot(useGame.getState().game!);
                setMessage('Upgrades are live. Your new capacity is ready for service.');
              } else setMessage('Network conditions changed. Refresh the snapshot before trying again.');
            }}
          >
            Commission {items.length || ''} upgrade{items.length === 1 ? '' : 's'}
          </button>
          <button
            className="mt-2 w-full text-xs text-white/60 disabled:opacity-30"
            disabled={!items.length}
            onClick={() => setItems([])}
          >
            {t(locale, 'clearOrder')}
          </button>
          <p role="status" className="mt-3 text-xs text-teal-200">
            {message}
          </p>
        </aside>
      </div>
      <div className="lab-assets-heading">
        <div>
          <h3>{t(locale, 'capacityWorkbench')}</h3>
          <p>{t(locale, 'capacityWorkbenchBlurb')}</p>
        </div>
        <input
          aria-label="Find capacity asset"
          placeholder="Find site, fibre or transit"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="lab-assets">
        {visible.map((option) => {
          const key = upgradeKey(option),
            pressure = before.pressure.get(key) ?? 0;
          return (
            <div className={`lab-asset ${chosen.has(key) ? 'chosen' : ''}`} key={key}>
              <div className={`lab-load ${pressure > 1 ? 'overloaded' : ''}`}>
                {Math.round(pressure * 100)}%<small>offered load</small>
              </div>
              <div className="min-w-0">
                <strong>{option.label}</strong>
                <p>
                  {option.type === 'transit'
                    ? 'Transit plan'
                    : `${option.type === 'link' ? 'Fibre' : 'Site'} tier ${option.tier}`}{' '}
                  · {option.capacity.toFixed(1)} → {option.nextCapacity.toFixed(1)} Gbps
                </p>
                {option.issue && <p className="text-neon-amber">{option.issue}</p>}
              </div>
              <span className="lab-asset-cost">{option.cost ? fmtMoney(option.cost) : 'Monthly plan'}</span>
              <button
                aria-label={`${chosen.has(key) ? 'Remove' : 'Add'} upgrade ${option.label}`}
                aria-pressed={chosen.has(key)}
                disabled={!chosen.has(key) && (!!option.issue || items.length >= 32)}
                className="lab-preset"
                onClick={() => toggle(option)}
              >
                {chosen.has(key) ? 'Remove' : 'Add'}
              </button>
            </div>
          );
        })}
        {!visible.length && <p className="p-5 text-sm text-white/60">{t(locale, 'noMatchingAssets')}</p>}
      </div>
    </section>
  );
}
