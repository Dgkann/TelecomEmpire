import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/');
  return page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Restoration', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 811 });
    const g = store.getState().game;
    store.setState({ game: { ...g, speed: 0, tutorialDone: true, researchActive: { id: 'ftth', daysLeft: 5 } } });
    store.getState().setLocale('tr');
    store.getState().setScreen('projects');
    return { money: g.money, points: g.researchPoints, minutes: g.minutes, nodes: g.nodes };
  });
}

test('restoration saves, repairs three faults and rewards without changing the live network', async ({
  page,
}, testInfo) => {
  const original = await setup(page);
  await page.getByRole('button', { name: 'Kesintiyi gider · 3 arıza' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kesintiyi gider', exact: true });
  await expect(dialog.getByRole('button', { name: 'Rotayı doğrula' })).toBeDisabled();
  const initial = await page.evaluate(() => (window as any).__game.getState().game.signalTraining.active);
  expect(initial.rotations.filter(Boolean)).toHaveLength(3);
  const board = dialog.getByRole('group', { name: 'Kablo panosu' });
  await board
    .getByRole('button')
    .nth(initial.rotations.findIndex((r: number) => r !== 0))
    .click();
  const saved = await page.evaluate(() => (window as any).__game.getState().game.signalTraining);
  await dialog.getByRole('button', { name: 'İlerlemeyi kaydet' }).click();
  await page.reload();
  await page.evaluate(() => {
    if (!(window as any).__game.getState().continueGame()) throw new Error('Could not load restoration');
  });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining)).toEqual(saved);
  for (let i = 0; i < saved.active.rotations.length; i++) {
    for (let j = 0; j < (4 - saved.active.rotations[i]) % 4; j++) await board.getByRole('button').nth(i).click();
  }
  await dialog.getByRole('button', { name: 'Rotayı doğrula' }).click();
  await expect(dialog).toContainText('Bağlantı tamamlandı! Ödül alındı');
  expect(
    await page.evaluate(() => {
      const store = (window as any).__game;
      store.getState().setSpeed(4);
      store.getState().tick();
      store.getState().submitSignalTraining();
      const g = store.getState().game;
      return {
        money: g.money,
        points: g.researchPoints,
        minutes: g.minutes,
        nodes: g.nodes,
        researchDays: g.researchActive.daysLeft,
      };
    }),
  ).toEqual({ ...original, money: original.money + 30000, points: original.points + 3, researchDays: 4 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('restoration-complete-tr.png') });
  await dialog.getByRole('button', { name: 'Şirkete dön' }).click();
  await page.evaluate(() => (window as any).__game.getState().setLocale('en'));
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Restore service · 3 faults' }).click();
  await expect(page.getByRole('dialog', { name: 'Restore service', exact: true })).toContainText(
    'Three cables are misaligned.',
  );
});

test('keyboard navigation stays within the board and only rotation keys spend moves', async ({ page }) => {
  await setup(page);
  const launch = page.getByRole('button', { name: 'Kesintiyi gider · 3 arıza' });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Kesintiyi gider', exact: true });
  const tiles = dialog.getByRole('group', { name: 'Kablo panosu' }).getByRole('button');
  await tiles.nth(0).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(tiles.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(5)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tiles.nth(4)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(7)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(15)).toBeFocused();
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining.active.moves)).toBe(0);
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining.active.moves)).toBe(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test('optional hints identify a cable without spending moves or rewards', async ({ page }, testInfo) => {
  const original = await setup(page);
  const launch = page.getByRole('button', { name: 'Kesintiyi gider · 3 arıza' });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Kesintiyi gider', exact: true });
  const before = await page.evaluate(() => (window as any).__game.getState().game.signalTraining);
  await dialog.getByRole('button', { name: 'İpucu göster' }).click();
  await expect(dialog.getByText(/İpucu: .*Ödülün değişmez/)).toBeVisible();
  const tile = dialog.getByRole('button', { name: /, ipucu$/ });
  await expect(tile).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining)).toEqual(before);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('restoration-hint-tr.png') });
  await tile.click();
  await expect(dialog.getByText(/İpucu: .*Ödülün değişmez/)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__game.getState().game.signalTraining.active.moves)).toBe(1);
  await dialog.getByRole('button', { name: 'İpucu göster' }).click();
  await dialog.press('Escape');
  await launch.click();
  await expect(dialog.getByRole('button', { name: /, ipucu$/ })).toHaveCount(0);
  const rotations = await page.evaluate(() => (window as any).__game.getState().game.signalTraining.active.rotations);
  const board = dialog.getByRole('group', { name: 'Kablo panosu' });
  await dialog.getByRole('button', { name: 'İpucu göster' }).click();
  for (let i = 0; i < rotations.length; i++) {
    for (let j = 0; j < (4 - rotations[i]) % 4; j++) await board.getByRole('button').nth(i).click();
  }
  await expect(dialog.getByRole('button', { name: 'İpucu göster' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Rotayı doğrula' }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(original.money + 30000);
});
