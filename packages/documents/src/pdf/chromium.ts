import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

let browserInstance: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance

  // Disable graphics mode for serverless environments
  chromium.setGraphicsMode = false

  browserInstance = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })

  return browserInstance
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance?.connected) {
    await browserInstance.close()
    browserInstance = null
  }
}
