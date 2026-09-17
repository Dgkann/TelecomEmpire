import { pick, type Rng } from './rng';

const FIRST = [
  'Deniz',
  'Elif',
  'Mert',
  'Aylin',
  'Kaan',
  'Zeynep',
  'Emre',
  'Selin',
  'Burak',
  'Nil',
  'Onur',
  'Ceren',
  'Baran',
  'Ece',
  'Tolga',
  'Melis',
  'Arda',
  'Sena',
  'Kerem',
  'İdil',
];
const LAST = [
  'Yılmaz',
  'Demir',
  'Kaya',
  'Şahin',
  'Çelik',
  'Arslan',
  'Doğan',
  'Kurt',
  'Aydın',
  'Polat',
  'Erdem',
  'Koç',
  'Tekin',
  'Aksoy',
  'Bulut',
  'Yalçın',
];

export const personName = (rng: Rng) => `${pick(rng, FIRST)} ${pick(rng, LAST)}`;

const CORP_A = [
  'Nova',
  'Helix',
  'Vertex',
  'Aurora',
  'Kestrel',
  'Meridian',
  'Solstice',
  'Atlas',
  'Cobalt',
  'Lumen',
  'Orbit',
  'Vantage',
];
const CORP_B = ['Tech', 'Works', 'Systems', 'Labs', 'Dynamics', 'Logistics', 'Media', 'Analytics', 'Robotics', 'Foods'];
const CORP_C = ['Ltd.', 'A.Ş.', 'Group', 'Co.', 'Holdings'];

export const companyName = (rng: Rng) => `${pick(rng, CORP_A)}${pick(rng, CORP_B)} ${pick(rng, CORP_C)}`;

const ENTERPRISE = [
  'MetroBank',
  'Anadolu University',
  'Central Hospital',
  'City Transit Authority',
  'Marmara Clinic',
  'National Insurance',
  'Grand Mall Group',
  'Port Authority',
  'State Archives',
  'Bosphorus Media',
];
export const enterpriseName = (rng: Rng) => pick(rng, ENTERPRISE);

const HANDLES = [
  'john92',
  'sarah',
  'mehmet_k',
  'pixelnomad',
  'ayse.dev',
  'gamer_burak',
  'nightowl',
  'defne',
  'streamqueen',
  'ops_guy',
  'remote_dad',
  'lag_hater',
  'kadikoy_kedi',
  'techsevgi',
];
export const handleName = (rng: Rng) => pick(rng, HANDLES);

const GOOD_POSTS = [
  (c: string, s: number) => `Installed ${c} Fibre today. ${s} Mbps on the speed test, no drama.`,
  (c: string) => `Switched to ${c} last week. Zero dropouts so far. Genuinely surprised.`,
  (c: string) => `${c} engineer showed up on time and actually fixed it. Rare.`,
  (c: string, s: number) => `${s} Mbps for what I was paying for 50. Thanks ${c}.`,
];

const BAD_POSTS = [
  (c: string) => `${c} went down again. Two hours without internet.`,
  (c: string) => `Paying premium prices to ${c} for dial-up speeds tonight.`,
  (c: string) => `Third outage this month, ${c}. My patience has a data cap too.`,
  (c: string) => `${c} support said "have you tried restarting the router". I am the router now.`,
];

const MEH_POSTS = [
  (c: string) => `${c} is fine I guess. Evenings get sluggish.`,
  (c: string) => `Speeds with ${c} are okay until about 9pm, then it crawls.`,
];

const SWITCH_POSTS = [
  (c: string, r: string) => `Left ${c} for ${r} today. Same speed, smaller bill.`,
  (c: string, r: string) => `${r} just wired my street. Sorry ${c}, you had your chance.`,
  (c: string, r: string) => `Cancelled ${c} after the third outage. ${r} it is.`,
];

// A defection names the rival that took them, so the feed matches the churn list.
export function makeSwitchPost(rng: Rng, company: string, rival: string) {
  return { text: pick(rng, SWITCH_POSTS)(company, rival), stars: rng() < 0.7 ? 1 : 2 };
}

export function makePost(rng: Rng, company: string, mood: 'good' | 'bad' | 'meh', speed: number) {
  if (mood === 'good') return { text: pick(rng, GOOD_POSTS)(company, speed), stars: rng() < 0.6 ? 5 : 4 };
  if (mood === 'bad') return { text: pick(rng, BAD_POSTS)(company), stars: rng() < 0.6 ? 1 : 2 };
  return { text: pick(rng, MEH_POSTS)(company), stars: 3 };
}

export const CITY_EVENTS = [
  {
    name: 'Championship Final',
    nameTr: 'Şampiyonluk finali',
    mul: 2.8,
    hours: 5,
    blurb: 'Every screen in the city is on the same match.',
    blurbTr: 'Şehirdeki her ekran aynı maçı gösteriyor.',
  },
  {
    name: 'Arena Concert',
    nameTr: 'Arena konseri',
    mul: 2.0,
    hours: 4,
    blurb: 'Fifty thousand people all uploading the same song.',
    blurbTr: 'Elli bin kişi aynı şarkıyı yüklüyor.',
  },
  {
    name: 'Public Holiday',
    nameTr: 'Resmî tatil',
    mul: 1.5,
    hours: 14,
    blurb: 'Nobody is at work. Everybody is streaming.',
    blurbTr: 'Kimse işte değil. Herkes yayın izliyor.',
  },
  {
    name: 'Major Game Release',
    nameTr: 'Büyük oyun çıkışı',
    mul: 2.2,
    hours: 8,
    blurb: 'A 140 GB download landed at midnight.',
    blurbTr: "Gece yarısı 140 GB'lık bir indirme yayınlandı.",
  },
  {
    name: 'Storm Warning',
    nameTr: 'Fırtına uyarısı',
    mul: 1.3,
    hours: 10,
    blurb: 'The city is indoors and the weather is rough on infrastructure.',
    blurbTr: 'Şehir evde kalıyor ve hava koşulları altyapıyı zorluyor.',
  },
  {
    name: 'E-sports Tournament',
    nameTr: 'E-spor turnuvası',
    mul: 2.4,
    hours: 7,
    blurb: 'Thousands of low-latency streams are live at once.',
    blurbTr: 'Binlerce düşük gecikmeli yayın aynı anda canlı.',
  },
  {
    name: 'University Results Day',
    nameTr: 'Üniversite sonuç günü',
    mul: 1.8,
    hours: 6,
    blurb: 'Every student is refreshing the same portal.',
    blurbTr: 'Her öğrenci aynı portalı yeniliyor.',
  },
  {
    name: 'Cloud Migration Weekend',
    nameTr: 'Bulut taşıma hafta sonu',
    mul: 2.1,
    hours: 12,
    blurb: 'Businesses are moving years of data before Monday.',
    blurbTr: 'İşletmeler pazartesiden önce yılların verisini taşıyor.',
  },
  {
    name: 'Heatwave',
    nameTr: 'Sıcak hava dalgası',
    mul: 1.6,
    hours: 16,
    blurb: 'Cooling systems and home streaming are both under pressure.',
    blurbTr: 'Soğutma sistemleri ve evlerdeki yayınlar aynı anda baskı altında.',
  },
  {
    name: 'City Marathon',
    nameTr: 'Şehir maratonu',
    mul: 1.7,
    hours: 8,
    blurb: 'Live video follows runners through every district.',
    blurbTr: 'Canlı yayın koşucuları her ilçede takip ediyor.',
  },
];

// Active events store English text; the sponsored festival comes from the strategy board.
const EVENT_COPY = [
  ...CITY_EVENTS,
  {
    name: 'Connected city festival',
    nameTr: 'Bağlantılı şehir festivali',
    blurbTr: 'Sponsorluğun üç gün boyunca yoğun yayın getiriyor.',
  },
];

export function cityEventCopy(event: { name: string; blurb: string }, tr: boolean) {
  const copy = tr ? EVENT_COPY.find((entry) => entry.name === event.name) : undefined;
  return copy ? { name: copy.nameTr, blurb: copy.blurbTr } : { name: event.name, blurb: event.blurb };
}
