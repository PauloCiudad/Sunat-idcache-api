import { chromium } from "playwright";

const ENDPOINT_DETRACCIONES =
  "/v1/recaudacion/tributaria/declapago/detracciones/t/consultar";

const SUNAT_SOL_URL = "https://www.sunat.gob.pe/sol.html";

const SUNAT_MENU_ENTRY_URL =
  "https://e-menu.sunat.gob.pe/cl-ti-itmenu2/" +
  "MenuInternetPlataforma.htm?exe=55.1.1.1.1";

const SUNAT_TRAMITE_URL =
  "https://www.gob.pe/1144-declaracion-y-pago-de-impuestos-a-sunat-" +
  "personas-naturales-declarar-y-pagar-rentas-de-cuarta-categoria";

const ENDPOINT_RECURSO_SESION =
  "https://e-plataformaunica.sunat.gob.pe/v1/gestor-sesiones/recurso";

let browser;

/*
 * Evita ejecutar dos sesiones SOL simultáneamente.
 * Las llamadas se procesarán una detrás de otra.
 */
let colaConsultas = Promise.resolve();

export function ejecutarEnCola(tarea) {
  const ejecucion = colaConsultas.then(tarea, tarea);

  colaConsultas = ejecucion.catch(() => undefined);

  return ejecucion;
}

async function obtenerBrowser() {
  if (!browser || !browser.isConnected()) {
    const headless = process.env.HEADLESS !== "false";

    browser = await chromium.launch({
      headless,
      // El canal chromium usa el modo headless moderno, más cercano al
      // navegador normal que el headless shell predeterminado.
      channel: process.env.BROWSER_CHANNEL || "chromium",
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-http2"
      ]
    });
  }

  return browser;
}

export function fechaActualPeru() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(new Date());

  const valores = Object.fromEntries(
    partes.map(({ type, value }) => [type, value])
  );

  return `${valores.day}/${valores.month}/${valores.year}`;
}

async function buscarLocatorEnFrames(
  page,
  selector,
  timeout = 90_000
) {
  const tiempoLimite = Date.now() + timeout;

  while (Date.now() < tiempoLimite) {
    for (const frame of page.frames()) {
      const locator = frame.locator(selector);

      try {
        if (
          (await locator.count()) > 0 &&
          (await locator.first().isVisible())
        ) {
          return {
            frame,
            locator: locator.first()
          };
        }
      } catch {
        // El frame puede estar navegando mientras se inspecciona.
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `No se encontró el selector ${selector}`
  );
}

async function iniciarSesion(page) {
  console.log("Abriendo el portal SUNAT SOL...");

  await page.goto(process.env.SUNAT_SOL_URL || SUNAT_SOL_URL, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });

  const accesoDeclaraciones = page.locator(
    'a[href="javascript:declaraSimplificadaNueva()"]'
  );

  await accesoDeclaraciones.waitFor({
    state: "visible",
    timeout: 60_000
  });

  console.log("Ingresando a Mis declaraciones y pagos...");

  // declaraSimplificadaNueva() usa window.open. La espera debe crearse antes
  // del clic para no perder el evento de la ventana emergente.
  const ventanaLoginPromise = page.waitForEvent("popup", {
    timeout: 60_000
  });

  await accesoDeclaraciones.click();

  const paginaSol = await ventanaLoginPromise;

  await paginaSol
    .waitForURL(url => url.toString() !== "about:blank", {
      timeout: 10_000
    })
    .catch(() => undefined);

  if (paginaSol.url() === "about:blank") {
    console.log(
      "El popup quedó vacío; continuando con la URL oficial del acceso..."
    );

    await paginaSol.goto(SUNAT_MENU_ENTRY_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
  }

  await paginaSol.waitForLoadState("domcontentloaded", {
    timeout: 120_000
  });

  await paginaSol.locator("#txtRuc").waitFor({
    state: "visible",
    timeout: 60_000
  });

  await paginaSol.locator("#btnPorRuc").click();

  await paginaSol
    .locator("#txtRuc")
    .fill(process.env.SUNAT_RUC);

  await paginaSol
    .locator("#txtUsuario")
    .fill(process.env.SUNAT_USUARIO_SOL.toUpperCase());

  await paginaSol
    .locator("#txtContrasena")
    .fill(process.env.SUNAT_CLAVE_SOL);

  await paginaSol.locator("#btnAceptar").click();

  /*
   * Esperamos que desaparezca el formulario.
   * Si continúa visible, revisamos el mensaje de error.
   */
  try {
    await paginaSol.locator("#txtRuc").waitFor({
      state: "hidden",
      timeout: 60_000
    });
  } catch {
    let mensaje = "";

    const mensajeSunat = paginaSol.locator(
      "#spanMensajeError"
    );

    if (await mensajeSunat.count()) {
      mensaje = (
        await mensajeSunat.textContent()
      )?.trim();
    }

    if (!mensaje) {
      const divFails = paginaSol.locator("#divFails");

      if (await divFails.count()) {
        mensaje = (
          await divFails.textContent()
        )?.trim();
      }
    }

    throw new Error(
      mensaje
        ? `SUNAT rechazó el acceso: ${mensaje}`
        : "SUNAT no confirmó el inicio de sesión"
    );
  }

  console.log("Sesión SUNAT iniciada.");
  return paginaSol;
}

async function navegarConReintentos(page, url, opciones, intentos = 3) {
  let ultimoError;

  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await page.goto(url, opciones);
    } catch (error) {
      ultimoError = error;
      const esErrorRed = /ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ERR_TIMED_OUT/
        .test(error.message);

      if (!esErrorRed || intento === intentos) {
        throw error;
      }

      console.warn(
        `SUNAT reinició la conexión. Reintento ${intento + 1}/${intentos}...`
      );
      await page.waitForTimeout(intento * 2_000);
    }
  }

  throw ultimoError;
}

async function abrirModuloDetracciones(page) {
  console.log("Buscando el módulo de detracciones...");

  await page.locator("#nivel1_55").waitFor({
    state: "visible",
    timeout: 90_000
  });

  const consultas = page.locator("#nivel2_55_2");

  if (!(await consultas.isVisible())) {
    await page.locator("#nivel1_55").click();
    await consultas.waitFor({ state: "visible" });
  }

  const consultasPresentacionPago = page.locator("#nivel3_55_2_1");

  if (!(await consultasPresentacionPago.isVisible())) {
    await consultas.click();
    await consultasPresentacionPago.waitFor({ state: "visible" });
  }

  const consultaDetracciones = page.locator("#nivel4_55_2_1_1_4");

  if (!(await consultaDetracciones.isVisible())) {
    await consultasPresentacionPago.click();
    await consultaDetracciones.waitFor({ state: "visible" });
  }

  await consultaDetracciones.click();

  await buscarLocatorEnFrames(
    page,
    "#fechaInicio",
    90_000
  );

  console.log("Formulario de detracciones encontrado.");

  return page;
}

async function consultarFormulario(page) {
  const fecha = fechaActualPeru();

  console.log(
    `Consultando detracciones del ${fecha}...`
  );

  const resultadoFormulario =
    await buscarLocatorEnFrames(
      page,
      "#fechaInicio"
    );

  const frame = resultadoFormulario.frame;

  await frame.locator("#fechaInicio").fill(fecha);
  await frame.locator("#fechaFin").fill(fecha);

  await frame
    .locator("#tipoCuenta")
    .selectOption("1");

  await frame
    .locator("#tipoConsulta")
    .selectOption("pagosIndividuales");

  await frame.locator("#periodo").fill("");

  /*
   * No copiamos IdCache manualmente.
   * La página oficial lo incluye y capturamos su respuesta.
   */
  const respuestaPromise = page.waitForResponse(
    response =>
      response.url().includes(ENDPOINT_DETRACCIONES) &&
      response.request().method() === "GET",
    {
      timeout: 120_000
    }
  );

  await frame.locator("#btnConsultar").click();

  const respuesta = await respuestaPromise;

  if (!respuesta.ok()) {
    const contenido = await respuesta.text();

    throw new Error(
      `SUNAT respondió HTTP ${respuesta.status()}: ` +
      contenido.slice(0, 1_000)
    );
  }

  const json = await respuesta.json();

  if (json.cod !== 200) {
    throw new Error(
      `SUNAT devolvió cod=${json.cod}: ` +
      (json.msg || "Error no especificado")
    );
  }

  if (!Array.isArray(json.resultado)) {
    json.resultado = [];
  }

  console.log(
    `SUNAT devolvió ${json.resultado.length} registro(s).`
  );

  return json;
}

export async function consultarDetraccionesHoy() {
  const navegador = await obtenerBrowser();

  const context = await navegador.newContext({
    locale: "es-PE",
    timezoneId: "America/Lima",
    viewport: {
      width: 1440,
      height: 900
    }
  });

  let page;

  try {
    page = await context.newPage();

    page.setDefaultTimeout(60_000);

    page = await iniciarSesion(page);

    const paginaModulo =
      await abrirModuloDetracciones(page);

    return await consultarFormulario(
      paginaModulo
    );
  } catch (error) {
    if (page) {
      const marcaTiempo = Date.now();

      await Promise.all(
        context.pages().map((pagina, indice) =>
          pagina.screenshot({
            path: `error-sunat-${marcaTiempo}-pagina-${indice + 1}.png`,
            fullPage: true
          }).catch(() => undefined)
        )
      );
    }

    throw error;
  } finally {
    /*
     * Cerrar el contexto elimina cookies, IdCache
     * y cualquier información de la sesión SOL.
     */
    await context.close();
  }
}

export async function cerrarBrowser() {
  if (browser?.isConnected()) {
    await browser.close();
  }
}

function extraerIdCache(valor) {
  if (!valor || typeof valor !== "object") {
    return null;
  }

  for (const [clave, contenido] of Object.entries(valor)) {
    if (clave.toLowerCase() === "idcache" && contenido) {
      return String(contenido);
    }

    const encontrado = extraerIdCache(contenido);

    if (encontrado) {
      return encontrado;
    }
  }

  return null;
}

export async function obtenerIdCacheSunat() {
  const navegador = await obtenerBrowser();
  const context = await navegador.newContext({
    locale: "es-PE",
    timezoneId: "America/Lima",
    viewport: {
      width: 1440,
      height: 900
    }
  });

  let resolverRespuestaRecurso;
  const respuestaRecursoPromise = new Promise(resolve => {
    resolverRespuestaRecurso = resolve;
  });

  const registrarRespuestaRecurso = respuesta => {
    if (
      respuesta.url().split("?")[0] === ENDPOINT_RECURSO_SESION &&
      respuesta.request().method() === "GET"
    ) {
      resolverRespuestaRecurso(respuesta);
    }
  };

  const registrarPeticionGestor = peticion => {
    if (!peticion.url().includes("/v1/gestor-sesiones/")) {
      return;
    }

    const url = new URL(peticion.url());
    console.log(
      `SUNAT request: ${peticion.method()} ${url.origin}${url.pathname}`
    );
  };

  context.on("response", registrarRespuestaRecurso);
  context.on("request", registrarPeticionGestor);

  try {
    const paginaLogin = await context.newPage();
    paginaLogin.setDefaultTimeout(60_000);

    // El acceso oficial crea esta página con window.open(..., "NewWindow").
    // Parte del flujo legado de SUNAT consulta el nombre de la ventana.
    await paginaLogin.evaluate(() => {
      window.name = "NewWindow";
    });

    console.log("Obteniendo una URL de login vigente desde gob.pe...");
    await paginaLogin.goto(
      process.env.SUNAT_TRAMITE_URL || SUNAT_TRAMITE_URL,
      {
        waitUntil: "domcontentloaded",
        timeout: 120_000
      }
    );

    const iniciarTramite = paginaLogin
      .getByRole("link", { name: /iniciar trámite/i })
      .first();

    await iniciarTramite.waitFor({ state: "visible" });

    const hrefLogin = await iniciarTramite.getAttribute("href");

    if (!hrefLogin) {
      throw new Error("El enlace Iniciar trámite no contiene una URL");
    }

    const urlLoginVigente = new URL(hrefLogin, paginaLogin.url()).toString();

    console.log("Abriendo el login SUNAT para obtener idCache...");
    const respuestaLogin = await navegarConReintentos(
      paginaLogin,
      urlLoginVigente,
      {
        waitUntil: "domcontentloaded",
        timeout: 120_000
      },
      3
    );

    try {
      await paginaLogin.locator("#txtRuc").waitFor({
        state: "visible",
        timeout: 60_000
      });
    } catch (error) {
      const urlFinal = new URL(paginaLogin.url());
      const titulo = await paginaLogin.title().catch(() => "");
      const texto = await paginaLogin
        .locator("body")
        .innerText()
        .catch(() => "");

      throw new Error(
        "SUNAT no mostró el formulario de acceso. " +
        `HTTP inicial=${respuestaLogin?.status() ?? "desconocido"}; ` +
        `página final=${urlFinal.origin}${urlFinal.pathname}; ` +
        `título=${titulo || "(vacío)"}; ` +
        `contenido=${texto.trim().slice(0, 200) || "(vacío)"}`,
        { cause: error }
      );
    }

    await paginaLogin.locator("#btnPorRuc").click();
    await paginaLogin.locator("#txtRuc").fill(process.env.SUNAT_RUC);
    await paginaLogin
      .locator("#txtUsuario")
      .fill(process.env.SUNAT_USUARIO_SOL.toUpperCase());
    await paginaLogin
      .locator("#txtContrasena")
      .fill(process.env.SUNAT_CLAVE_SOL);

    await paginaLogin.locator("#btnAceptar").click();

    let timeoutRecurso;
    const respuestaRecurso = await Promise.race([
      respuestaRecursoPromise,
      new Promise((_, reject) => {
        timeoutRecurso = setTimeout(
          () => reject(new Error(
            "SUNAT no respondió GET /v1/gestor-sesiones/recurso en 120 segundos"
          )),
          120_000
        );
      })
    ]).finally(() => clearTimeout(timeoutRecurso));
    const textoRespuesta = await respuestaRecurso.text();

    if (!respuestaRecurso.ok()) {
      throw new Error(
        `SUNAT respondió HTTP ${respuestaRecurso.status()} al obtener el recurso: ` +
        textoRespuesta.slice(0, 1_000)
      );
    }

    let contenido;

    try {
      contenido = JSON.parse(textoRespuesta);
    } catch {
      contenido = textoRespuesta.trim();
    }

    const idCache = typeof contenido === "string"
      ? contenido
      : extraerIdCache(contenido);

    if (!idCache) {
      throw new Error(
        "La respuesta de gestor-sesiones/recurso no contiene idCache"
      );
    }

    console.log("idCache obtenido correctamente.");

    return { idCache };
  } catch (error) {
    const marcaTiempo = Date.now();

    await Promise.all(
      context.pages().map((pagina, indice) =>
        pagina.screenshot({
          path: `error-id-cache-${marcaTiempo}-pagina-${indice + 1}.png`,
          fullPage: true
        }).catch(() => undefined)
      )
    );

    throw error;
  } finally {
    context.off("response", registrarRespuestaRecurso);
    context.off("request", registrarPeticionGestor);
    await context.close();
  }
}
