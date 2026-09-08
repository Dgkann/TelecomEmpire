import type { OperationsInsight } from '../game/operations';
import type { GameState } from '../game/types';

export function operationsCopy(item: OperationsInsight, game: GameState, tr: boolean) {
  if (!tr) return item;
  const district = game.districts.find((d) => d.id === item.target.id);
  const pct = item.title.match(/\d+%/)?.[0] ?? '';
  const copies: Array<[string, string, string, string]> = [
    [
      'incident-',
      'Ekip bekleyen arıza',
      'Müşteriler etkileniyor. Onarım süresini ve maliyetini karşılaştırıp bir saha ekibi gönder.',
      'Arızayı incele',
    ],
    [
      'capacity-',
      `${pct} kapasite kullanımı`,
      'Bu hat veya nokta ağın kapasitesini sınırlıyor. Yükseltmeyi ya da alternatif rotayı değerlendir.',
      'Darboğazı incele',
    ],
    [
      'transit-headroom',
      'İnternet çıkışı doluyor',
      'Üst bağlantı kapasitesi yetersiz kalıyor. Yeni noktalar kurmadan önce internet çıkışını genişlet.',
      'İnternet çıkışı',
    ],
    [
      'cdn-suspended',
      'CDN hizmeti askıda',
      'Bağlı bir veri merkezi bulunmuyor. Hizmet sağlanmasa da aylık anlaşma bedeli devam ediyor.',
      'Bağlantıyı incele',
    ],
    [
      'wholesale-delivery',
      `Toptan hizmet teslimi ${pct}`,
      'Ortaklık geliri taşınan trafiğe bağlıdır. Çıkış kapasitesini veya trafik önceliklerini değerlendir.',
      'Trafik politikası',
    ],
    [
      'maintenance-queue',
      'Bakım işleri ekip bekliyor',
      'Tüm saha ekipleri meşgul. Planlanan işler için ekip kapasitesini kontrol et.',
      'Bakım planı',
    ],
    [
      'campaign-ending-',
      `${district?.name ?? 'İlçe'} kampanyası bitiyor`,
      'Yeni bütçe ayırmadan önce abone ve memnuniyet değişimini değerlendir.',
      'Kampanyayı incele',
    ],
    [
      'pricing-high',
      `Piyasanın ${pct} üzerindesin`,
      'Rakiplerin fiyat avantajı müşteri kaybına yol açabilir. Paket fiyatlarını gözden geçir.',
      'Fiyatlandırma',
    ],
    [
      'pricing-low',
      'Fiyat avantajın var',
      'Şebekede boş kapasite bulunuyor. Kampanya veya kapsama yatırımıyla yeni müşterilere ulaş.',
      'Fiyatlandırma',
    ],
    [
      'sla-',
      'Hizmet taahhüdü risk altında',
      'Kesinti bütçesi ve yedekli bağlantıları incele. Hizmet kaybı ceza doğurabilir.',
      'Sözleşmeyi incele',
    ],
    [
      'growth-',
      `${district?.name ?? 'İlçe'} büyümeye açık`,
      `%${Math.round((district?.coverage ?? 0) * 100)} kapsama. Bağlı POP ve erişim noktalarıyla daha fazla haneye ulaşabilirsin.`,
      'İlçeyi aç',
    ],
  ];
  const copy = copies.find(([prefix]) => item.id.startsWith(prefix));
  return copy ? { ...item, title: copy[1], detail: copy[2], action: copy[3] } : item;
}
