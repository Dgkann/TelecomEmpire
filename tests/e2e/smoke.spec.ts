import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-initialized')) return;
    localStorage.clear();
    sessionStorage.setItem('e2e-initialized', 'true');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

async function startOperator(page: Page, companyName: string) {
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill(companyName);
  await page.getByRole('button', { name: 'Start building' }).click();
  await expect(page.getByRole('navigation', { name: 'Game screens' })).toBeVisible();
}

test('starts an operator and exposes the core management screens', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Telecom Empire' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await startOperator(page, 'E2E Telecom');
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live service control' })).toBeVisible();
  await expect(page.getByLabel('Traffic carried by service class')).toBeVisible();
  await page.getByRole('tab', { name: /Policy/ }).click();
  await expect(page.getByRole('heading', { name: 'Traffic engineering' })).toBeVisible();

  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operator performance' })).toBeVisible();
  await expect(page.getByLabel('Monthly profit bridge')).toBeVisible();
  await expect(page.getByLabel('Customer growth drivers')).toBeVisible();
  await expect(page.getByLabel('Monthly marketing budget')).toBeVisible();
});

test('city canvas paints architecture and refreshes its night lighting', async ({ page }, testInfo) => {
  await startOperator(page, 'Canvas Test');
  const setTime = (minutes: number) =>
    page.evaluate((time) => {
      const store = (window as any).__game;
      store.setState({ game: { ...store.getState().game, speed: 0, minutes: time, tutorialDone: true } });
    }, minutes);
  await setTime(720);
  const canvas = page.locator('.map-buildings canvas');
  await expect(canvas).toBeVisible();
  const day = await canvas.evaluate((element: HTMLCanvasElement) => {
    const ctx = element.getContext('2d')!;
    const data = ctx.getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
    return { painted, width: element.width, height: element.height, image: element.toDataURL() };
  });
  expect(day.painted).toBeGreaterThan(1000);
  expect(Math.max(day.width, day.height)).toBeLessThanOrEqual(4096);
  await setTime(0);
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(day.image);
  await page.screenshot({ path: testInfo.outputPath('city-canvas-night.png') });
  const site = page.locator('svg.map-surface g.map-interactive:not([aria-label*=" fibre, tier "])').first();
  await site.focus();
  await site.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__game.getState().selection?.type)).toBe('node');
});

test('keyboard shortcuts do not fire while a form control has focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Commission new network' }).click();
  const name = page.getByPlaceholder('Company name');
  await name.fill('Key Test');
  await name.press('1');
  await expect(name).toHaveValue('Key Test1');
});

test('network lab rehearses a surge and commissions a saved capacity programme', async ({ page }, testInfo) => {
  await startOperator(page, 'Capacity Programme');
  const before = await page.evaluate(() => {
    const store = (window as any).__game,
      g = store.getState().game;
    store.setState({
      game: {
        ...g,
        speed: 0,
        money: 40000000,
        tutorialDone: true,
        buildings: g.buildings.map((b: any) => ({ ...b, connected: 0.8 })),
      },
    });
    const pop = g.nodes.find((n: any) => n.kind === 'pop'),
      fibre = g.links[0];
    const names = [fibre.aId, fibre.bId].map((id: string) => g.nodes.find((n: any) => n.id === id).name);
    return { pop, fibre, fibreName: names.join(' / '), snapshot: JSON.stringify(store.getState().game) };
  });
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByRole('tab', { name: /Network Lab/ }).click();
  const lab = page.getByRole('region', { name: 'Network Lab', exact: true });
  await expect(lab).toBeVisible();
  await lab.getByRole('button', { name: '3× demand', exact: true }).click();
  await lab.getByLabel('Lab fibre failure').selectOption(before.fibre.id);
  await expect(lab.getByText(/cut only in this test/)).toBeVisible();
  await lab.getByLabel('Lab fibre failure').selectOption('');
  await lab.getByRole('button', { name: `Add upgrade ${before.pop.name}`, exact: true }).click();
  await lab.getByRole('button', { name: `Add upgrade ${before.fibreName}`, exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify((window as any).__game.getState().game))).toBe(before.snapshot);
  await expect(lab.getByRole('button', { name: 'Commission 2 upgrades', exact: true })).toBeEnabled();
  await page.evaluate(() => document.querySelector('.screen-shell')?.scrollTo(0, 0));
  await expect(lab.getByRole('heading', { name: 'Network Lab', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('capacity-lab.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await lab.getByRole('button', { name: 'Commission 2 upgrades', exact: true }).click();
  await expect(lab.getByRole('status')).toContainText('Upgrades are live');
  const readTiers = () =>
    page.evaluate(
      ({ node, link }) => {
        const g = (window as any).__game.getState().game;
        return [g.nodes.find((n: any) => n.id === node).tier, g.links.find((l: any) => l.id === link).tier];
      },
      { node: before.pop.id, link: before.fibre.id },
    );
  expect(await readTiers()).toEqual([before.pop.tier + 1, before.fibre.tier + 1]);
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(await readTiers()).toEqual([before.pop.tier + 1, before.fibre.tier + 1]);
});

test('map panning preserves controls and performance preference survives reload', async ({ page }) => {
  await startOperator(page, 'Smooth Map');
  await page.evaluate(() => {
    const s = (window as any).__game;
    s.getState().setSpeed(0);
    s.getState().cancelBuild();
  });
  const map = page.locator('svg.map-surface'),
    world = map.locator(':scope > g');
  const box = (await map.boundingBox())!,
    before = await world.getAttribute('transform');
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65 - 70, box.y + box.height * 0.3 + 80, { steps: 12 });
  await page.mouse.up();
  await expect(world).not.toHaveAttribute('transform', before!);
  const dragged = await world.getAttribute('transform');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(world).not.toHaveAttribute('transform', dragged!);
  await page.getByLabel('Map visual settings').click();
  await page.getByLabel('Map detail').selectOption('performance');
  await expect(page.locator('.map-economical')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  await page.getByLabel('Map visual settings').click();
  await expect(page.getByLabel('Map detail')).toHaveValue('performance');
});

test('switches the onboarding flow to Turkish', async ({ page }) => {
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('button', { name: 'Yeni şebeke kur' }).click();
  await expect(page.getByPlaceholder('Şirket adı')).toBeVisible();
  await expect(page.getByText('Oyun modu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kuruluma başla' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Yeni şebeke kur' })).toBeVisible();
});

test('shows the compact operator summary on narrow screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Compact summary is only rendered on narrow screens.');
  await startOperator(page, 'Mobile Summary');
  await page.getByRole('button', { name: /Cash - overview/ }).click();
  const summary = page.locator('#mobile-operator-summary');
  await expect(summary).toBeVisible();
  await expect(summary.getByText('Customers')).toBeVisible();
  await expect(summary.getByText('Network')).toBeVisible();
  await expect(summary.getByText('Traffic')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('starts the first multi-city campaign objective', async ({ page }) => {
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByRole('button', { name: /Campaign Carry one operator/ }).click();
  await page.getByPlaceholder('Company name').fill('Campaign E2E');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  const scenario = page.getByRole('region', { name: 'Scenario progress' });
  await expect(scenario.getByText('Rapid expansion')).toBeVisible();
  await expect(scenario.getByText('180 days')).toBeVisible();
});

test('map keyboard focus follows the selected network geometry', async ({ page }) => {
  await startOperator(page, 'Focus Test');

  const fibre = page.locator('svg.map-surface g.map-interactive[aria-label*=" fibre, tier "]').first();
  await fibre.focus();
  await expect(fibre).toHaveCSS('outline-style', 'none');
  await expect(fibre.locator('line.map-focus-ring')).toHaveCSS('opacity', '0.9');

  const site = page.locator('svg.map-surface g.map-interactive:not([aria-label*=" fibre, tier "])').first();
  await site.focus();
  await expect(site).toHaveCSS('outline-style', 'none');
  await expect(site.locator('g.map-focus-ring')).toHaveCSS('opacity', '0.9');
});

test('save manager traps focus, closes with Escape and restores the opener', async ({ page }) => {
  await startOperator(page, 'Keyboard Archive');

  const opener = page.getByRole('button', { name: 'Open save manager' });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Network snapshots' });
  const close = dialog.getByRole('button', { name: 'Close save manager' });
  await expect(close).toBeFocused();

  await dialog.getByRole('button', { name: 'Choose save file' }).focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('builds a connected POP and restores the expanded network from another slot', async ({ page }) => {
  await startOperator(page, 'Expansion Test');

  const map = page.getByRole('application', { name: /Interactive telecom network map/ });
  const sites = map.locator('g.map-interactive:not([aria-label*=" fibre, tier "])');
  const fibres = map.locator('g.map-interactive[aria-label*=" fibre, tier "]');
  await expect(sites).toHaveCount(2);
  await expect(fibres).toHaveCount(1);

  await page.getByRole('button', { name: /^POP/ }).click();
  const tile = page.locator('[data-ground-tiles] > polygon').first();
  const tileBox = await tile.boundingBox();
  expect(tileBox).not.toBeNull();
  await page.mouse.click(tileBox!.x + tileBox!.width * 0.25, tileBox!.y + tileBox!.height * 0.5);
  await expect(sites).toHaveCount(3);

  await page.getByRole('button', { name: 'Skip guide' }).click();
  await page.getByTitle('Connect two sites with a fibre span').click();
  await map.locator('g.map-interactive[aria-label*="POP 2"]').click();
  await map.locator('g.map-interactive[aria-label*=" Core,"]').click();
  await expect(fibres).toHaveCount(2);

  await page.getByRole('button', { name: 'Open save manager' }).click();
  const dialog = page.getByRole('dialog', { name: 'Network snapshots' });
  await dialog.getByRole('button', { name: 'Save here' }).nth(1).click();
  await expect(dialog.getByText('Running network saved to slot 2; autosave now follows that slot.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close save manager' }).click();

  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 2/ }).click();

  const restoredMap = page.getByRole('application', { name: /Interactive telecom network map/ });
  await expect(restoredMap.locator('g.map-interactive:not([aria-label*=" fibre, tier "])')).toHaveCount(3);
  await expect(restoredMap.locator('g.map-interactive[aria-label*=" fibre, tier "]')).toHaveCount(2);
});

test('dispatches a field crew from a live incident', async ({ page }) => {
  await startOperator(page, 'Incident Test');

  await page.evaluate(() => {
    const store = (window as any).__game;
    const state = store.getState();
    const game = state.game;
    const target = game.nodes[0];
    store.setState({
      game: {
        ...game,
        // Keep the injected incident independent of random live simulation events.
        speed: 0,
        tutorialDone: true,
        nodes: game.nodes.map((node: any) => (node.id === target.id ? { ...node, down: true } : node)),
        incidents: [
          {
            id: 'e2e-incident',
            kind: 'router_failure',
            title: 'E2E router failure',
            description: 'A deterministic incident used to verify the complete dispatch flow.',
            targetId: target.id,
            targetType: 'node',
            districtId: target.districtId,
            startedAt: game.minutes,
            repairMinutesLeft: null,
            repairTotalMinutes: 180,
            repairBaseMinutes: 180,
            assignedTechId: null,
            affected: 200,
            resolved: false,
            degrade: false,
          },
        ],
      },
      openIncidentId: 'e2e-incident',
    });
  });

  const dialog = page.getByRole('dialog', { name: 'Network incident' });
  await expect(dialog.getByText('E2E router failure')).toBeVisible();
  await dialog.getByRole('radio', { name: /Scheduled/ }).check();
  await dialog.getByRole('button', { name: /Dispatch crew/ }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as any).__game.getState().game;
        return game.incidents[0].assignedTechId !== null && game.technicians.some((tech: any) => tech.incidentId);
      }),
    )
    .toBe(true);
});

test('submits and settles a spectrum auction bid', async ({ page }) => {
  await startOperator(page, 'Auction Test');

  await page.evaluate(() => {
    const store = (window as any).__game;
    const state = store.getState();
    store.setState({
      game: {
        ...state.game,
        auction: {
          id: 'e2e-auction',
          band: '1800',
          blocks: 1,
          reserve: 10000,
          closesAt: state.game.minutes + 1440,
          playerBid: null,
          result: null,
        },
      },
    });
  });

  const dialog = page.getByRole('dialog', { name: 'Spectrum auction' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit bid' }).click();
  await expect(dialog).toBeHidden();

  await page.evaluate(() => {
    const store = (window as any).__game;
    const state = store.getState();
    const bid = state.game.auction.playerBid;
    store.setState({
      game: {
        ...state.game,
        auction: {
          ...state.game.auction,
          result: {
            winnerId: 'player',
            winnerName: state.game.companyName,
            price: bid,
            bids: [{ bidderId: 'player', bidderName: state.game.companyName, amount: bid }],
          },
        },
      },
    });
  });

  await expect(dialog.getByText('You won the lot')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__game.getState().game.auction)).toBeNull();
});

test('development rewards persist and cannot be claimed again', async ({ page }, testInfo) => {
  await startOperator(page, 'Development Test');
  await page.evaluate(() => {
    const store = (window as any).__game;
    const game = store.getState().game;
    const first = game.packages.find((p: any) => p.segment === 'residential').id;
    store.setState({
      game: {
        ...game,
        speed: 0,
        packages: game.packages.map((p: any) => ({ ...p, subscribers: p.id === first ? 450 : 0 })),
      },
    });
  });
  if (testInfo.project.name !== 'desktop') await page.getByRole('button', { name: /^Actions/ }).click();
  const goals = page.getByRole('region', { name: 'Development goals' });
  const cash = await page.evaluate(() => (window as any).__game.getState().game.money);
  await goals.getByRole('button', { name: 'Claim reward' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.getState().game.money)).toBe(cash + 70000);
  await expect(goals.getByRole('button', { name: 'Connect your city 1/7 +' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  if (testInfo.project.name !== 'desktop') await page.getByRole('button', { name: /^Actions/ }).click();
  await expect(goals.getByRole('button', { name: 'Connect your city 1/7 +' })).toBeVisible();
  await expect(goals.getByRole('button', { name: 'Claim reward' })).toHaveCount(0);
});

test('construction previews cost and Escape cancels a focused tool', async ({ page }) => {
  await startOperator(page, 'Planning Test');
  await page.getByRole('button', { name: /^POP/ }).click();
  const preview = page.getByLabel('Investment preview');
  await expect(preview.getByText('Added monthly cost')).toBeVisible();
  await expect(preview.getByText('Cash after purchase')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel construction' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('network blueprint previews and commissions an atomic connected plan', async ({ page }) => {
  await startOperator(page, 'Blueprint Test');
  await page.getByRole('button', { name: 'Plan network', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Network blueprint' });
  await expect(panel).toBeVisible();
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const d = g.districts.find((d: any) => d.unlocked);
    const c = d.cells.find((c: any) => !g.nodes.some((n: any) => n.gx === c.gx && n.gy === c.gy));
    store.getState().placeNode('pop', c.gx, c.gy);
    return { money: g.money, nodes: g.nodes.length, minutes: g.minutes };
  });
  await expect(panel.getByRole('button', { name: 'Build all' })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(before.money);
  await page.evaluate(() => {
    const store = (window as any).__game;
    const s = store.getState();
    const core = s.game.nodes.find((n: any) => n.kind === 'core');
    store.getState().clickNodeForLink(core.id);
    store.getState().clickNodeForLink(s.blueprint[0].id);
  });
  await expect(panel.getByRole('button', { name: 'Build all' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Build all' }).click();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.getState().game.nodes.length)).toBe(before.nodes + 1);
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.nodes.length)).toBe(before.nodes + 1);
});

test('strategy decisions persist and acquisition is reviewed before purchase', async ({ page }) => {
  await startOperator(page, 'Strategy Test');
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({
      game: {
        ...g,
        speed: 0,
        rank: 2,
        money: 1000000000,
        competitors: g.competitors.map((c: any) => ({
          ...c,
          coverage: { ...c.coverage, [g.districts.find((d: any) => d.unlocked).id]: 0.5 },
        })),
        strategy: {
          ...g.strategy,
          decision: { id: 'e2e-decision', kind: 'training', districtId: g.districts[0].id, dueAt: g.minutes + 100 },
        },
      },
    });
    return g.researchPoints;
  });
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Strategy desk' });
  const lab = desk
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Sponsor the lab', exact: true }) });
  await lab.getByRole('button', { name: 'Choose this option' }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.researchPoints)).toBe(before + 30);
  await expect(desk.getByText('Engineering fellowship', { exact: true })).toBeHidden();
  await desk.getByRole('button', { name: 'Competition', exact: true }).click();
  await desk.getByRole('button', { name: 'Review acquisition' }).first().click();
  const quote = desk.getByRole('article', { name: 'Acquisition quote' });
  await expect(quote.getByText('Network integration', { exact: true })).toBeVisible();
  const count = await page.evaluate(() => (window as any).__game.getState().game.competitors.length);
  await quote.getByRole('button', { name: /Acquire and integrate/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.competitors.length)).toBe(count - 1);
  await desk.getByRole('button', { name: 'City & charters' }).click();
  await expect(desk.getByRole('heading', { name: 'Growing neighbourhoods' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.strategy.acquisitions.length)).toBe(1);
});

test('connected construction and district exploration are available from the map', async ({ page }, testInfo) => {
  await startOperator(page, 'Connected Build');
  await page.getByRole('button', { name: /^POP/ }).click();
  const auto = page.getByRole('checkbox', { name: /Include fibre to nearest live site/ });
  await auto.check();
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const d = g.districts.find((d: any) => d.unlocked);
    const cell = d.cells.find((c: any) => !g.nodes.some((n: any) => n.gx === c.gx && n.gy === c.gy));
    store.getState().placeNode('pop', cell.gx, cell.gy);
    return { nodes: g.nodes.length, links: g.links.length };
  });
  expect(await page.evaluate(() => (window as any).__game.getState().game.nodes.length)).toBe(before.nodes + 1);
  expect(await page.evaluate(() => (window as any).__game.getState().game.links.length)).toBe(before.links + 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.getState().select({ type: 'node', id: g.nodes[g.nodes.length - 1].id });
  });
  await page.getByRole('button', { name: /Build backup fibre/ }).click();
  await expect(page.getByText('Protected', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const district = await page.evaluate(() => (window as any).__game.getState().game.districts[0]);
  if (testInfo.project.name === 'desktop')
    await page.getByRole('button', { name: 'Explore ' + district.name, exact: true }).click();
  else await page.getByRole('combobox', { name: 'Explore district', exact: true }).selectOption(district.id);
  expect(await page.evaluate(() => (window as any).__game.getState().selection.id)).toBe(district.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('failure drill previews a cut and restores the real network', async ({ page }) => {
  await startOperator(page, 'Failure Drill Test');
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.getState().setSpeed(0);
    store.getState().select({ type: 'link', id: g.links[0].id });
    return { money: g.money, links: g.links.length };
  });
  await page.getByRole('button', { name: 'Test fibre cut', exact: true }).click();
  const drill = page.getByRole('region', { name: 'Failure drill', exact: true });
  await expect(drill).toBeVisible();
  await expect(drill.getByText('Paused · hypothetical', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^POP/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__game.getState().game.links.some((l: any) => l.down))).toBe(false);
  await drill.getByRole('button', { name: 'End drill' }).click();
  await expect(drill).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(before.money);
  await page.getByRole('button', { name: 'Test fibre cut', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(drill).toBeHidden();
  await expect(page.getByRole('button', { name: /^POP/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('compares field crews and dispatches the chosen repair response', async ({ page }, testInfo) => {
  await startOperator(page, 'Field Response');
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const site = g.nodes.find((n: any) => n.kind === 'pop');
    const fault = {
      id: 'crew-preview',
      kind: 'router_failure',
      title: 'Router failure',
      description: 'A failed router has taken this site offline. Choose a crew to restore service.',
      targetId: site.id,
      targetType: 'node',
      districtId: site.districtId,
      startedAt: g.minutes,
      repairMinutesLeft: null,
      repairTotalMinutes: 100,
      repairBaseMinutes: 100,
      assignedTechId: null,
      affected: 800,
      resolved: false,
      degrade: false,
    };
    store.setState({
      game: {
        ...g,
        speed: 0,
        money: 200000,
        autoDispatch: false,
        incidents: [fault],
        nodes: g.nodes.map((n: any) => (n.id === site.id ? { ...n, down: true } : n)),
        technicians: [
          { ...g.technicians[0], id: 'far-expert', name: 'Distant Expert', skill: 5, gx: site.gx + 10, gy: site.gy },
          { ...g.technicians[1], id: 'near-trainee', name: 'Nearby Crew', skill: 1, gx: site.gx, gy: site.gy },
        ],
      },
    });
    store.getState().openIncident(fault.id);
  });
  const dialog = page.getByRole('dialog', { name: 'Network incident' });
  await expect(dialog.getByRole('radio', { name: 'Nearby Crew', exact: true })).toBeChecked();
  await expect(dialog.getByText('~1h 45m', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('radio', { name: /Emergency/ }).check();
  await expect(dialog.getByText('~35m', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 0 } });
  });
  await expect(dialog.getByRole('button', { name: /Dispatch crew/ })).toBeDisabled();
  await dialog.getByRole('radio', { name: /Scheduled/ }).check();
  await expect(dialog.getByRole('button', { name: /Dispatch crew/ })).toBeEnabled();
  await expect(dialog.getByText(/Scheduled repairs can proceed with negative cash/)).toBeVisible();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 200000 } });
  });
  await dialog.getByRole('radio', { name: /Emergency/ }).check();
  await dialog.getByRole('radio', { name: 'Distant Expert', exact: true }).check();
  await expect(dialog.getByRole('radio', { name: 'Distant Expert', exact: true })).toBeChecked();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('field-response.png') });
  await dialog.getByRole('button', { name: /Dispatch crew/ }).click();
  await expect(dialog).toBeHidden();
  const result = await page.evaluate(() => {
    const g = (window as any).__game.getState().game;
    return { assigned: g.incidents[0].assignedTechId, money: g.money, work: g.incidents[0].repairMinutesLeft };
  });
  expect(result).toEqual({ assigned: 'far-expert', money: 166000, work: 30 });
  await page.evaluate(() => (window as any).__game.getState().openIncident('crew-preview'));
  await expect(dialog.getByText('Distant Expert is on the way')).toBeVisible();
  await expect(dialog.getByText('Estimated restoration', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Dispatch crew/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('compares and commissions an atomic district starter network', async ({ page }, testInfo) => {
  await startOperator(page, 'District Launch');
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, money: 20000000 } });
    return {
      district: g.districts.find((d: any) => !d.unlocked),
      nodes: g.nodes.length,
      links: g.links.length,
      customers: g.packages.reduce((sum: number, p: any) => sum + p.subscribers, 0),
    };
  });
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page
    .getByRole('region', { name: 'Strategy desk' })
    .getByRole('button', { name: 'Expansion', exact: true })
    .click();
  const planner = page.getByRole('region', { name: 'Expansion planner' });
  await planner.getByRole('radio', { name: before.district.name, exact: true }).check();
  const quote = planner.getByLabel('Launch quote', { exact: true });
  const totalText = () => quote.getByText('Total launch cost', { exact: true }).locator('..').locator('dd').innerText();
  // Money renders with Turkish grouping (1.234.567 ₺), so dots are separators, not decimals.
  const amount = (text: string) => Number(text.replace(/[^0-9]/g, ''));
  const accessCost = amount(await totalText());
  await quote.getByRole('radio', { name: 'POP', exact: true }).check();
  const popCost = amount(await totalText());
  expect(popCost).toBeGreaterThan(accessCost);
  await expect(quote.getByText(/Customer sign-ups take time/)).toBeVisible();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 0 } });
  });
  await expect(quote.getByRole('button', { name: /Commission starter network/ })).toBeDisabled();
  await expect(quote.getByText(/Insufficient cash/)).toBeVisible();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 20000000 } });
  });
  expect(await planner.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await quote.screenshot({ path: testInfo.outputPath('launch-quote.png') });
  await quote.getByRole('button', { name: /Commission starter network/ }).click();
  const checklist = page.getByRole('region', { name: 'District launch checklist' });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText('0 / 100', { exact: true })).toBeVisible();
  const after = await page.evaluate(() => {
    const store = (window as any).__game,
      g = store.getState().game;
    return {
      money: g.money,
      nodes: g.nodes.length,
      links: g.links.length,
      kind: g.nodes[g.nodes.length - 1].kind,
      speed: g.speed,
      selected: store.getState().selection.id,
      customers: g.packages.reduce((sum: number, p: any) => sum + p.subscribers, 0),
    };
  });
  expect(after).toEqual({
    money: 20000000 - popCost,
    nodes: before.nodes + 1,
    links: before.links + 1,
    kind: 'pop',
    speed: 0,
    selected: before.district.id,
    customers: before.customers,
  });
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(
    await page.evaluate(
      (id) => (window as any).__game.getState().game.districts.find((d: any) => d.id === id).unlocked,
      before.district.id,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.getState().game.nodes.length)).toBe(before.nodes + 1);
});

test('edits company identity and follows the operator journey', async ({ page }, testInfo) => {
  await startOperator(page, 'Original Company');
  const opener = page.getByRole('button', { name: 'Company profile', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Company profile', exact: true });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  const levels = dialog.getByRole('group', { name: 'Operator levels' });
  await expect(levels.getByRole('button', { name: /City Operator/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('progressbar', { name: '1,500 customers', exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('company-profile.png') });
  await dialog.getByRole('button', { name: /Company identity/ }).click();
  const name = dialog.getByRole('textbox', { name: 'Company name', exact: true });
  await name.fill('  ');
  await expect(dialog.getByRole('button', { name: 'Apply identity' })).toBeDisabled();
  await name.fill('Aurora Telecom');
  await name.press('1');
  await expect(name).toHaveValue('Aurora Telecom1');
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await name.fill('Aurora Telecom');
  await dialog.getByRole('radio', { name: 'Rocket', exact: true }).check();
  await dialog.getByRole('button', { name: 'Apply identity', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Company identity updated.');
  await name.fill('Unsaved Change');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(() => {
      const g = (window as any).__game.getState().game;
      return { name: g.companyName, logo: g.logo };
    }),
  ).toEqual({ name: 'Aurora Telecom', logo: '🚀' });
  await opener.click();
  await levels.getByRole('button', { name: /National Operator/ }).click();
  await dialog.getByRole('button', { name: 'Research edge compute', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.getState().screen)).toBe('research');
  await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
  await expect(page.getByRole('button', { name: /Continue · Slot 1 Aurora Telecom/ })).toBeVisible();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(
    await page.evaluate(() => {
      const g = (window as any).__game.getState().game;
      return { name: g.companyName, logo: g.logo };
    }),
  ).toEqual({ name: 'Aurora Telecom', logo: '🚀' });
});

test('smart pause stops accelerated play and remembers event preferences', async ({ page }, testInfo) => {
  await startOperator(page, 'Smart Pause');
  const settingsButton = page.getByRole('button', { name: 'Smart pause settings', exact: true });
  await settingsButton.click();
  const settings = page.getByRole('dialog', { name: 'Smart pause settings', exact: true });
  const research = settings.getByRole('checkbox', { name: 'Research completed', exact: true });
  await expect(research).not.toBeChecked();
  await research.check();
  await settings.getByRole('checkbox', { name: 'New network incidents', exact: true }).check();
  await expect(settings.getByRole('status')).toHaveText('Preferences saved for this browser.');
  expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('smart-pause-settings.png') });
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(settingsButton).toBeFocused();
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, researchDone: [], researchActive: { id: 'ftth', daysLeft: 0.0001 } } });
    return g.minutes;
  });
  await page.getByRole('button', { name: '4x speed', exact: true }).click();
  const notice = page.getByRole('region', { name: 'Smart pause notification' });
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.minutes)).toBe(before + 5);
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('smart-pause-event.png') });
  await notice.getByRole('button', { name: 'Review Research complete: FTTH Rollout', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().screen)).toBe('research');
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await notice.getByRole('button', { name: 'Resume 4×', exact: true }).click();
  await expect(notice).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  await settingsButton.click();
  await expect(research).toBeChecked();
  await expect(settings.getByRole('checkbox', { name: 'New network incidents', exact: true })).toBeChecked();
  await expect(settings.getByRole('checkbox', { name: 'New contract offers', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('smart pause opens the specific offer in the action center', async ({ page }, testInfo) => {
  await startOperator(page, 'Offer Review');
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const building = g.buildings.find((b: any) => b.segment === 'business');
    const offers = ['Older Client', 'Another Client', 'Priority Client'].map((clientName, i) => ({
      id: 'notice-offer-' + i,
      clientName,
      districtId: building.districtId,
      buildingId: building.id,
      bandwidthGbps: 1,
      monthlyRevenue: 1000,
      slaPercent: 99,
      termMonths: 12,
      segment: 'business',
      requiresRedundancy: false,
      expiresAt: g.minutes + 1440,
      signingBonus: 500,
    }));
    store.setState({
      game: { ...g, speed: 0, offers },
      screen: 'company',
      smartPauseNotice: {
        at: g.minutes,
        resumeSpeed: 4,
        events: [{ kind: 'offers', id: 'notice-offer-2', title: 'New offer: Priority Client' }],
      },
    });
  });
  const notice = page.getByRole('region', { name: 'Smart pause notification' });
  await notice.getByRole('button', { name: 'Review New offer: Priority Client', exact: true }).click();
  const actions = page.locator('#mobile-action-center');
  await expect(actions).toBeVisible();
  await expect(actions.getByText('Priority Client', { exact: true })).toBeVisible();
  await expect(actions.getByRole('tab', { name: /Deals/ })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('smart-pause-offer.png') });
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await actions.getByRole('tab', { name: /Live/ }).click();
  await expect(actions.getByRole('tab', { name: /Live/ })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => (window as any).__game.getState().inspectedOfferId)).toBeNull();
  if (testInfo.project.name !== 'desktop') {
    await actions.getByRole('button', { name: 'Close action center', exact: true }).click();
    await expect(actions).toBeHidden();
  }
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(notice).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
});

test('bids for a city project, builds its network and collects verified payment', async ({ page }, testInfo) => {
  await startOperator(page, 'Civic Fibre');
  const quote = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, money: 20000000, reputation: 100 } });
    const t = g.procurement.tenders[0];
    return { id: t.id, price: Math.ceil(t.budget * 0.65), districtId: t.districtId };
  });
  const projects = page.getByRole('button', { name: 'Projects', exact: true });
  await projects.click();
  await expect(page.getByRole('heading', { name: 'City infrastructure', exact: true })).toBeVisible();
  const brief = page.getByRole('article', { name: 'Infrastructure tender' });
  await brief.getByRole('spinbutton', { name: 'Requested payment', exact: true }).fill(String(quote.price));
  await brief.getByRole('button', { name: 'Submit sealed bid', exact: true }).click();
  await expect(brief.getByRole('status')).toContainText('Sealed bid submitted');
  const bond = Math.ceil(quote.price * 0.1);
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(20000000 - bond);
  await brief.getByRole('button', { name: 'Withdraw bid & recover bond', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(20000000);
  await brief.getByRole('button', { name: 'Submit sealed bid', exact: true }).click();
  expect(await brief.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('city-tender-bid.png') });
  await page.locator('.screen-shell').evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('city-project-overview.png') });
  await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.procurement.tenders[0].bond)).toBe(bond);
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, minutes: g.procurement.tenders[0].closesAt - 5 } });
    store.getState().setSmartPause('tenders', true);
    store.getState().setSpeed(4);
    store.getState().tick();
  });
  const notice = page.getByRole('region', { name: 'Smart pause notification' });
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.procurement.tenders[0].status)).toBe(
    'delivery',
  );
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await notice.getByRole('button', { name: /Review School fibre programme/ }).click();
  await expect(page.getByRole('heading', { name: 'Prove the network' })).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await brief.getByRole('button', { name: 'Inspect project district', exact: true }).click();
  await expect(page.getByLabel('Active city project', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open project brief', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('city-project-map.png') });
  await page.getByRole('button', { name: /^Access/ }).click();
  await page.getByRole('checkbox', { name: /Include fibre to nearest live site/ }).check();
  const built = await page.evaluate((districtId) => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const d = g.districts.find((d: any) => d.id === districtId);
    const c = d.cells.find((c: any) => !g.nodes.some((n: any) => n.gx === c.gx && n.gy === c.gy));
    store.getState().placeNode('access', c.gx, c.gy);
    return (
      store.getState().game.nodes.length === g.nodes.length + 1 &&
      store.getState().game.links.length === g.links.length + 1
    );
  }, quote.districtId);
  expect(built).toBe(true);
  await page.keyboard.press('Escape');
  await projects.click();
  await expect(brief.getByText('All conditions met. Keep service healthy while the clock runs.')).toBeVisible();
  await expect(brief.getByRole('progressbar', { name: 'Continuous service acceptance' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await page.screenshot({ path: testInfo.outputPath('city-project-delivery.png') });
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.getState().setSpeed(4);
    for (let i = 0; i < 18; i++) store.getState().tick();
    store.getState().setSpeed(0);
  });
  await expect(brief.getByRole('heading', { name: 'Infrastructure accepted', exact: true })).toBeVisible();
  const settlement = await page.evaluate(() => {
    const g = (window as any).__game.getState().game;
    const t = g.procurement.tenders[0];
    return {
      status: t.status,
      bond: t.bond,
      accepted: t.qualifyingMinutes,
      payments: g.ledger.filter((e: any) => e.category === 'tender_payment').map((e: any) => e.amount),
    };
  });
  expect(settlement).toEqual({ status: 'completed', bond: 0, accepted: 360, payments: [quote.price] });
  await page.screenshot({ path: testInfo.outputPath('city-project-accepted.png') });
  await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  await projects.click();
  await expect(brief.getByRole('heading', { name: 'Infrastructure accepted', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('market control launches, saves and settles a paid district operation', async ({ page }, testInfo) => {
  await startOperator(page, 'Market Operator');
  const districts = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, money: 2000000, reputation: 60 } });
    return {
      home: g.districts.find((d: any) => d.unlocked),
      locked: g.districts.find((d: any) => !d.unlocked),
      customers: g.packages.reduce((n: number, p: any) => n + p.subscribers, 0),
    };
  });
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('button', { name: /Open market control/ }).click();
  await expect(page.getByRole('heading', { name: 'The city is contested' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('market-overview.png') });
  const selector = page.getByRole('group', { name: 'District selector', exact: true });
  await selector.getByRole('button').filter({ hasText: districts.locked.name }).click();
  const operation = page.getByRole('region', { name: 'Commercial operation', exact: true });
  await expect(operation.getByRole('button', { name: /Launch Switcher programme/ })).toBeDisabled();
  await expect(operation.getByRole('alert')).toContainText('License this district');
  await selector.getByRole('button').filter({ hasText: districts.home.name }).click();
  await operation.getByRole('radio', { name: 'Switcher programme', exact: true }).check();
  await expect(operation.getByText(/Daily net change at today's conditions/)).toBeVisible();
  expect(await operation.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await operation.getByRole('button', { name: 'Launch Switcher programme', exact: true }).click();
  await expect(operation.getByText('Operation in progress', { exact: true })).toBeVisible();
  const launched = await page.evaluate(() => {
    const g = (window as any).__game.getState().game;
    return {
      money: g.money,
      operation: g.competition.operations[0],
      customers: g.packages.reduce((n: number, p: any) => n + p.subscribers, 0),
    };
  });
  expect(launched.money).toBe(2000000 - launched.operation.cost);
  expect(launched.customers).toBe(districts.customers);
  await page.screenshot({ path: testInfo.outputPath('market-operation.png') });
  await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.competition.operations[0].id)).toBe(
    launched.operation.id,
  );
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, minutes: g.competition.operations[0].endsAt - 5, speed: 0 } });
    store.getState().setSmartPause('market', true);
    store.getState().setSpeed(1);
    store.getState().tick();
    store.getState().setSpeed(0);
    store.getState().setScreen('market');
  });
  const results = page.getByRole('region', { name: 'Operation results', exact: true });
  await expect(results.getByText(/Completed · Day/)).toBeVisible();
  const settled = await page.evaluate(() => {
    const g = (window as any).__game.getState().game;
    return {
      active: g.competition.operations.length,
      history: g.competition.history.length,
      charges: g.ledger.filter((e: any) => e.category === 'market_operation').length,
    };
  });
  expect(settled).toEqual({ active: 0, history: 1, charges: 1 });
  await results.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('market-results.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('rival offensive pauses play and service promises carry cancellation risk', async ({ page }, testInfo) => {
  await startOperator(page, 'Competitive Operator');
  await page.getByRole('button', { name: 'Smart pause settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Smart pause settings', exact: true });
  await settings.getByRole('checkbox', { name: 'Market competition', exact: true }).check();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({
      game: {
        ...g,
        money: 2000000,
        reputation: 60,
        speed: 0,
        competition: { ...g.competition, nextMoveAt: g.minutes + 5 },
      },
    });
    store.getState().setSpeed(4);
    store.getState().tick();
  });
  const notice = page.getByRole('region', { name: 'Smart pause notification', exact: true });
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
  await notice.getByRole('button', { name: /Review .*Local price offensive/ }).click();
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
  const desk = page.getByRole('region', { name: 'District competition desk', exact: true });
  await expect(desk.getByRole('note')).toContainText('Local price offensive');
  await desk.getByRole('radio', { name: 'Service promise', exact: true }).check();
  await desk.getByRole('button', { name: 'Launch Service promise', exact: true }).click();
  await expect(desk.getByText('Service standard not met', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => ({
    money: (window as any).__game.getState().game.money,
    reputation: (window as any).__game.getState().game.reputation,
  }));
  await page.screenshot({ path: testInfo.outputPath('market-service-risk.png') });
  await desk.getByRole('button', { name: /End operation · no refund · −3 reputation/ }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(before.money);
  expect(await page.evaluate(() => (window as any).__game.getState().game.reputation)).toBe(before.reputation - 3);
  await expect(
    page.getByRole('region', { name: 'Operation results', exact: true }).getByText(/Ended early/),
  ).toBeVisible();
  await desk.getByRole('button', { name: 'Inspect network', exact: true }).click();
  await page.getByRole('button', { name: 'Open district competition', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The city is contested' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});
