export function createSunatController({ authService, syncService }) {
  return {
    getIdCache: async (req, res, next) => {
      try {
        const idCache = await authService.getIdCache();
        res.status(200).json({ idCache });
      } catch (error) { next(error); }
    },
    syncToday: async (req, res, next) => {
      try {
        const result = req.body?.date
          ? await syncService.syncDate(req.body.date, "manual")
          : await syncService.syncToday("manual");
        res.status(200).json(result);
      } catch (error) { next(error); }
    }
  };
}
