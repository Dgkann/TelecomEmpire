import { expect, test, type Page } from '@playwright/test';

// Solving the board click by click takes about 6 s in Chromium but 20-45 s in WebKit, which ran into the 45 s limit.
test.slow(({ browserName }) => browserName === 'webkit', 'WebKit works through the cable board far more slowly');

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('Signal Test');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, speed: 0, tutorialDone: true } });
  });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
}

async function solve(page: Page, tr = false) {
  const turns: number[] = await page.evaluate(
    () => (window as any).__game.getState().game.signalTraining.active.rotations,
  );
  const board = page.getByRole('group', { name: tr ? 'Kablo panosu' : 'Cable board' });
  for (let i = 0; i < turns.length; i++) {
    for (let count = 0; count < (4 - turns[i]) % 4; count++) await board.getByRole('button').nth(i).click();
  }
}

test('routing exercise saves progress, protects the clock and awards once', async ({ page }, testInfo) => {
  await setup(page);
  const baseline = await page.evaluate(() => {
    const g = (window as any).__game.getState().game;
    return { money: g.money, points: g.researchPoints, minutes: g.minutes, nodes: JSON.stringify(g.nodes) };
  });
  await page.getByRole('button', { name: 'Play · 4×4', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Signal routing', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Verify route' })).toBeDisabled();
  const tile = dialog.getByRole('group', { name: 'Cable board' }).getByRole('button').nth(2);
  await tile.focus();
  await tile.press('Space');
  const saved = await page.evaluate(() => {
    const store = (window as any).__game;
    store.getState().setSpeed(4);
    store.getState().tick();
    return { training: store.getState().game.signalTraining, minutes: store.getState().game.minutes };
  });
  expect(saved.training.active.moves).toBe(1);
  expect(saved.minutes).toBe(baseline.minutes);
  await dialog.getByRole('button', { name: 'Save progress' }).click();
  await expect(dialog.getByText('Game and route saved.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Continue · Slot 1/ }).click();
  dialog = page.getByRole('dialog', { name: 'Signal routing', exact: true });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining)).toEqual(saved.training);
  await solve(page);
  await expect(dialog.getByRole('button', { name: 'Verify route' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Verify route' }).click();
  await expect(dialog.getByText(/Connection complete! Reward received/)).toBeVisible();
  const after = await page.evaluate(() => {
    const store = (window as any).__game;
    const duplicate = store.getState().submitSignalTraining();
    const g = store.getState().game;
    return { duplicate, money: g.money, points: g.researchPoints, nodes: JSON.stringify(g.nodes) };
  });
  expect(after).toEqual({
    duplicate: false,
    money: baseline.money + 30000,
    points: baseline.points + 3,
    nodes: baseline.nodes,
  });
  await page.screenshot({ path: testInfo.outputPath('signal-route-complete.png') });
  await dialog.getByRole('button', { name: 'Return to company' }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.speed)).toBe(0);
});

test('Turkish challenge is playable on touch and practice cannot farm rewards', async ({ page }, testInfo) => {
  await setup(page);
  await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, signalTraining: { ...g.signalTraining, nextRewardAt: g.minutes + 10080 } } });
    store.getState().setLocale('tr');
  });
  const launch = page.getByRole('button', { name: 'Zorlu rota · 5×5' });
  await launch.click();
  let dialog = page.getByRole('dialog', { name: 'Sinyal rotası', exact: true });
  await expect(dialog.getByRole('group', { name: 'Kablo panosu' }).getByRole('button')).toHaveCount(25);
  await dialog.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launch).toBeFocused();
  await launch.click();
  dialog = page.getByRole('dialog', { name: 'Sinyal rotası', exact: true });
  const cash = await page.evaluate(() => (window as any).__game.getState().game.money);
  await solve(page, true);
  await dialog.getByRole('button', { name: 'Rotayı doğrula' }).click();
  await expect(dialog.getByText('Alıştırma tamamlandı! Bu tur ödülsüzdü.')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(cash);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('signal-route-mobile.png') });
});
