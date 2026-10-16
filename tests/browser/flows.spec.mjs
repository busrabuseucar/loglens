import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseCsv, analyze } from '../../dist/engine.js';

async function csvDownload(page, selector) {
  const ready = page.waitForEvent('download');
  await page.locator(selector).click();
  return readFile(await (await ready).path(), 'utf8');
}

test('sample evidence, filters, export and experiment round trip', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#alert-count')).toHaveText('4');
  await page.locator('#rule-filter').selectOption('R3');
  await expect(page.locator('#findings tbody tr')).toHaveCount(1);
  const exported = await csvDownload(page, '#export');
  expect(exported.trim().split('\n')).toHaveLength(2);
  expect(exported).toContain('R3,high,198.51.100.77');
  await page.locator('#findings button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#evidence-button').click();
  await expect(page.locator('#events-table tbody tr')).toHaveCount(4);
  await page.locator('#clear-evidence').click();
  await expect(page.locator('#page-info')).toContainText('161 kayıt');
  await page.locator('#next-page').click();
  await expect(page.locator('#page-info')).toContainText('Sayfa 2');
  await page.locator('nav [data-view="experiment"]').click();
  await page.locator('[data-delay="300"]').click();
  await expect(page.locator('#experiment-badge')).toHaveText('R3 uyarısı var');
  await page.locator('[data-delay="301"]').click();
  await expect(page.locator('#experiment-badge')).toHaveText('R3 uyarısı yok');
  const altered = await csvDownload(page, '#experiment-download');
  expect(analyze(parseCsv(altered).events).alerts).toHaveLength(3);
  await page.locator('nav [data-view="overview"]').click();
  await expect(page.locator('#alert-count')).toHaveText('4');
  await page.locator('#file-input').setInputFiles({ name: 'experiment.csv', mimeType: 'text/csv', buffer: Buffer.from(altered) });
  await expect(page.locator('#alert-count')).toHaveText('3');
  await expect(page.locator('#sample-badge')).toBeHidden();
});

test('invalid uploads preserve results and log text cannot become HTML', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('#alert-count')).toHaveText('4');
  await page.locator('#file-input').setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('timestamp,ip,username,status\n"unfinished') });
  await expect(page.locator('#notification')).toContainText('Önceki analiz korunuyor');
  await expect(page.locator('#alert-count')).toHaveText('4');
  const account = '<img src=x onerror=window.injected=1>';
  const csv = 'timestamp,ip,username,status\n' + [0,1,2,3].map((i) => `2026-09-04T09:00:0${i}Z,192.0.2.1,${account},${i === 3 ? 'success' : 'failure'}`).join('\n');
  await page.locator('#file-input').setInputFiles({ name: 'custom.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#dataset-name')).toHaveText('custom.csv');
  await expect(page.locator('#alert-count')).toHaveText('1');
  await page.locator('#findings button').click();
  await expect(page.locator('#detail-content')).toContainText(account);
  await expect(page.locator('#detail-content img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  await page.reload();
  await expect(page.locator('#dataset-name')).toHaveText('sample.csv');
  await expect(page.locator('#alert-count')).toHaveText('4');
});
