# Seguridad

El servicio maneja credenciales SOL, credenciales Oracle, cookies de sesión e `idCache`. Todos deben tratarse como secretos.

## Reglas operativas

- Nunca confirme `.env`, capturas de pantalla ni logs con secretos.
- Use una `API_KEY` larga y aleatoria.
- Exponga la API detrás de HTTPS y limite acceso por red.
- Use un usuario Oracle dedicado con los permisos mínimos.
- No registre `SUNAT_CLAVE_SOL`, `ORACLE_PASSWORD`, cookies ni `idCache`.
- Restrinja el acceso a `POST /api/sunat/id-cache`; su respuesta contiene un token temporal.
- Rote inmediatamente cualquier credencial que haya sido publicada en consola, chat, commit o captura.
- Proteja los archivos `error-id-cache-*.png`: pueden mostrar datos de la cuenta.

## Archivos ignorados

`.gitignore` excluye `.env`, capturas de error, logs, resultados y reportes de Playwright. Antes de un commit compruebe:

```powershell
git status --short
git check-ignore .env
```

El repositorio sólo debe contener `.env.ejemplo` con valores ficticios.

