import { expect, test } from '@playwright/test';

test('Turkish management screens fit the viewport and research explains its next action', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('Release Review');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, speed: 0, tutorialDone: true } });
    store.getState().setLocale('tr');
  });
  for (const screen of ['network', 'company', 'research', 'projects', 'market']) {
    await page.evaluate((name) => (window as any).__game.getState().setScreen(name), screen);
    const shell = page.locator('.screen-shell');
    await expect(shell).toBeVisible();
    expect(await shell.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), screen).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${screen}-tr.png`) });
    if (screen === 'research') {
      await expect(shell.getByRole('heading', { name: 'Eve kadar fiber', exact: true })).toBeVisible();
      await expect(shell.getByText('Önce tamamla: Eve kadar fiber')).toHaveCount(2);
      await expect(shell.getByText('12 araştırma puanı daha gerekiyor', { exact: true })).toBeVisible();
      await expect(shell).not.toContainText('Research slot occupied');
    }
  }
});

test('onboarding selects the build tool and requires a POP upgrade, not a core upgrade', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('Guide Review');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.evaluate(() => (window as any).__game.getState().setSpeed(0));
  await page.getByRole('button', { name: 'Select POP', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().tool)).toBe('pop');
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({
      tool: null,
      game: { ...g, tutorialStep: 3, nodes: g.nodes.map((n: any) => (n.kind === 'core' ? { ...n, tier: 2 } : n)) },
    });
  });
  await expect(page.getByRole('button', { name: 'Inspect a POP', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.tutorialStep)).toBe(3);
  await page.getByRole('button', { name: 'Inspect a POP', exact: true }).click();
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.getState();
      return s.game.nodes.find((n: any) => n.id === s.selection.id).kind;
    }),
  ).toBe('pop');
});

test('all campaign transitions preserve company identity and survive reload', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const store = (window as any).__game;
    store.getState().newGame({
      companyName: 'Campaign Review',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Marmara',
      mode: 'campaign',
      seed: 12345,
    });
    const rejectedEarly = !store.getState().advanceCampaign();
    store.getState().setAutoConnect(true);
    store.setState({
      game: {
        ...store.getState().game,
        researchDone: ['ftth'],
        researchPoints: 17,
        researchActive: { id: 'fiber10g', daysLeft: 9 },
      },
    });
    const stages = [];
    for (let stage = 0; stage < 2; stage++) {
      const g = store.getState().game;
      // Isolate transition plumbing from the separate economic playthrough.
      store.setState({ game: { ...g, speed: 0, victoryAt: g.minutes, money: 10000000, reputation: 90 } });
      if (!store.getState().advanceCampaign()) throw new Error('Transition rejected');
      if (!store.getState().autoConnect) throw new Error('Connected construction preference lost at city transition');
      store.getState().continueGame();
      const next = store.getState().game;
      stages.push({
        city: next.cityName,
        stage: next.campaignStage,
        company: next.companyName,
        money: next.money,
        reputation: next.reputation,
        research: next.researchDone.length,
        points: next.researchPoints,
        active: next.researchActive,
        training: next.signalTraining.completed,
      });
    }
    const g = store.getState().game;
    store.setState({ game: { ...g, victoryAt: g.minutes } });
    return { rejectedEarly, stages, rejectedBeyondLast: !store.getState().advanceCampaign() };
  });
  expect(result.rejectedEarly).toBe(true);
  expect(result.rejectedBeyondLast).toBe(true);
  expect(result.stages).toEqual([
    {
      city: 'Karadeniz',
      stage: 1,
      company: 'Campaign Review',
      money: 4000000,
      reputation: 72,
      research: 1,
      points: 17,
      active: { id: 'fiber10g', daysLeft: 9 },
      training: 0,
    },
    {
      city: 'Ege',
      stage: 2,
      company: 'Campaign Review',
      money: 4000000,
      reputation: 72,
      research: 1,
      points: 17,
      active: { id: 'fiber10g', daysLeft: 9 },
      training: 0,
    },
  ]);
});
