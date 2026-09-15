import { expect, test } from '@playwright/test';

test('small data centre connects, saves and expands through the research guidance', async ({ page }, testInfo) => {
  await page.goto('/');
  const site = await page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Staged hosting', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 811 });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        money: 8000000,
        speed: 0,
        tutorialDone: true,
        researchDone: ['ftth', 'fiber10g', 'backbone100g'],
      },
    });
    store.getState().setLocale('tr');
    store.getState().setScreen('research');
    const district = game.districts.find((d: any) => d.unlocked);
    const cell = district.cells
      .filter((c: any) => !game.nodes.some((n: any) => n.gx === c.gx && n.gy === c.gy))
      .sort(
        (a: any, b: any) =>
          Math.hypot(a.gx - game.nodes[0].gx, a.gy - game.nodes[0].gy) -
          Math.hypot(b.gx - game.nodes[0].gx, b.gy - game.nodes[0].gy),
      )[0];
    return cell;
  });
  const guidance = page.getByRole('region', { name: 'Veri merkezi kurulumu' });
  await expect(guidance).toContainText('1.200.000 ₺');
  await guidance.getByRole('button', { name: 'Veri merkezi yerini seç' }).click();
  const id = await page.evaluate(({ gx, gy }) => {
    const store = (window as any).__game;
    store.getState().placeNode('datacenter', gx, gy);
    const node = store.getState().game.nodes.find((n: any) => n.kind === 'datacenter');
    if (!node || node.tier !== 0 || node.capacityGbps !== 10) throw new Error('Small centre not built');
    if (!store.getState().game.links.some((l: any) => l.aId === node.id || l.bId === node.id))
      throw new Error('No fibre connection');
    store.getState().upgradeNode(node.id);
    if (store.getState().game.nodes.find((n: any) => n.id === node.id).tier !== 0)
      throw new Error('Research gate bypassed');
    if (!store.getState().save()) throw new Error('Save failed');
    return node.id;
  }, site);
  await page.reload();
  await page.evaluate(() => {
    const store = (window as any).__game;
    if (!store.getState().continueGame()) throw new Error('Load failed');
    store.setState({
      game: {
        ...store.getState().game,
        researchDone: ['ftth', 'fiber10g', 'backbone100g', 'edge_compute'],
        money: 3200000,
      },
    });
    store.getState().setScreen('research');
  });
  await expect(guidance).toContainText('Sonraki aşama: tam kapasiteli merkez');
  await expect(guidance).toContainText('3.200.000 ₺');
  const finances = guidance.getByRole('region', { name: 'Veri merkezi finansmanı' });
  await expect(finances.getByText('Ek aylık net katkı', { exact: true })).toBeVisible();
  await expect(finances.getByText('Tahmini geri ödeme', { exact: true })).toBeVisible();
  expect(await finances.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(3200000);
  await guidance.getByRole('button', { name: 'Genişletmeyi incele' }).click();
  const small = page.getByRole('region', { name: 'Küçük veri merkezi' });
  await expect(small).toBeVisible();
  expect(await small.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('small-data-centre-tr.png') });
  await page.getByRole('button', { name: /Tam merkeze genişlet/ }).click();
  expect(
    await page.evaluate((id) => {
      const g = (window as any).__game.getState().game;
      const n = g.nodes.find((n: any) => n.id === id);
      return { tier: n.tier, capacity: n.capacityGbps, money: g.money };
    }, id),
  ).toEqual({ tier: 1, capacity: 40, money: 0 });
});
