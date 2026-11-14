import { expect, test } from '@playwright/test';

// Critical user journey: customer places an order from the cart page.
// Business rules (the 10% discount) are NOT re-tested in detail: one number proves the wiring.
test('customer places an order from the cart', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Gio hang' })).toBeVisible();
  await page.getByRole('button', { name: 'Dat hang' }).click();

  await expect(page.getByRole('status')).toContainText(/Da dat web-\d+ - tong 1080000 VND/);
});

test('the page shows an error when the API rejects the request', async ({ page }) => {
  // Network-level stub of the API: simulate a domain error without touching the server state.
  await page.route('**/orders', (route) =>
    route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Don toi da 5 dong"}' }),
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Dat hang' }).click();

  await expect(page.getByRole('status')).toHaveText('Loi: Don toi da 5 dong');
});
