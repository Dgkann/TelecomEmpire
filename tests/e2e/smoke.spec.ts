import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
});

test('starts an operator and exposes the core management screens', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Telecom Empire' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('E2E Telecom');
  await page.getByRole('button', { name: 'Start building' }).click();

  await expect(page.getByRole('navigation', { name: 'Game screens' })).toBeVisible();
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

test('keyboard shortcuts do not fire while a form control has focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Commission new network' }).click();
  const name = page.getByPlaceholder('Company name');
  await name.fill('Key Test');
  await name.press('1');
  await expect(name).toHaveValue('Key Test1');
});

test('map keyboard focus follows the selected network geometry', async ({ page }) => {
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('Focus Test');
  await page.getByRole('button', { name: 'Start building' }).click();

  const fibre = page.locator('svg.map-surface g.map-interactive[aria-label*=" fibre, tier "]').first();
  await fibre.focus();
  await expect(fibre).toHaveCSS('outline-style', 'none');
  await expect(fibre.locator('line.map-focus-ring')).toHaveCSS('opacity', '0.9');

  const site = page.locator('svg.map-surface g.map-interactive:not([aria-label*=" fibre, tier "])').first();
  await site.focus();
  await expect(site).toHaveCSS('outline-style', 'none');
  await expect(site.locator('g.map-focus-ring')).toHaveCSS('opacity', '0.9');
});
