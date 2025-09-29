(function () {
  const els = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('active'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      } else {
        entry.target.classList.remove('active');
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => io.observe(el));
})();
