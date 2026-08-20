import { env } from "../config/env.js";
import { getBrowser } from "../infrastructure/browser.js";
import { logger } from "../infrastructure/logger.js";

const RESOURCE_ENDPOINT =
  "https://e-plataformaunica.sunat.gob.pe/v1/gestor-sesiones/recurso";

function extractIdCache(value) {
  if (!value || typeof value !== "object") return null;

  for (const [key, content] of Object.entries(value)) {
    if (key.toLowerCase() === "idcache" && content) return String(content);
    const nested = extractIdCache(content);
    if (nested) return nested;
  }
  return null;
}

async function navigateWithRetry(page, url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: env.sunat.requestTimeoutMs
      });
    } catch (error) {
      lastError = error;
      const transient = /ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ERR_TIMED_OUT/
        .test(error.message);
      if (!transient || attempt === attempts) throw error;
      await page.waitForTimeout(attempt * 2_000);
    }
  }
  throw lastError;
}

export class AuthService {
  async getIdCache() {
    const session = await this.createSession();
    return session.idCache;
  }

  async createSession() {
    const browser = await getBrowser();
    const context = await browser.newContext({
      locale: "es-PE",
      timezoneId: "America/Lima",
      viewport: { width: 1440, height: 900 }
    });

    let resolveResource;
    const resourcePromise = new Promise(resolve => {
      resolveResource = resolve;
    });

    const onResponse = async response => {
      if (
        response.url().split("?")[0] === RESOURCE_ENDPOINT &&
        response.request().method() === "GET"
      ) {
        try {
          const text = await response.text();
          let payload;
          try { payload = JSON.parse(text); } catch { payload = text.trim(); }
          const idCache = typeof payload === "string"
            ? payload
            : extractIdCache(payload);
          if (idCache) resolveResource({ response, idCache });
        } catch {
          // Puede existir más de un GET /recurso; esperamos el que tenga idCache.
        }
      }
    };
    context.on("response", onResponse);

    try {
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      await page.evaluate(() => { window.name = "NewWindow"; });

      await page.goto(env.sunat.tramiteUrl, {
        waitUntil: "domcontentloaded",
        timeout: env.sunat.requestTimeoutMs
      });

      const startLink = page
        .getByRole("link", { name: /iniciar trámite/i })
        .first();
      await startLink.waitFor({ state: "visible" });

      const href = await startLink.getAttribute("href");
      if (!href) throw new Error("El enlace Iniciar trámite no contiene URL");

      await navigateWithRetry(page, new URL(href, page.url()).toString());
      await page.locator("#txtRuc").waitFor({ state: "visible" });
      await page.locator("#btnPorRuc").click();
      await page.locator("#txtRuc").fill(env.sunat.ruc);
      await page.locator("#txtUsuario").fill(env.sunat.usuarioSol.toUpperCase());
      await page.locator("#txtContrasena").fill(env.sunat.claveSol);
      await page.locator("#btnAceptar").click();

      let timer;
      const resource = await Promise.race([
        resourcePromise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("SUNAT no respondió gestor-sesiones/recurso")),
            env.sunat.requestTimeoutMs
          );
        })
      ]).finally(() => clearTimeout(timer));

      if (!resource.response.ok()) {
        throw new Error(
          `SUNAT recurso respondió HTTP ${resource.response.status()}`
        );
      }

      logger.info("sunat.auth.success");
      const cookies = await context.cookies();
      const cookieHeader = cookies
        .filter(cookie => cookie.domain.endsWith("sunat.gob.pe"))
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join("; ");

      return {
        idCache: resource.idCache,
        cookieHeader
      };
    } catch (error) {
      logger.error("sunat.auth.failed", { message: error.message });
      const timestamp = Date.now();
      await Promise.all(context.pages().map((page, index) =>
        page.screenshot({
          path: `error-id-cache-${timestamp}-pagina-${index + 1}.png`,
          fullPage: true
        }).catch(() => undefined)
      ));
      throw error;
    } finally {
      context.off("response", onResponse);
      await context.close();
    }
  }
}
