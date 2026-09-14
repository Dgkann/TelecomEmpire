import { expect, test } from '@playwright/test';

test('fault finding saves the repair, pauses time and shares rewards with routing', async ({ page }, testInfo) => {
  await page.goto('/');
  const before = await page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Fault finder', logo: 'x', difficulty: 'standard', cityName: 'Ege', seed: 7311 });
    const game = store.getState().game;
    store.setState({ game: { ...game, speed: 0, tutorialDone: true, researchActive: { id: 'ftth', daysLeft: 5 } } });
    store.getState().setLocale('tr');
    store.getState().setScreen('projects');
    return { money: game.money, points: game.researchPoints, minutes: game.minutes };
  });
  await page.getByRole('button', { name: 'Arıza bul · Kısa görev' }).click();
  let dialog = page.getByRole('dialog', { name: 'Arıza bulma', exact: true });
  await expect(dialog).toContainText('yalnızca bir kablo yanlış yönde');
  await expect(dialog.getByRole('button', { name: 'Rotayı doğrula' })).toBeDisabled();
  const fault = await page.evaluate(() =>
    (window as any).__game.getState().game.signalTraining.active.rotations.findIndex((r: number) => r !== 0),
  );
  await dialog.getByRole('group', { name: 'Kablo panosu' }).getByRole('button').nth(fault).press('Space');
  await dialog.getByRole('button', { name: 'İlerlemeyi kaydet' }).click();
  await expect(dialog.getByText('Oyun ve rota kaydedildi.')).toBeVisible();
  await page.reload();
  await page.evaluate(() => (window as any).__game.getState().continueGame());
  dialog = page.getByRole('dialog', { name: 'Arıza bulma', exact: true });
  await expect(dialog).toBeVisible();
  for (let turn = 0; turn < 2; turn++)
    await dialog.getByRole('group', { name: 'Kablo panosu' }).getByRole('button').nth(fault).click();
  await dialog.getByRole('button', { name: 'Rotayı doğrula' }).click();
  await expect(dialog).toContainText('Bağlantı tamamlandı! Ödül alındı');
  await expect(dialog).toContainText('Araştırmadan 1 günlük çalışma düşüldü.');
  expect(await page.evaluate(() => (window as any).__game.getState().game.researchActive.daysLeft)).toBe(4);
  expect(
    await page.evaluate(() => {
      const store = (window as any).__game;
      store.getState().setSpeed(4);
      store.getState().tick();
      const g = store.getState().game;
      return {
        money: g.money,
        points: g.researchPoints,
        minutes: g.minutes,
        duplicate: store.getState().submitSignalTraining(),
      };
    }),
  ).toEqual({ money: before.money + 30000, points: before.points + 3, minutes: before.minutes, duplicate: false });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fault-finding.png') });
  await dialog.getByRole('button', { name: 'Şirkete dön' }).click();
  await page.evaluate(() => (window as any).__game.getState().setScreen('projects'));
  await expect(page.getByText('Ödül 7 oyun günü sonra yenilenir.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Oyna · 4×4', exact: true }).click();
  const rotations: number[] = await page.evaluate(
    () => (window as any).__game.getState().game.signalTraining.active.rotations,
  );
  dialog = page.getByRole('dialog', { name: 'Sinyal rotası', exact: true });
  for (let tile = 0; tile < rotations.length; tile++) {
    for (let turn = 0; turn < (4 - rotations[tile]) % 4; turn++)
      await dialog.getByRole('group', { name: 'Kablo panosu' }).getByRole('button').nth(tile).click();
  }
  await dialog.getByRole('button', { name: 'Rotayı doğrula' }).click();
  await expect(dialog).toContainText('Bu tur ödülsüzdü.');
  expect(await page.evaluate(() => (window as any).__game.getState().game.researchActive.daysLeft)).toBe(4);
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(before.money + 30000);
});

test('research waiting guidance explains blockers and opens useful work', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Waiting well', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 4242 });
    const game = store.getState().game;
    store.setState({
      game: { ...game, speed: 0, tutorialDone: true, money: 0, researchPoints: 0, employees: [], packages: [] },
    });
    store.getState().setLocale('tr');
    store.getState().setScreen('research');
  });
  let wait = page.getByRole('region', { name: 'Bekleme tahmini' });
  await expect(wait).toContainText('Yalnızca beklemek yetmiyor');
  await expect(wait).toContainText('Günlük araştırma puanı: 0');
  await wait.getByRole('button', { name: 'Birikimi artırmak için bütçeyi incele' }).click();
  await expect(page.locator('#finances')).toBeInViewport();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 1000000 } });
    store.getState().setScreen('research');
  });
  wait = page.getByRole('region', { name: 'Bekleme tahmini' });
  await wait.getByRole('button', { name: 'Mühendis kadrosunu incele' }).click();
  await expect(page.locator('#staff')).toBeInViewport();
  await page.evaluate(() => {
    const store = (window as any).__game;
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        money: 700000,
        researchPoints: 6,
        packages: [
          {
            id: 'forecast',
            name: 'Forecast',
            segment: 'residential',
            active: true,
            price: 1000,
            subscribers: 1000,
            speedMbps: 100,
          },
        ],
        employees: [
          { id: 'engineer', name: 'Engineer', role: 'network_engineer', skill: 2, experience: 0, salary: 10000 },
        ],
      },
    });
    store.getState().setScreen('research');
  });
  await expect(wait).toContainText(/Başlatmaya tahminen \d+ oyun günü/);
  await expect(wait).toContainText('Eksik puanlar yaklaşık 3 oyun gününde birikir.');
  expect(await wait.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('research-waiting-tr.png') });
  await wait.getByRole('button', { name: /Kısa ağ görevleri/ }).click();
  await expect(page.locator('#network-exercises')).toBeInViewport();
  await page.getByRole('button', { name: 'Arıza bul · Kısa görev' }).click();
  await expect(page.getByRole('dialog', { name: 'Arıza bulma', exact: true })).toBeVisible();
});
