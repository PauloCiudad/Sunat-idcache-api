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
        const result = await syncService.syncToday("manual", req.body?.date);
        res.status(200).json(result);
      } catch (error) { next(error); }
    },
    syncRange: async (req, res, next) => {
      try {
        const result = await syncService.syncRange(
          req.body?.startDate,
          req.body?.endDate,
          "manual_range"
        );
        res.status(200).json(result);
      } catch (error) { next(error); }
    }
  };
}
