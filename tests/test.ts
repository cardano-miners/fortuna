import { expect, test } from '@playwright/test';

test('index page has expected h1', async ({ page }) => {
	await page.goto('/');

	const element = page.getByRole('heading', { name: 'Welcome to SvelteKit' });

	await expect(element).toBeVisible();
});
