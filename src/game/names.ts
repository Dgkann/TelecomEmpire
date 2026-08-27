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
  { name: 'Championship Final', mul: 2.8, hours: 5, blurb: 'Every screen in the city is on the same match.' },
  { name: 'Arena Concert', mul: 2.0, hours: 4, blurb: 'Fifty thousand people all uploading the same song.' },
  { name: 'Public Holiday', mul: 1.5, hours: 14, blurb: 'Nobody is at work. Everybody is streaming.' },
  { name: 'Major Game Release', mul: 2.2, hours: 8, blurb: 'A 140 GB download landed at midnight.' },
  {
    name: 'Storm Warning',
    mul: 1.3,
    hours: 10,
    blurb: 'The city is indoors and the weather is rough on infrastructure.',
  },
  { name: 'E-sports Tournament', mul: 2.4, hours: 7, blurb: 'Thousands of low-latency streams are live at once.' },
  { name: 'University Results Day', mul: 1.8, hours: 6, blurb: 'Every student is refreshing the same portal.' },
  { name: 'Cloud Migration Weekend', mul: 2.1, hours: 12, blurb: 'Businesses are moving years of data before Monday.' },
  { name: 'Heatwave', mul: 1.6, hours: 16, blurb: 'Cooling systems and home streaming are both under pressure.' },
  { name: 'City Marathon', mul: 1.7, hours: 8, blurb: 'Live video follows runners through every district.' },
];
