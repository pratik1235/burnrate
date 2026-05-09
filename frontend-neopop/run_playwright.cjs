const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/customize');
  await page.waitForTimeout(2000);
  await page.getByText('LLM Insights').click();
  await page.waitForTimeout(1000);
  
  await page.getByText('AWS Bedrock').click();
  await page.waitForTimeout(500);
  await page.getByText('Test Connection').click();
  await page.waitForTimeout(5000);
  console.log('Bedrock Tab Text AFTER test:', await page.locator('text=Failed:').allInnerTexts());
  
  await browser.close();
})();
