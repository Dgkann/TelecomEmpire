import { fmtMoney } from '../../../game/economy';
import { STAFF_ROLE_INFO } from '../../../game/staff';
import { t } from '../../i18n';
import { HIRE_ROLES } from './shared';
import type { CompanyModel } from './model';

export default function StaffPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-blue p-5">
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
          <div className="num text-neon-cyan">+{vm.staff.researchPointsPerDay} RP</div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {vm.game.technicians.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div>
              <div className="text-sm">{t.name}</div>
              <div className="num text-[10px] text-white/40">
                Field crew · skill {t.skill} · {t.experience} XP · {t.state}
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
            title={STAFF_ROLE_INFO[e.role].effect}
          >
            <div>
              <div className="text-sm">{e.name}</div>
              <div className="num text-[10px] text-white/40">
                {STAFF_ROLE_INFO[e.role].label} · skill {e.skill} · {e.experience} XP
              </div>
              <div className="mt-0.5 max-w-[230px] text-[10px] leading-snug text-white/30">
                {STAFF_ROLE_INFO[e.role].effect}
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
          {t(vm.locale, 'hireFieldCrew')} · $4k
        </button>
        {HIRE_ROLES.map((role) => (
          <button
            key={role}
            className="btn text-xs"
            title={STAFF_ROLE_INFO[role].effect}
            onClick={() => vm.hireEmployee(role)}
          >
            Hire {STAFF_ROLE_INFO[role].label.toLowerCase()} · $6k
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-white/35">{t(vm.locale, 'staffBlurb')}</p>
    </div>
  );
}
