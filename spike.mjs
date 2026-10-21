import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
try {
  const execPath = await chromium.executablePath();
  console.log("executablePath:", execPath);
  const browser = await pw.launch({ executablePath: execPath, args: chromium.args, headless: true });
  const page = await browser.newPage();
  await page.setContent("<h1>Hello</h1><script>document.title='Rendered OK'; const d=document.createElement('div'); d.id='js'; d.textContent='from JS'; document.body.appendChild(d);</script>");
  await page.waitForSelector("#js");
  console.log("title:", await page.title());
  console.log("rendered text:", await page.textContent("#js"));
  console.log("html has js div:", (await page.content()).includes('id="js"'));
  await browser.close();
  console.log("SPIKE PASS");
} catch (e) {
  console.log("SPIKE FAIL:", e.message.slice(0, 500));
}
