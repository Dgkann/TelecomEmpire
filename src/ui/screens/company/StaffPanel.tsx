import { fmtMoney } from '../../../game/economy';
import { CREW_HIRE_COST, STAFF_HIRE_COST, STAFF_ROLE_INFO, STAFF_SALARY } from '../../../game/staff';
import { t } from '../../i18n';
import { HIRE_ROLES } from './shared';
import type { CompanyModel } from './model';

const CREW_STATE_TR = { idle: 'boşta', driving: 'yolda', working: 'çalışıyor', returning: 'dönüyor' } as const;

export default function StaffPanel({ vm }: { vm: CompanyModel }) {
  const tr = vm.locale === 'tr';
  return (
    <div id="staff" className="panel panel-tone-blue p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">{t(vm.locale, 'staff')}</h2>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md bg-white/[0.03] p-2">
          <div className="text-white/35">{t(vm.locale, 'maintenanceSaving')}</div>
          <div className="num text-neon-lime">{Math.round((1 - vm.staff.maintenanceCostMul) * 100)}%</div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-2">
          <div className="text-white/35">{t(vm.locale, 'incidentReduction')}</div>
          <div className="num text-neon-lime">{Math.round((1 - vm.staff.incidentRateMul) * 100)}%</div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-2">
          <div className="text-white/35">{t(vm.locale, 'supportBonus')}</div>
          <div className="num text-neon-cyan">+{vm.staff.supportSatisfaction.toFixed(1)}</div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-2">
          <div className="text-white/35">{t(vm.locale, 'researchPerDay')}</div>
          <div className="num text-neon-cyan">
            +{vm.staff.researchPointsPerDay} {tr ? 'AP' : 'RP'}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {vm.game.technicians.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div>
              <div className="text-sm">{t.name}</div>
              <div className="num text-[10px] text-white/40">
                {tr
                  ? `Saha ekibi · yetkinlik ${t.skill} · ${t.experience} XP · ${CREW_STATE_TR[t.state]}`
                  : `Field crew · skill ${t.skill} · ${t.experience} XP · ${t.state}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-white/50">{fmtMoney(t.salary)}</span>
              <button className="text-[11px] text-white/30 hover:text-neon-red" onClick={() => vm.fireStaff(t.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
        {vm.game.employees.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2"
            title={tr ? STAFF_ROLE_INFO[e.role].effectTr : STAFF_ROLE_INFO[e.role].effect}
          >
            <div>
              <div className="text-sm">{e.name}</div>
              <div className="num text-[10px] text-white/40">
                {tr
                  ? `${STAFF_ROLE_INFO[e.role].labelTr} · yetkinlik ${e.skill} · ${e.experience} XP`
                  : `${STAFF_ROLE_INFO[e.role].label} · skill ${e.skill} · ${e.experience} XP`}
              </div>
              <div className="mt-0.5 max-w-[230px] text-[10px] leading-snug text-white/30">
                {tr ? STAFF_ROLE_INFO[e.role].effectTr : STAFF_ROLE_INFO[e.role].effect}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-white/50">{fmtMoney(e.salary)}</span>
              <button className="text-[11px] text-white/30 hover:text-neon-red" onClick={() => vm.fireStaff(e.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-xs" onClick={vm.hireTechnician}>
          {t(vm.locale, 'hireFieldCrew')} · {fmtMoney(CREW_HIRE_COST)}
        </button>
        {HIRE_ROLES.map((role) => (
          <button
            key={role}
            className="btn text-xs"
            title={tr ? STAFF_ROLE_INFO[role].effectTr : STAFF_ROLE_INFO[role].effect}
            onClick={() => vm.hireEmployee(role)}
          >
            {tr
              ? `${STAFF_ROLE_INFO[role].labelTr} işe al · ${fmtMoney(STAFF_HIRE_COST)} + ${fmtMoney(STAFF_SALARY[role])}/ay`
              : `Hire ${STAFF_ROLE_INFO[role].label.toLowerCase()} · ${fmtMoney(STAFF_HIRE_COST)} + ${fmtMoney(STAFF_SALARY[role])}/mo`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-white/35">{t(vm.locale, 'staffBlurb')}</p>
    </div>
  );
}
