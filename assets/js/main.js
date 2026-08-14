/* ==========================================================================
   EQUUS Research & Therapy — interactie & scroll-effecten
   Uitgangspunten: directe respons, onderbreekbare beweging, respect voor
   prefers-reduced-motion. Alleen compositor-vriendelijke properties
   (transform / opacity) worden geanimeerd.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ----------------------------------------------------------------------
     Gedeelde rAF-lus: alle scrollafhankelijke effecten in één frame.
     ---------------------------------------------------------------------- */
  var frameTasks = [];
  var ticking = false;

  function onFrame(fn) { frameTasks.push(fn); }

  function requestFrame() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY || window.pageYOffset;
      for (var i = 0; i < frameTasks.length; i++) frameTasks[i](y);
      ticking = false;
    });
  }

  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame, { passive: true });

  /* ----------------------------------------------------------------------
     1. Header — scroll-edge effect
     ---------------------------------------------------------------------- */
  var header = $('.site-header');
  if (header) {
    onFrame(function (y) {
      header.classList.toggle('is-scrolled', y > 12);
    });
  }

  /* ----------------------------------------------------------------------
     2. Scroll-voortgangsbalk
     ---------------------------------------------------------------------- */
  var progress = $('.progress');
  if (progress) {
    onFrame(function (y) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progress.style.transform = 'scaleX(' + p + ')';
    });
  }

  /* ----------------------------------------------------------------------
     3. Terug-naar-boven
     ---------------------------------------------------------------------- */
  var toTop = $('.to-top');
  if (toTop) {
    onFrame(function (y) {
      toTop.classList.toggle('is-visible', y > window.innerHeight * 0.9);
    });
    toTop.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion.matches ? 'auto' : 'smooth'
      });
    });
  }

  /* ----------------------------------------------------------------------
     4. Onthulling bij scroll (IntersectionObserver)
     ---------------------------------------------------------------------- */
  var revealables = $$('[data-reveal], [data-wipe], .reveal-lines');

  if (!('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        if (delay && !reduceMotion.matches) {
          el.style.transitionDelay = delay + 'ms';
        }
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* Automatische stagger binnen een groep */
  $$('[data-stagger]').forEach(function (group) {
    var stepMs = parseInt(group.getAttribute('data-stagger') || '90', 10);
    $$('[data-reveal]', group).forEach(function (el, i) {
      if (!el.hasAttribute('data-delay')) el.setAttribute('data-delay', String(i * stepMs));
    });
  });

  /* ----------------------------------------------------------------------
     5. Parallax — subtiel, alleen transform
     ---------------------------------------------------------------------- */
  var parallaxEls = $$('[data-parallax]');
  if (parallaxEls.length && !reduceMotion.matches) {
    onFrame(function () {
      var vh = window.innerHeight;
      parallaxEls.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -vh || rect.top > vh * 2) return;
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.12;
        var offset = (rect.top + rect.height / 2 - vh / 2) * -speed;
        el.style.transform = 'translate3d(0,' + offset.toFixed(2) + 'px,0)';
      });
    });
  }

  /* ----------------------------------------------------------------------
     6. Ticker — horizontale verschuiving gestuurd door scrollpositie
     ---------------------------------------------------------------------- */
  var tickers = $$('.ticker');
  if (tickers.length && !reduceMotion.matches) {
    onFrame(function () {
      var vh = window.innerHeight;
      tickers.forEach(function (t) {
        var track = $('.ticker__track', t);
        if (!track) return;
        var rect = t.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        /* 0 → 1 terwijl de strook door beeld beweegt */
        var p = 1 - (rect.top + rect.height) / (vh + rect.height);
        var travel = Math.max(0, track.scrollWidth / 2);
        track.style.transform = 'translate3d(' + (-p * travel * 0.6).toFixed(2) + 'px,0,0)';
      });
    });
  }

  /* ----------------------------------------------------------------------
     7. Mobiele navigatie — komt van rechts, vertrekt naar rechts
     ---------------------------------------------------------------------- */
  var burger = $('.burger');
  var mobileNav = $('.mobile-nav');
  var scrim = $('.scrim');

  function setNav(open) {
    if (!burger || !mobileNav) return;
    burger.setAttribute('aria-expanded', String(open));
    mobileNav.classList.toggle('is-open', open);
    if (scrim) scrim.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
    if (open) {
      var first = $('a, button', mobileNav);
      if (first) first.focus({ preventScroll: true });
    }
  }

  if (burger && mobileNav) {
    burger.addEventListener('click', function () {
      setNav(burger.getAttribute('aria-expanded') !== 'true');
    });
    if (scrim) scrim.addEventListener('click', function () { setNav(false); });
    $$('a', mobileNav).forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        burger.focus();
      }
    });
  }

  /* ----------------------------------------------------------------------
     8. Accordeon — hoogte-animatie vanaf de gemeten waarde
     ---------------------------------------------------------------------- */
  $$('.accordion').forEach(function (acc) {
    var single = acc.hasAttribute('data-single');
    var buttons = $$('.accordion__btn', acc);

    buttons.forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;

      btn.addEventListener('click', function () {
        var isOpen = btn.getAttribute('aria-expanded') === 'true';

        if (single && !isOpen) {
          buttons.forEach(function (other) {
            if (other === btn) return;
            var op = document.getElementById(other.getAttribute('aria-controls'));
            if (op && other.getAttribute('aria-expanded') === 'true') {
              other.setAttribute('aria-expanded', 'false');
              op.style.height = op.scrollHeight + 'px';
              void op.offsetHeight;
              op.style.height = '0px';
            }
          });
        }

        btn.setAttribute('aria-expanded', String(!isOpen));
        if (isOpen) {
          panel.style.height = panel.scrollHeight + 'px';
          void panel.offsetHeight;
          panel.style.height = '0px';
        } else {
          panel.style.height = panel.scrollHeight + 'px';
        }
      });

      panel.addEventListener('transitionend', function (e) {
        if (e.propertyName !== 'height') return;
        if (btn.getAttribute('aria-expanded') === 'true') panel.style.height = 'auto';
      });
    });
  });

  /* ----------------------------------------------------------------------
     9. Scrollspy (Diensten)
     ---------------------------------------------------------------------- */
  var spyLinks = $$('.spy__link');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    var targets = spyLinks
      .map(function (l) { return document.querySelector(l.getAttribute('href')); })
      .filter(Boolean);

    var spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        spyLinks.forEach(function (l) {
          l.classList.toggle('is-active', l.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });

    targets.forEach(function (t) { spyObserver.observe(t); });
  }

  /* ----------------------------------------------------------------------
     10. Contactformulier
     Geen backend: bij een geldige invoer wordt een vooringevuld e-mailbericht
     geopend. Vervang dit door een POST naar een eigen endpoint zodra dat er is.
     ---------------------------------------------------------------------- */
  var form = $('#contact-form');
  if (form) {
    var status = $('#form-status', form.parentNode) || $('#form-status');

    var setError = function (field, message) {
      var wrap = field.closest('.field');
      if (!wrap) return;
      wrap.classList.toggle('has-error', Boolean(message));
      var slot = $('.field__error', wrap);
      if (slot) slot.textContent = message || '';
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
    };

    /* Validatie tijdens het invullen, niet pas bij verzenden */
    $$('input, textarea, select', form).forEach(function (field) {
      field.addEventListener('blur', function () {
        if (field.value.trim() || field.required) validate(field);
      });
      field.addEventListener('input', function () {
        var wrap = field.closest('.field');
        if (wrap && wrap.classList.contains('has-error')) validate(field);
      });
    });

    function validate(field) {
      var value = field.value.trim();
      if (field.required && !value) {
        setError(field, 'Dit veld is verplicht.');
        return false;
      }
      if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        setError(field, 'Vul een geldig e-mailadres in.');
        return false;
      }
      if (field.type === 'checkbox' && field.required && !field.checked) {
        setError(field, 'Ga akkoord om te versturen.');
        return false;
      }
      setError(field, '');
      return true;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var fields = $$('input, textarea, select', form);
      var valid = true;
      var firstBad = null;

      fields.forEach(function (field) {
        if (field.type === 'checkbox' && field.required && !field.checked) {
          setError(field, 'Ga akkoord om te versturen.');
          valid = false;
          if (!firstBad) firstBad = field;
          return;
        }
        if (!validate(field)) {
          valid = false;
          if (!firstBad) firstBad = field;
        }
      });

      if (!valid) {
        if (firstBad) firstBad.focus();
        return;
      }

      var get = function (name) {
        var el = form.elements[name];
        return el ? String(el.value).trim() : '';
      };

      var lines = [
        'Naam: ' + get('naam'),
        'E-mail: ' + get('email'),
        'Telefoon: ' + (get('telefoon') || '—'),
        'Onderwerp: ' + get('onderwerp'),
        '',
        get('bericht')
      ].join('\n');

      var mailto = 'mailto:machteld@equusresearch.nl'
        + '?subject=' + encodeURIComponent('Aanvraag via website — ' + get('onderwerp'))
        + '&body=' + encodeURIComponent(lines);

      window.location.href = mailto;

      if (status) {
        status.textContent = 'Je e-mailprogramma is geopend met een vooringevuld bericht. '
          + 'Verstuur het om je aanvraag af te ronden.';
        status.classList.add('is-visible');
      }
    });
  }

  /* ----------------------------------------------------------------------
     11. Actieve navigatie markeren
     ---------------------------------------------------------------------- */
  var here = location.pathname.split('/').pop() || 'index.html';
  $$('[data-nav]').forEach(function (link) {
    if (link.getAttribute('data-nav') === here) link.setAttribute('aria-current', 'page');
  });

  /* Eerste frame direct berekenen */
  requestFrame();
})();
