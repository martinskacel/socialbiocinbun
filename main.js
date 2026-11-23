/* =============================================================================
   The Social Biography of a Pastry at the Fern
   main.js — plain JavaScript, no libraries, nothing to install.
   -----------------------------------------------------------------------------
   CONTENTS
    1. Helpers
    2. Missing-media placeholders (shows the exact filename to add)
    3. Video: silent, plays when on screen
    4. Route navigation (active chapter, traveling bun, phone menu, colors)
    5. Scrollytelling steps (dough diagram and delivery map)
    6. Delivery map: the van follows the route as you read
    7. Citation popover fallback for older browsers
    8. Scroll loop
   The site still reads top to bottom if JavaScript fails; these are extras.
   ========================================================================== */

(() => {
  'use strict';

  /* ---------------------------------------------------------------------------
     1. HELPERS
     ------------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isDesktop = window.matchMedia('(min-width: 1180px)');


  /* ---------------------------------------------------------------------------
     2. MISSING-MEDIA PLACEHOLDERS
     If a photo or video file isn't in the folder yet, this draws a dashed box
     that tells you exactly which file to add. Figures marked data-optional
     simply disappear instead.
     ------------------------------------------------------------------------ */
  function showPlaceholder(frame, kind, path, note) {
    if (!frame || frame.classList.contains('is-missing')) return;

    const figure = frame.closest('figure');
    if (figure && figure.hasAttribute('data-optional')) {
      figure.hidden = true;
      return;
    }

    frame.classList.add('is-missing');
    const box = document.createElement('div');
    box.className = 'media__placeholder';

    const title = document.createElement('strong');
    title.textContent = kind === 'video' ? 'Add video' : 'Add photo';
    const file = document.createElement('code');
    file.textContent = path;
    box.append(title, file);

    if (note) {
      const description = document.createElement('span');
      description.textContent = note;
      box.append(description);
    }
    frame.append(box);
  }

  $$('.media__frame img').forEach((img) => {
    const fail = () => showPlaceholder(img.parentElement, 'photo', img.getAttribute('src'), img.getAttribute('alt'));
    img.addEventListener('error', fail);
    // The error may have fired before this script ran
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail();
  });


  /* ---------------------------------------------------------------------------
     3. VIDEO
     The bakery video is silent: it is always kept muted, even if a visitor
     tries to unmute it. If the file is missing, a placeholder names it.
     Videos with data-autoplay-in-view play while on screen, unless the
     visitor prefers reduced motion. Controls are always available.
     ------------------------------------------------------------------------ */
  $$('.media__frame video').forEach((video) => {
    const frame = video.parentElement;
    const sources = $$('source', video);
    const lastSource = sources[sources.length - 1];
    const path = (sources[0] && sources[0].getAttribute('src')) || video.getAttribute('src') || '';

    const fallback = () => showPlaceholder(frame, 'video', path, video.getAttribute('aria-label'));
    if (lastSource) lastSource.addEventListener('error', fallback);
    video.addEventListener('error', fallback);
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) fallback();

    // Keep it silent
    video.muted = true;
    video.addEventListener('volumechange', () => { if (!video.muted) video.muted = true; });

    // Play while visible; pause when scrolled away (but respect a visitor's own pause)
    if ('autoplayInView' in video.dataset && 'IntersectionObserver' in window) {
      let pausedByScroll = false;
      let started = false;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (reduceMotion.matches) return;
          if (entry.isIntersecting) {
            if (!started || pausedByScroll) {
              started = true;
              pausedByScroll = false;
              video.play().catch(() => {});
            }
          } else if (!video.paused) {
            video.pause();
            pausedByScroll = true;
          }
        });
      }, { threshold: 0.4 });
      observer.observe(video);
    }
  });


  /* ---------------------------------------------------------------------------
     4. ROUTE NAVIGATION
     ------------------------------------------------------------------------ */
  const route = $('#route');
  const hero = $('.hero');
  const stops = route ? $$('.route__stop', route) : [];
  const chapters = stops.map((link) => document.getElementById(link.hash.slice(1)));
  const themedSections = $$('.hero, main [data-theme], .site-footer');
  const toggle = route ? $('.route__toggle', route) : null;
  const currentLabel = route ? $('.route__current', route) : null;
  const bun = route ? $('.route__bun', route) : null;
  let dotCenters = [];

  function measureDots() {
    if (!route) return;
    dotCenters = stops.map((link) => {
      const dot = $('.route__dot', link);
      // offsetTop is relative to .route__track (position: relative on desktop)
      let top = 0;
      let node = dot;
      while (node && node !== route.querySelector('.route__track')) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top + dot.offsetHeight / 2;
    });
  }

  function setMenu(open) {
    if (!route || !toggle) return;
    route.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  if (toggle) {
    toggle.addEventListener('click', () => setMenu(!route.classList.contains('is-open')));
    stops.forEach((link) => link.addEventListener('click', () => setMenu(false)));
    $$('.route__appendix a', route).forEach((link) => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && route.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  function updateRoute() {
    if (!route) return;
    const vh = window.innerHeight;

    // Show the route once the hero has mostly scrolled away
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    route.classList.toggle('is-visible', heroBottom < vh * 0.35);

    // Match the route's colors to whatever section is underneath it
    const probe = isDesktop.matches ? vh * 0.5 : 24;
    const under = themedSections.find((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= probe && r.bottom > probe;
    });
    if (under && under.dataset.theme && route.dataset.theme !== under.dataset.theme) {
      route.dataset.theme = under.dataset.theme;
    }

    // Which chapter is active, and how far through it are we?
    const mid = vh * 0.5;
    let active = -1;
    let progress = 0;
    chapters.forEach((chapter, i) => {
      if (!chapter) return;
      const r = chapter.getBoundingClientRect();
      if (r.top <= mid) {
        active = i;
        progress = clamp((mid - r.top) / r.height);
      }
    });

    stops.forEach((link, i) => {
      if (i === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });

    if (currentLabel) {
      if (active >= 0) {
        const title = $('.route__title', stops[active]).textContent.replace(/^\d+/, '').trim();
        currentLabel.textContent = `Chapter ${active + 1}: ${title}`;
      } else {
        currentLabel.textContent = 'Contents';
      }
    }

    // Phone: thin progress bar across the top
    const scrollable = document.documentElement.scrollHeight - vh;
    route.style.setProperty('--progress', scrollable > 0 ? (window.scrollY / scrollable).toFixed(4) : 0);

    // Desktop: move the bun from this chapter's dot toward the next one
    if (bun && dotCenters.length && isDesktop.matches) {
      const bunHalf = bun.getBoundingClientRect().height / 2 || 12;
      let y;
      if (active < 0) {
        y = dotCenters[0];
      } else if (active >= dotCenters.length - 1) {
        y = dotCenters[dotCenters.length - 1];
      } else {
        y = lerp(dotCenters[active], dotCenters[active + 1], progress);
      }
      route.style.setProperty('--bun-y', `${(y - bunHalf).toFixed(1)}px`);
      route.classList.add('has-position');
    }
  }


  /* ---------------------------------------------------------------------------
     5. SCROLLYTELLING STEPS
     Each [data-scrolly] section has a sticky graphic and a column of
     .scrolly__step elements. The step crossing the middle of the screen
     becomes active, and its number is copied to [data-step-target].
     ------------------------------------------------------------------------ */
  $$('[data-scrolly]').forEach((section) => {
    const steps = $$('.scrolly__step', section);
    const target = $('[data-step-target]', section);
    if (!steps.length) return;

    const activate = (step) => {
      steps.forEach((s) => s.classList.toggle('is-active', s === step));
      if (target) target.setAttribute('data-step', step.dataset.step);
    };

    activate(steps[0]);

    if (!('IntersectionObserver' in window)) {
      activate(steps[steps.length - 1]);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activate(entry.target);
      });
    }, { rootMargin: '-48% 0px -48% 0px' });

    steps.forEach((step) => observer.observe(step));
  });


  /* ---------------------------------------------------------------------------
     6. DELIVERY MAP
     Each map step has data-progress (0 = at the bakery, 1 = at the Fern).
     Between steps, the van glides smoothly according to scroll position.
     ------------------------------------------------------------------------ */
  const map = $('[data-route-map]');
  let updateMap = () => {};

  if (map) {
    const measurePath = $('#van-route', map);
    const drawnPath = $('.map-route-drawn', map);
    const van = $('.map-van', map);
    const mapSteps = $$('.scrolly__step', map.closest('[data-scrolly]'));
    const totalLength = measurePath.getTotalLength();

    const renderMap = (p) => {
      drawnPath.style.strokeDashoffset = String(1 - p);
      const point = measurePath.getPointAtLength(totalLength * p);
      van.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    };

    updateMap = () => {
      const mid = window.innerHeight * 0.5;
      const centers = mapSteps.map((s) => {
        const r = s.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      const values = mapSteps.map((s) => parseFloat(s.dataset.progress) || 0);

      let p = values[0];
      if (mid >= centers[centers.length - 1]) {
        p = values[values.length - 1];
      } else {
        for (let i = 0; i < centers.length - 1; i += 1) {
          if (mid >= centers[i] && mid < centers[i + 1]) {
            const t = (mid - centers[i]) / (centers[i + 1] - centers[i]);
            p = lerp(values[i], values[i + 1], t);
            break;
          }
        }
      }
      renderMap(clamp(p));
    };
  }


  /* ---------------------------------------------------------------------------
     7. CITATION POPOVER FALLBACK
     Modern browsers open citation popovers with no JavaScript at all.
     Older browsers instead jump to the matching reference and highlight it.
     ------------------------------------------------------------------------ */
  const supportsPopover = Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
  if (!supportsPopover) {
    $$('.cite[popovertarget]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('popovertarget');
        const reference = document.querySelector(`[data-ref="${id}"]`);
        if (!reference) return;
        reference.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
        reference.classList.add('is-flash');
        window.setTimeout(() => reference.classList.remove('is-flash'), 1800);
      });
    });
  }

/* ---------------------------------------------------------------------------
     INTERVIEW EXCERPTS: each turn eases in as it scrolls into view.
     Paste directly ABOVE the comment block that says "8. SCROLL LOOP".
     (Skipped for visitors who prefer reduced motion; the text is then simply
     there from the start.)
     ------------------------------------------------------------------------ */
  const dialogues = $$('.interview-dialogue');
  if (dialogues.length && 'IntersectionObserver' in window && !reduceMotion.matches) {
    const turnObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        turnObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    dialogues.forEach((box) => {
      box.classList.add('is-armed');
      $$('.interview-dialogue__turn', box).forEach((turn) => turnObserver.observe(turn));
    });
  }

  /* ---------------------------------------------------------------------------
     8. SCROLL LOOP
     One requestAnimationFrame per scroll keeps everything smooth.
     ------------------------------------------------------------------------ */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateRoute();
      updateMap();
      ticking = false;
    });
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      measureDots();
      if (isDesktop.matches) setMenu(false);
      onScroll();
    }, 120);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', () => { measureDots(); onScroll(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measureDots(); onScroll(); });
  }

  measureDots();
  onScroll();
})();
