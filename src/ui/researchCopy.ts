import type { ResearchNode } from '../game/types';

const TR: Record<string, [string, string, string[]]> = {
  ftth: [
    'Eve kadar fiber',
    'Fiberi doğrudan evlere ulaştırır; kapsama sınırını ve konut hızlarını artırır.',
    ['Kapsama sınırına +15 puan', 'Gigabit paketler'],
  ],
  gpon: [
    'GPON bölücüler',
    'Tek fiberi birçok eve paylaştırır. Erişim noktaları ucuzlar ve daha fazla müşteriye hizmet verir.',
    ['Erişim noktası maliyeti −%25', 'Erişim kapasitesi +%20'],
  ],
  fiber10g: [
    '10G fiber',
    'Fiber hatlarda daha yüksek kapasiteli optik donanım kullanır.',
    ['3. seviye fiber yükseltmesi', 'Hat kapasitesi +%30'],
  ],
  backbone100g: [
    '100G omurga',
    'Çekirdek ağ kapasitesini artırarak omurga darboğazını azaltır.',
    ['5. seviye çekirdek', 'Küçük veri merkezi (10 Gbps)', 'Üst bağlantı maliyeti −%15'],
  ],
  metro_mesh: [
    'Metro fiber örgüsü',
    'Yedek rotaları yüksek kapasiteli bir şehir ağına dönüştürür.',
    ['4. seviye fiber yükseltmesi', 'Hat kapasitesi +%10'],
  ],
  noc: [
    'Ağ operasyon merkezi',
    'Arızaları müşteriler aramadan önce fark eden bir operasyon ekibi kurar.',
    ['Operasyon merkezi paneli', 'Arıza süresi −%20'],
  ],
  auto_dispatch: [
    'Otomatik ekip sevki',
    'Teknisyenler senin komutunu beklemeden arızalara gider.',
    ['Otomatik sevk seçeneği'],
  ],
  ddos_scrub: ['DDoS temizleme', 'Saldırı trafiğini çekirdek ağına ulaşmadan süzer.', ['DDoS etkisi yarıya iner']],
  sla_desk: [
    'Kurumsal hizmet masası',
    'Özel müşteri yönetimiyle büyük kurumsal sözleşmelerin önünü açar.',
    ['Kurumsal sözleşmeler', 'Daha fazla sözleşme teklifi'],
  ],
  predictive_maintenance: [
    'Öngörülü bakım',
    'Isı, optik ve güç sistemlerinde arıza oluşmadan bakım planlar.',
    ['Arıza riski tahmini', 'Otomatik gece bakımı', 'Şebeke bakımı −%20'],
  ],
  edge_compute: [
    'Uç bilişim',
    'İçeriği müşteriye yakın işler ve önbellekler; üst bağlantı giderini azaltır.',
    ['Tam merkeze genişletme (40 Gbps)', 'Üst bağlantı maliyeti −%30'],
  ],
  onsite_solar: [
    'Saha üstü üretim',
    'Sahalarına panel ve batarya kurarak şebekeden çekilen elektriği azaltır.',
    ['Saha başına üretim kurulumu', 'Kurulu sahada tüketim −%45'],
  ],
  mobile_4g: [
    '4G LTE',
    'Baz istasyonlarıyla mobil hizmet sunmaya başla. Hizmet için ayrıca spektrum gerekir.',
    ['Baz istasyonları', 'Mobil paketler'],
  ],
  mobile_5g: [
    'Bağımsız 5G',
    'Daha yoğun kapasite ve kurumsal mobil hizmetler sunar.',
    ['4. seviye baz istasyonu', 'Ağ dilimleme', 'Mobil gelir +%35'],
  ],
  private_5g: [
    'Özel 5G dilimleri',
    'Ayrılmış radyo ve fiber kapasitesiyle düşük gecikmeli kurumsal hizmetler sunar.',
    ['Yeni sözleşme değeri +%20', 'Bir ek eşzamanlı teklif'],
  ],
  ai_ops: [
    'Yapay zekâ ile ağ iyileştirme',
    'Ağ, kapasiteyi ve rotaları otomatik dengeler.',
    ['Otomatik kapasite dengeleme', 'Paket kaybı etkisi −%25'],
  ],
};

export function researchCopy(node: ResearchNode, locale: 'tr' | 'en'): ResearchNode {
  const copy = locale === 'tr' ? TR[node.id] : null;
  return copy ? { ...node, name: copy[0], description: copy[1], unlocks: copy[2] } : node;
}
