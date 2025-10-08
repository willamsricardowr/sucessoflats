// api/_lib/ics.js
function pad(n){ return String(n).padStart(2,'0'); }
function toUTC(dtLocalISO) {
  const d = new Date(dtLocalISO);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function buildICS({
  summary,
  description,
  location = 'Sucesso Flat’s — Teresina/PI',
  startISO, // ex: 2025-10-08T14:00:00-03:00
  endISO,   // ex: 2025-10-10T12:00:00-03:00
  uid
}) {
  const dtStart = toUTC(startISO);
  const dtEnd   = toUTC(endISO);
  const dtStamp = toUTC(new Date().toISOString());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sucesso Flats//Booking//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}
