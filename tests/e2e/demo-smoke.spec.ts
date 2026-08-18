import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/#/examples/capability',
  '/#/examples/shoebox',
  '/#/examples/multiroom',
];

test.describe('demo routes', () => {
  for (const route of routes) {
    test(`${route} renders a nonblank canvas`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(error.message));

      await page.goto(route);
      await expect(page.locator('canvas').first()).toBeVisible();
      await page.waitForTimeout(450);

      const colors = await canvasColorSpread(page);
      expect(colors.uniqueColors).toBeGreaterThan(8);
      expect(colors.nonTransparentPixels).toBeGreaterThan(20);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('navigation moves between scenes', async ({ page }) => {
    await page.goto('/#/examples/capability');
    await page.getByRole('link', { name: /Shoebox/i }).click();
    await expect(page).toHaveURL(/#\/examples\/shoebox$/);
    await expect(page.locator('[data-route="shoebox"]')).toBeVisible();
  });

  test('shoebox room controls update scale and material state', async ({ page }) => {
    await page.goto('/#/examples/shoebox');
    const roomScale = page.getByTestId('room-scale');
    await roomScale.focus();
    for (let index = 0; index < 5; index += 1) {
      await roomScale.press('ArrowRight');
    }
    await expect(page.getByTestId('room-scale-value')).toContainText('1.25');

    const snow = page.getByTestId('room-material-snow');
    await snow.click();
    await expect(snow).toHaveAttribute('aria-pressed', 'true');

    const waterSurface = page.getByTestId('room-material-waterSurface');
    await expect(waterSurface).toContainText('Water Surface');

    await page.getByTestId('shoebox-backend-mode').selectOption('gpu');
    await expect(page.getByTestId('shoebox-backend-metric')).toContainText('WebGPU');
    await page.getByTestId('shoebox-quality-preset').selectOption('quality');
    await expect(page.getByTestId('shoebox-quality-metric')).toContainText('Quality');
  });

  test('multiroom door toggles update UI state', async ({ page }) => {
    await page.goto('/#/examples/multiroom');
    await page.getByTestId('multiroom-backend-mode').selectOption('mt');
    await expect(page.getByTestId('multiroom-backend-metric')).toContainText('Multi Thread');
    await page.getByTestId('multiroom-quality-preset').selectOption('fast');
    await expect(page.getByTestId('multiroom-quality-metric')).toContainText('Fast');

    const door = page.getByTestId('door-north');
    await expect(door).toHaveAttribute('aria-pressed', 'false');
    await door.click();
    await expect(door).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gain-north')).toContainText('0.86');
  });
});

async function canvasColorSpread(page: Page): Promise<{
  uniqueColors: number;
  nonTransparentPixels: number;
}> {
  return page.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { uniqueColors: 0, nonTransparentPixels: 0 };

    const width = Math.min(96, Math.max(1, canvas.width));
    const height = Math.min(96, Math.max(1, canvas.height));
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const colors = new Set<string>();
    let nonTransparentPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha === 0) continue;
      nonTransparentPixels += 1;
      colors.add(`${pixels[index] >> 4}:${pixels[index + 1] >> 4}:${pixels[index + 2] >> 4}`);
    }

    return { uniqueColors: colors.size, nonTransparentPixels };
  });
}
