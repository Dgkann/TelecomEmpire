import { startMarketOperation, cancelMarketOperation } from '../game/competition';
import { submitTenderBid, withdrawTenderBid } from '../game/procurement';
import { updateCompanyIdentity } from '../game/identity';
import { CREW_HIRE_COST, STAFF_HIRE_COST, STAFF_ROLE_INFO, STAFF_SALARY } from '../game/staff';
import { resolveDecision, claimChallenge } from '../game/board';
import { acquireCompany } from '../game/acquisitions';
import { MINUTES_PER_DAY } from '../game/constants';
import { resolveNegotiation } from '../game/contracts';
import { districtRedundancy } from '../game/network';
import { createLoan, creditLimit } from '../game/finance';
import { recordLedger } from '../game/financeLedger';
import { researchById, researchPrice } from '../game/research';
import { claimMilestone as grantMilestone, MILESTONES } from '../game/milestones';
import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { beginSignalTraining, turnSignalTile, finishSignalTraining } from '../game/signalTraining';
import { pushLog, redistributeMobilePackages, redistributePackages, residentialSubs } from '../game/simulation';
import { uid } from '../game/rng';
import { personName } from '../game/names';
import { makeRng } from '../game/rng';
import { CAMPAIGN_CONFIG } from '../game/strategy';
import { researchCopy } from '../game/researchCopy';
import { line } from '../game/lang';
import { say, SEGMENT_TR, withGame } from './shared';
import type { GetState, SetState } from './shared';
import type { Store } from './types';

// The company: identity, packages, research, customers and contracts, staff, money, the market and goals.
export const companyActions = (set: SetState, get: GetState) =>
  ({
    launchMarketOperation: (districtId, kind) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return false;
      const game = startMarketOperation(s.game, districtId, kind);
      if (!game) return false;
      set({ game });
      return true;
    },

    endMarketOperation: (id) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return false;
      const game = cancelMarketOperation(s.game, id);
      if (!game) return false;
      set({ game });
      return true;
    },

    bidOnTender: (id, price) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return false;
      const next = submitTenderBid(s.game, id, price);
      if (!next) return false;
      set({ game: next });
      return true;
    },

    withdrawTender: (id) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return false;
      const next = withdrawTenderBid(s.game, id);
      if (!next) return false;
      set({ game: next });
      return true;
    },

    resolveBoardDecision: (id, option) => {
      const s = get();
      if (!s.game || s.planning || s.drillTarget) return;
      const next = resolveDecision(s.game, id, option);
      if (next) set({ game: next });
    },

    acquireRival: (id) => {
      const s = get();
      if (!s.game || s.planning) return;
      const next = acquireCompany(s.game, id);
      if (next) set({ game: next });
    },

    claimCharter: () => {
      const s = get();
      if (!s.game || s.planning) return;
      const next = claimChallenge(s.game);
      if (next) set({ game: next });
    },

    claimMilestone: (id) => {
      const s = get();
      if (!s.game) return;
      const next = grantMilestone(s.game, id);
      if (!next) return;
      const goal = MILESTONES.find((m) => m.id === id)!;
      set({ game: next });
      s.toast(
        `${goal.title[s.locale === 'tr' ? 1 : 0]} · +${fmtMoneyExact(goal.reward)} · +${goal.research} ${s.locale === 'tr' ? 'araştırma puanı' : 'research points'}`,
        'good',
      );
    },

    startSignalTraining: (size, mode) => {
      const s = get();
      if (
        !s.game ||
        s.planning ||
        s.drillTarget ||
        s.openIncidentId ||
        s.showSaveManager ||
        s.showHelp ||
        s.game.auction
      )
        return;
      const next = beginSignalTraining(s.game, size, mode);
      if (next) set({ game: next });
    },

    rotateSignalTile: (index) => {
      const s = get();
      const next = s.game && turnSignalTile(s.game, index);
      if (next) set({ game: next });
    },

    submitSignalTraining: () => {
      const s = get();
      const next = s.game && finishSignalTraining(s.game);
      if (!next) return false;
      set({ game: next });
      return true;
    },

    closeSignalTraining: () => {
      const s = get();
      if (s.game) set({ game: { ...s.game, speed: 0, signalTraining: { ...s.game.signalTraining, active: null } } });
    },

    updateIdentity: (name, logo) => {
      const g = get().game;
      if (!g) return false;
      const next = updateCompanyIdentity(g, name, logo);
      if (!next) return false;
      set({ game: next });
      return true;
    },

    updatePackage: (id, patch) => {
      const s = get();
      const current = s.game?.packages.find((pack) => pack.id === id);
      if (!current) return;
      if (
        patch.active === false &&
        current.active &&
        !s.game?.packages.some((pack) => pack.id !== id && pack.segment === current.segment && pack.active)
      ) {
        s.toast(
          say(
            s.locale,
            `Keep at least one ${current.segment} package active.`,
            `En az bir ${SEGMENT_TR[current.segment]} paketi etkin kalmalı.`,
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.packages = draft.packages.map((pack) => (pack.id === id ? { ...pack, ...patch } : pack));
        if (current.segment === 'mobile') redistributeMobilePackages(draft);
        else redistributePackages(draft);
      });
    },

    startResearch: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const node = researchById(id);
      if (!node || g.researchActive || g.researchDone.includes(id)) return;
      if (!node.requires.every((r) => g.researchDone.includes(r))) {
        s.toast(say(s.locale, 'Prerequisites missing.', 'Ön koşullar eksik.'), 'bad');
        return;
      }
      const price = researchPrice(g.researchPoints, node);
      if (g.money < price.cash) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      if (g.researchPoints < node.points) {
        s.toast(
          say(s.locale, `Need ${node.points} research points.`, `${node.points} araştırma puanı gerekiyor.`),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.money -= price.cash;
        draft.researchPoints -= price.points;
        draft.researchActive = { id, daysLeft: node.days };
        recordLedger(
          draft,
          'research',
          line(`Research: ${node.name}`, `Araştırma: ${researchCopy(node, 'tr').name}`),
          -price.cash,
        );
        pushLog(
          draft,
          line(`Research started: ${node.name}.`, `Araştırma başladı: ${researchCopy(node, 'tr').name}.`),
          'info',
        );
      });
      const credit = price.credit
        ? say(
            s.locale,
            ` · ${price.creditPoints} spare RP saved ${fmtMoneyExact(price.credit)}`,
            ` · ${price.creditPoints} fazla AP ${fmtMoneyExact(price.credit)} düşürdü`,
          )
        : '';
      s.toast(
        say(s.locale, `Researching ${node.name}${credit}`, `${researchCopy(node, 'tr').name} araştırılıyor${credit}`),
        'good',
      );
    },

    acceptOffer: (id, mode = 'standard') => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const offer = g.offers.find((o) => o.id === id);
      if (!offer) return;
      if (g.contracts.some((contract) => contract.buildingId === offer.buildingId)) {
        s.toast(
          say(s.locale, 'That building already has an active contract.', 'Bu binada zaten etkin bir sözleşme var.'),
          'bad',
        );
        return;
      }
      const cover = offer.requiresRedundancy ? districtRedundancy(g, offer.districtId) : null;
      if (cover && !cover.complete) {
        const name =
          g.districts.find((d) => d.id === offer.districtId)?.name ?? say(s.locale, 'that district', 'o ilçe');
        s.toast(
          say(
            s.locale,
            `${name}: ${cover.done} of ${cover.total} ${plural(cover.total, 'site')} ${cover.total === 1 ? 'has' : 'have'} a second path.`,
            `${name}: ${cover.total} noktadan ${cover.done} tanesinin ikinci yolu var.`,
          ),
          'bad',
        );
        return;
      }

      const negotiation = resolveNegotiation(g, offer, mode);
      const building = g.buildings.find((entry) => entry.id === offer.buildingId);
      if (!negotiation.accepted) {
        withGame(set, (draft) => {
          draft.offers = draft.offers.filter((entry) => entry.id !== id);
          pushLog(
            draft,
            line(
              `${offer.clientName} rejected the premium counter and walked away.`,
              `${offer.clientName} primli karşı teklifi reddetti ve masadan kalktı.`,
            ),
            'bad',
          );
        });
        s.toast(
          say(s.locale, 'Premium counter rejected', 'Primli karşı teklif reddedildi'),
          'bad',
          building?.gx,
          building?.gy,
        );
        return;
      }

      const agreed = negotiation.terms;
      withGame(set, (draft) => {
        draft.offers = draft.offers.filter((o) => o.id !== id && o.buildingId !== offer.buildingId);
        draft.money += agreed.signingBonus;
        recordLedger(
          draft,
          'contract_bonus',
          line(`${agreed.clientName} signing bonus`, `${agreed.clientName} imza primi`),
          agreed.signingBonus,
        );
        draft.contracts = [
          ...draft.contracts,
          {
            id: uid('c'),
            clientName: agreed.clientName,
            districtId: agreed.districtId,
            buildingId: agreed.buildingId,
            bandwidthGbps: agreed.bandwidthGbps,
            monthlyRevenue: agreed.monthlyRevenue,
            slaPercent: agreed.slaPercent,
            downtimeMinutes: 0,
            penaltyPaid: 0,
            startedAt: draft.minutes,
            termMonths: agreed.termMonths,
            requiresRedundancy: agreed.requiresRedundancy,
            segment: agreed.segment,
          },
        ];
        draft.buildings = draft.buildings.map((b) =>
          b.id === agreed.buildingId ? { ...b, connected: 1, lastConnectedAt: draft.minutes } : b,
        );
        const term = mode === 'flexible' ? ' on a flexible SLA' : mode === 'premium' ? ' after a premium counter' : '';
        const termTr = mode === 'flexible' ? ' esnek SLA ile' : mode === 'premium' ? ' primli karşı teklifle' : '';
        pushLog(
          draft,
          line(
            `Signed ${agreed.clientName}${term} at ${fmtMoneyExact(agreed.monthlyRevenue)}/mo.`,
            `${agreed.clientName}${termTr} ayda ${fmtMoneyExact(agreed.monthlyRevenue)} karşılığında imzaladı.`,
          ),
          'good',
        );
      });
      s.toast(
        mode === 'premium'
          ? say(s.locale, 'Premium counter accepted', 'Primli karşı teklif kabul edildi')
          : say(s.locale, `${agreed.clientName} signed`, `${agreed.clientName} imzaladı`),
        'good',
        building?.gx,
        building?.gy,
      );
    },

    declineOffer: (id) => withGame(set, (draft) => void (draft.offers = draft.offers.filter((o) => o.id !== id))),

    hireTechnician: () => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const cost = CREW_HIRE_COST;
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        const rng = makeRng(Math.floor(Math.random() * 1e9));
        const base = draft.nodes.find((n) => n.kind === 'pop') ?? draft.nodes[0];
        draft.money -= cost;
        recordLedger(draft, 'staff', line('Field crew recruitment', 'Saha ekibi alımı'), -cost);
        draft.technicians = [
          ...draft.technicians,
          {
            id: uid('t'),
            name: personName(rng),
            skill: 1 + Math.floor(rng() * 3),
            salary: 44000 + Math.floor(rng() * 14000),
            experience: 0,
            incidentId: null,
            maintenanceId: null,
            gx: base?.gx ?? 0,
            gy: base?.gy ?? 0,
            homeGx: base?.gx ?? 0,
            homeGy: base?.gy ?? 0,
            state: 'idle',
          },
        ];
      });
      s.toast(say(s.locale, 'New field crew hired', 'Yeni saha ekibi işe alındı'), 'good');
    },

    hireEmployee: (role) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const cost = STAFF_HIRE_COST;
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        const rng = makeRng(Math.floor(Math.random() * 1e9));
        const salary = STAFF_SALARY[role];
        draft.money -= cost;
        recordLedger(
          draft,
          'staff',
          line(`${role.replace(/_/g, ' ')} recruitment`, `${STAFF_ROLE_INFO[role].labelTr} alımı`),
          -cost,
        );
        draft.employees = [
          ...draft.employees,
          { id: uid('e'), name: personName(rng), role, salary, skill: 1 + Math.floor(rng() * 4), experience: 0 },
        ];
      });
      s.toast(say(s.locale, 'Hired', 'İşe alındı'), 'good');
    },

    fireStaff: (id) => {
      const s = get();
      const technician = s.game?.technicians.find((t) => t.id === id);
      if (
        technician &&
        (technician.state !== 'idle' || technician.incidentId !== null || technician.maintenanceId !== null)
      ) {
        s.toast(
          say(
            s.locale,
            'That crew must finish and return before they can be released.',
            'Bu ekip işini bitirip dönmeden çıkarılamaz.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.employees = draft.employees.filter((e) => e.id !== id);
        draft.technicians = draft.technicians.filter((t) => t.id !== id);
      });
    },

    placeBid: (amount) => {
      const s = get();
      const g = s.game;
      if (!g?.auction || g.auction.result) return;
      if (amount < g.auction.reserve) {
        s.toast(say(s.locale, 'That is below the reserve price.', 'Bu tutar taban fiyatın altında.'), 'bad');
        return;
      }
      if (amount > g.money) {
        s.toast(
          say(s.locale, 'You cannot bid more than you hold.', 'Elindeki nakitten fazlasını teklif edemezsin.'),
          'bad',
        );
        return;
      }
      // Bids are sealed. Nothing is charged unless you win.
      withGame(set, (draft) => {
        if (draft.auction) draft.auction = { ...draft.auction, playerBid: amount };
      });
      s.toast(
        say(
          s.locale,
          'Bid sealed. Results when the lot closes.',
          'Teklif mühürlendi. Sonuçlar lot kapanınca açıklanır.',
        ),
        'info',
      );
    },

    dismissAuction: () => withGame(set, (draft) => void (draft.auction = null)),

    setMarketing: (value) => withGame(set, (draft) => void (draft.marketingBudget = Math.max(0, value))),

    setRetention: (value) => withGame(set, (draft) => void (draft.retentionBudget = Math.max(0, value))),

    startCampaign: (districtId, kind) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const district = g.districts.find((entry) => entry.id === districtId);
      const config = CAMPAIGN_CONFIG[kind];
      if (!district?.unlocked) {
        s.toast(
          say(s.locale, 'Unlock the district before campaigning there.', 'Kampanya için önce ilçenin kilidini aç.'),
          'bad',
        );
        return;
      }
      if (g.campaigns.some((campaign) => campaign.districtId === districtId && campaign.endsAt > g.minutes)) {
        s.toast(
          say(
            s.locale,
            'A district can run only one focused campaign at a time.',
            'Bir ilçede aynı anda yalnızca tek bir odaklı kampanya yürütülebilir.',
          ),
          'bad',
        );
        return;
      }
      if (kind === 'mobile' && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
        s.toast(
          say(
            s.locale,
            'Launch 4G and secure spectrum before promoting mobile service.',
            'Mobil hizmeti tanıtmadan önce 4G’yi başlat ve spektrum al.',
          ),
          'bad',
        );
        return;
      }
      if (g.money < config.cost) {
        s.toast(say(s.locale, 'Not enough cash for this campaign.', 'Bu kampanya için nakit yetmiyor.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= config.cost;
        recordLedger(
          draft,
          'campaign',
          line(`${config.label}: ${district.name}`, `${config.labelTr}: ${district.name}`),
          -config.cost,
        );
        draft.campaigns = [
          ...draft.campaigns,
          {
            id: uid('campaign'),
            districtId,
            kind,
            startedAt: draft.minutes,
            endsAt: draft.minutes + config.durationDays * MINUTES_PER_DAY,
            cost: config.cost,
            baselineCustomers: residentialSubs(draft, districtId) + district.mobileSubs,
            baselineSatisfaction: district.satisfaction,
            baselineContracts: draft.contracts.filter((contract) => contract.districtId === districtId).length,
          },
        ];
        pushLog(
          draft,
          line(
            `${config.label} started in ${district.name}.`,
            `${district.name} ilçesinde ${config.labelTr.toLocaleLowerCase('tr-TR')} başladı.`,
          ),
          'good',
        );
      });
      s.toast(say(s.locale, `${config.label} is live`, `${config.labelTr} yayında`), 'good');
    },

    toggleWholesaleFixed: () =>
      withGame(set, (draft) => {
        draft.wholesaleFixed = !draft.wholesaleFixed;
        pushLog(
          draft,
          line(
            `Fixed wholesale ${draft.wholesaleFixed ? 'opened' : 'closed'} to partners.`,
            `Sabit toptan satış iş ortaklarına ${draft.wholesaleFixed ? 'açıldı' : 'kapatıldı'}.`,
          ),
          'info',
        );
      }),

    toggleMvno: () => {
      const s = get();
      const g = s.game;
      if (!g) return;
      if (!g.mvnoEnabled && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
        s.toast(
          say(
            s.locale,
            'MVNO access needs a live mobile platform and spectrum.',
            'MVNO erişimi için çalışan bir mobil platform ve spektrum gerekiyor.',
          ),
          'bad',
        );
        return;
      }
      withGame(set, (draft) => {
        draft.mvnoEnabled = !draft.mvnoEnabled;
        pushLog(
          draft,
          line(
            `MVNO access ${draft.mvnoEnabled ? 'opened' : 'closed'} to partners.`,
            `MVNO erişimi iş ortaklarına ${draft.mvnoEnabled ? 'açıldı' : 'kapatıldı'}.`,
          ),
          'info',
        );
      });
    },

    takeLoan: (principal, termMonths) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      if (!Number.isFinite(principal) || principal <= 0 || !Number.isInteger(termMonths) || termMonths <= 0) {
        s.toast(say(s.locale, 'Choose a valid loan amount and term.', 'Geçerli bir kredi tutarı ve vade seç.'), 'bad');
        return;
      }
      const headroom = creditLimit(g);
      if (principal > headroom) {
        s.toast(say(s.locale, 'More than the banks will lend you.', 'Bankaların vereceğinden fazla.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.loans = [...draft.loans, createLoan(draft, principal, termMonths)];
        draft.money += principal;
        recordLedger(draft, 'loan_draw', line('Loan drawdown', 'Kredi kullanımı'), principal);
        pushLog(
          draft,
          line(
            `Borrowed ${fmtMoneyExact(principal)} over ${termMonths} ${plural(termMonths, 'month')}.`,
            `${termMonths} ay vadeyle ${fmtMoneyExact(principal)} kredi kullanıldı.`,
          ),
          'info',
        );
      });
      s.toast(say(s.locale, 'Loan drawn down', 'Kredi kullanıldı'), 'good');
    },

    repayLoan: (id) => {
      const s = get();
      const g = s.game;
      if (!g) return;
      const loan = g.loans.find((l) => l.id === id);
      if (!loan) return;
      if (g.money < loan.remaining) {
        s.toast(say(s.locale, 'Not enough cash to clear it.', 'Kapatmak için nakit yetmiyor.'), 'bad');
        return;
      }
      withGame(set, (draft) => {
        draft.money -= loan.remaining;
        draft.loans = draft.loans.filter((l) => l.id !== id);
        recordLedger(draft, 'loan_payment', line('Loan repaid in full', 'Kredi tamamen kapatıldı'), -loan.remaining);
        pushLog(draft, line('Loan repaid in full.', 'Kredi tamamen kapatıldı.'), 'good');
      });
      s.toast(say(s.locale, 'Loan cleared', 'Kredi kapatıldı'), 'good');
    },
  }) satisfies Partial<Store>;
