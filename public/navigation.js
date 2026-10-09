(() => {
  const links = [...document.querySelectorAll('[data-scroll]')];
  const sections = ['guard','arena','vaccine','how'].map((id) => document.getElementById(id)).filter(Boolean);
  const topbar = document.querySelector('.topbar');
  const backTop = document.getElementById('backTop');

  function setActive(id) {
    links.forEach((link) => {
      const active = link.dataset.scroll === id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function go(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const offset = (topbar?.offsetHeight || 76) + 8;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setActive(id);
  }

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.dataset.scroll;
      if (!document.getElementById(id)) return;
      event.preventDefault();
      history.replaceState(null, '', `#${id}`);
      go(id);
    });
  });

  // Preserve native hash navigation if JS starts late, but immediately synchronize active state.
  const initial = location.hash?.slice(1);
  if (sections.some((section) => section.id === initial)) {
    queueMicrotask(() => setActive(initial));
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-22% 0px -62% 0px', threshold: [0.05,0.25,0.5] });
    sections.forEach((section) => observer.observe(section));
  }

  function updateBackTop() {
    backTop?.classList.toggle('show', window.scrollY > 520);
  }
  window.addEventListener('scroll', updateBackTop, { passive: true });
  updateBackTop();
  backTop?.addEventListener('click', () => {
    history.replaceState(null, '', '#guard');
    go('guard');
  });

  // Resilient tab switching for threat input modes (Message/URL vs Screenshot)
  const inputTabs = [...document.querySelectorAll('.input-tab')];
  inputTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      inputTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      const mode = tab.dataset.mode;
      const textWrap = document.getElementById('textInputArea');
      const imageWrap = document.getElementById('imageInputArea');
      if (textWrap) textWrap.classList.toggle('hidden', mode !== 'text');
      if (imageWrap) imageWrap.classList.toggle('hidden', mode !== 'image');
    });
  });

  // Add a visual “ready” marker for the shell without blocking interaction.
  requestAnimationFrame(() => document.documentElement.classList.add('nav-enhanced'));
})();
