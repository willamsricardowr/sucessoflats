// Calendar inline com seleção de check-in/check-out e bloqueio por ranges "busy".
export function mountCalendar(el, { busyRanges = [], onChange }) {
  const state = { view: new Date(), checkin: null, checkout: null };

  const fmt   = (d) => d.toISOString().slice(0,10);
  const parse = (s) => { const [y,m,dd]=s.split('-').map(Number); return new Date(y, m-1, dd); };
  const addDays = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const sameDay = (a,b)=> a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  const isPast = (d)=>{ const t=new Date(); t.setHours(0,0,0,0); return d < t; };

  // Expande ranges ocupados para lookup rápido
  const busy = new Set();
  for (const r of busyRanges) {
    let cur = parse(r.start), end = parse(r.end);
    while (cur <= end) { busy.add(fmt(cur)); cur = addDays(cur, 1); }
  }
  const isBusy = (d)=> busy.has(fmt(d));
  const inSelectedRange = (d)=> state.checkin && state.checkout && d > state.checkin && d < state.checkout;

  function header() {
    const month = state.view.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    return `
      <header>
        <button class="btn-secondary" data-nav="-1" aria-label="Mês anterior">‹</button>
        <strong style="text-transform:capitalize">${month}</strong>
        <button class="btn-secondary" data-nav="+1" aria-label="Próximo mês">›</button>
      </header>
    `;
  }

  function grid() {
    const first = new Date(state.view.getFullYear(), state.view.getMonth(), 1);
    const startWeek = first.getDay(); // 0-dom
    const daysInMonth = new Date(state.view.getFullYear(), state.view.getMonth()+1, 0).getDate();

    let html = `<div class="grid">`;
    const dows = ['D','S','T','Q','Q','S','S'];
    for (const d of dows) html += `<div class="dow">${d}</div>`;
    for (let i=0;i<startWeek;i++) html += `<div></div>`; // leading blanks

    for (let day=1; day<=daysInMonth; day++) {
      const d = new Date(state.view.getFullYear(), state.view.getMonth(), day);
      const classes = ['day'];
      if (sameDay(d, new Date())) classes.push('today');
      if (isPast(d) || isBusy(d)) classes.push('disabled');
      if (inSelectedRange(d)) classes.push('in-range');
      if (sameDay(d, state.checkin) || sameDay(d, state.checkout)) classes.push('selected');

      html += `<button class="${classes.join(' ')}" data-day="${day}" ${classes.includes('disabled') ? 'disabled' : ''}>${day}</button>`;
    }
    html += `</div>`;
    html += `
      <div class="legend">
        <span><i class="swatch busy"></i> Ocupado / Indisponível</span>
        <span><i class="swatch select"></i> Selecionado</span>
        <span><i class="swatch range"></i> Intervalo</span>
      </div>
    `;
    return html;
  }

  function render() {
    el.innerHTML = `<div class="calendar">${header()}${grid()}</div>`;

    el.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.nav);
        state.view.setMonth(state.view.getMonth() + delta);
        render();
      });
    });

    el.querySelectorAll('.day').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = Number(btn.dataset.day);
        const d = new Date(state.view.getFullYear(), state.view.getMonth(), day);

        if (!state.checkin || (state.checkin && state.checkout)) {
          state.checkin = d; state.checkout = null;
        } else if (d > state.checkin) {
          state.checkout = d;
        } else {
          state.checkin = d; state.checkout = null;
        }

        render();
        onChange?.({
          checkin: state.checkin ? fmt(state.checkin) : null,
          checkout: state.checkout ? fmt(state.checkout) : null,
        });
      });
    });
  }

  render();
  return {
    get value() {
      return {
        checkin: state.checkin ? fmt(state.checkin) : null,
        checkout: state.checkout ? fmt(state.checkout) : null,
      };
    }
  };
}
