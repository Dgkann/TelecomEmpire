import { expect, test, type Page } from '@playwright/test';

// English words that Turkish copy never uses, and English month names. 'Mar' and 'May' are left out
// because they are Turkish month abbreviations too; 'fiber' and 'site' are Turkish words.
const ENGLISH_WORDS = `the and of to with for your you is are will not this that from each than when while has
have into only per been would should cannot more less after before until which their they there here what how
why its by all any was were our out off over under about just still also then them these those some other new
next last open close build upgrade hire cancel resume review start pause settings customers customer revenue
profit month months day days week weeks network company research projects market map live faults due deals feed
offers save load help level tier capacity traffic cost costs price prices monthly daily total free full empty
ready locked done active down up january february march april june july august september october november
december jan feb apr jun jul aug sep oct nov dec`.split(/\s+/);

// Industry terms Turkish telecom copy keeps as they are.
const ALLOWED = ['Tier-1'];

// Lists visible text, accessible names and tooltips that still read as English, and numbers grouped
// with commas, which is English formatting.
async function englishLeftovers(page: Page, where: string) {
  return page.evaluate(
    async ({ words, allowed, where }) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const english = new Set(words);
      const found: string[] = [];
      const seen = new Set<string>();
      const visible = (el: Element) => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
      };
      const check = (raw: string, kind: string) => {
        let text = raw;
        for (const term of allowed) text = text.split(term).join(' ');
        const hits = [
          ...new Set((text.toLowerCase().match(/[a-zçğıöşü]+/g) ?? []).filter((word) => english.has(word))),
          ...(text.match(/\b[1-9]\d{0,2}(,\d{3})+\b/g) ?? []),
        ];
        const key = `${kind}|${raw}`;
        if (!hits.length || seen.has(key)) return;
        seen.add(key);
        found.push(`${where} · ${kind} · ${hits.join(', ')} · ${raw.replace(/\s+/g, ' ').slice(0, 120)}`);
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const text = node.textContent?.trim();
        if (text && parent && !parent.closest('script, style, title') && visible(parent)) check(text, 'text');
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
        for (const attribute of ['aria-label', 'title', 'placeholder']) {
          const value = el.getAttribute(attribute);
          if (value) check(value, attribute);
        }
      }
      return found;
    },
    { words: ENGLISH_WORDS, allowed: ALLOWED, where },
  );
}

test('Turkish screens show no English copy or English number formats', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The desktop layout shows every panel the scan reads at once.');
  test.slow();
  const leftovers: string[] = [];
  const scan = async (where: string) => leftovers.push(...(await englishLeftovers(page, where)));

  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().setLocale('tr');
    store
      .getState()
      .newGame({ companyName: 'Çeviri', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 4242 });
  });
  await expect(page.getByRole('navigation', { name: 'Oyun ekranları' })).toBeVisible();
  await scan('first minutes');

  // Quitting saves the game, so the menu shows a filled slot.
  await page.evaluate(() => window.__game.getState().quitToMenu());
  await expect(page.getByRole('button', { name: 'Yeni şebeke kur' })).toBeVisible();
  await scan('menu');
  await page.getByRole('button', { name: 'Yeni şebeke kur' }).click();
  await scan('new game');

  // Six weeks of play across the whole city give faults, offers, posts and contracts to read.
  await page.evaluate(() => {
    const store = window.__game;
    store
      .getState()
      .newGame({ companyName: 'Çeviri', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 4242 });
    const opening = store.getState().game;
    store.setState({
      autoConnect: true,
      game: {
        ...opening,
        money: 50_000_000,
        tutorialDone: true,
        districts: opening.districts.map((district) => ({ ...district, unlocked: true })),
      },
    });
    const game = store.getState().game;
    const free = game.districts
      .flatMap((district) => district.cells)
      .filter((cell) => !game.nodes.some((node) => node.gx === cell.gx && node.gy === cell.gy));
    for (const cell of free.filter((_, i) => i % 37 === 0).slice(0, 12))
      store.getState().placeNode('access', cell.gx, cell.gy);
    store.getState().cancelBuild();
    for (let i = 0; i < 20000 && store.getState().game.minutes < 40 * 1440; i++) {
      if (store.getState().game.speed === 0) store.setState({ game: { ...store.getState().game, speed: 4 } });
      store.getState().tick();
    }
    store.setState({ game: { ...store.getState().game, speed: 0 } });
  });
  await scan('map');

  for (const tab of await page.locator('[role="tab"][id^="side-tab-"]').all()) {
    await tab.click();
    await scan(`action centre ${await tab.getAttribute('id')}`);
  }

  const game = await page.evaluate(() => {
    const g = window.__game.getState().game;
    return {
      node: g.nodes[g.nodes.length - 1].id,
      link: g.links[g.links.length - 1].id,
      district: g.districts[1].id,
      building: (g.buildings.find((b) => b.connected > 0.3) ?? g.buildings[0]).id,
      incident: g.incidents.find((i) => !i.resolved)?.id ?? null,
      offer: g.offers[0]?.id ?? null,
    };
  });
  for (const type of ['node', 'link', 'district', 'building'] as const) {
    await page.evaluate((selection) => window.__game.getState().select(selection), { type, id: game[type] });
    await scan(`selected ${type}`);
  }
  await page.evaluate(() => window.__game.getState().select(null));

  expect(game.incident, 'the fixture should raise at least one fault').not.toBeNull();
  await page.evaluate((id) => window.__game.getState().openIncident(id), game.incident!);
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan('fault dialog');
  await page.evaluate(() => window.__game.setState({ openIncidentId: null }));

  expect(game.offer, 'the fixture should bring at least one offer').not.toBeNull();
  await page.evaluate((id) => window.__game.getState().inspectOffer(id), game.offer!);
  await scan('offer');
  await page.evaluate(() => window.__game.getState().inspectOffer(null));

  for (const screen of ['network', 'company', 'research', 'projects', 'market'] as const) {
    await page.evaluate(() => window.__game.getState().setScreen('map'));
    await expect(page.locator('.screen-shell')).toHaveCount(0);
    await page.evaluate((id) => window.__game.getState().setScreen(id), screen);
    await expect(page.locator('.screen-shell')).toBeVisible();
    await scan(`${screen} screen`);
    if (screen === 'network') {
      for (const tab of await page.locator('.screen-shell [role="tab"]').all()) {
        await tab.click();
        await scan(`network tab ${(await tab.textContent())?.trim()}`);
      }
    }
  }
  await page.evaluate(() => window.__game.getState().setScreen('map'));

  await page.evaluate(() => window.__game.getState().setShowHelp(true));
  await scan('help');
  await page.evaluate(() => window.__game.getState().setShowHelp(false));
  await page.evaluate(() => window.__game.getState().setShowSaveManager(true));
  await scan('save manager');
  await page.evaluate(() => window.__game.getState().setShowSaveManager(false));
  await page.getByRole('button', { name: 'Akıllı duraklatma ayarları' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan('smart pause');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Şirket profili' }).click();
  await expect(page.getByRole('dialog', { name: 'Şirket profili' })).toBeVisible();
  await scan('company profile');

  expect(leftovers, leftovers.join('\n')).toEqual([]);
});
