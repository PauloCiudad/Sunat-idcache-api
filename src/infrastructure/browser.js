import { chromium } from "playwright";

import { env } from "../config/env.js";

let browser;

export async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: env.sunat.headless,
      channel: env.sunat.browserChannel,
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-http2"
      ]
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser?.isConnected()) await browser.close();
  browser = undefined;
}
