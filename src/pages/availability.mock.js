// Intervalos ocupados por slug (YYYY-MM-DD)
// No Passo 8–10 trocamos por /api/availability consultando Google Calendar / reservas.
export function getBusyRangesBySlug(slug) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');

  const mocks = {
    'flat-1': [
      { start: `${yyyy}-${mm}-10`, end: `${yyyy}-${mm}-12` },
      { start: `${yyyy}-${mm}-22`, end: `${yyyy}-${mm}-24` },
    ],
    'flat-2': [{ start: `${yyyy}-${mm}-05`, end: `${yyyy}-${mm}-07` }],
    'flat-3': [{ start: `${yyyy}-${mm}-15`, end: `${yyyy}-${mm}-18` }],
    'flat-4': [],
  };
  return mocks[slug] || [];
}
