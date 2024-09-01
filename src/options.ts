import { Page } from 'puppeteer';

export async function enablePageCaching(page: Page) {
  await page.setCacheEnabled(true);
}

export async function ignoreResourceLoading(
  page: Page,
  resourceTypes = ['image', 'stylesheet', 'font'],
) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (
      resourceTypes.includes(request.resourceType()) ||
      request.url().includes('ads')
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
}
