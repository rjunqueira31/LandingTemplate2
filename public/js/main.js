document.addEventListener('DOMContentLoaded', function() {
  initNavOverflow();
  initCarousel();
  initMobileMenu();
  initScrollSpy();
  initSmoothScroll();
  initLightbox();
  initHeaderScroll();
  initPartners();
});

/* ============================== */
/* PARTNERS CAROUSEL              */
/* ============================== */
function initPartners() {
  var track = document.querySelector('.partners-track');
  var wrapper = document.querySelector('.partners-wrapper');
  if (!track || !wrapper) return;

  // Collect original items (server renders 2 copies; keep only the originals)
  var items = Array.from(track.querySelectorAll('.partner-item'));
  var totalFromServer = items.length;
  var origCount = totalFromServer / 2;  // server duplicates once
  var origItems = items.slice(0, origCount);

  // Clear track and re-populate with enough clones to fill 2x viewport
  track.innerHTML = '';
  origItems.forEach(function(el) {
    track.appendChild(el);
  });

  // Measure one set width
  var setWidth = track.scrollWidth;
  var viewWidth = wrapper.clientWidth;

  // Clone sets until we have at least 2x the viewport covered
  var copies = Math.ceil((viewWidth * 2) / setWidth) + 1;
  for (var c = 0; c < copies; c++) {
    origItems.forEach(function(el) {
      track.appendChild(el.cloneNode(true));
    });
  }

  // Set animation speed proportional to content: ~8s per partner logo
  var duration = origCount * 8;
  track.style.setProperty('--scroll-duration', duration + 's');
  track.classList.add('scrolling');
}

/* ============================== */
/* NAV OVERFLOW DETECTION         */
/* ============================== */
function initNavOverflow() {
  var header = document.querySelector('header');
  var nav = document.querySelector('nav');
  if (!header || !nav) return;

  function checkOverflow() {
    // Temporarily remove collapsed to measure real width
    header.classList.remove('nav-collapsed');
    // Compare nav scroll width vs its visible width
    var isOverflowing = nav.scrollWidth > nav.clientWidth;
    if (isOverflowing) {
      header.classList.add('nav-collapsed');
    }
  }

  checkOverflow();
  window.addEventListener('resize', checkOverflow);
}

/* ============================== */
/* CAROUSEL                       */
/* ============================== */
function initCarousel() {
  var slides = document.querySelectorAll('.carousel-slide');
  if (slides.length <= 1) return;

  var current = 0;
  var interval;

  function showSlide(index) {
    slides.forEach(function(s) {
      s.classList.remove('active');
    });
    slides[index].classList.add('active');
  }

  function nextSlide() {
    current = (current + 1) % slides.length;
    showSlide(current);
  }

  function prevSlide() {
    current = (current - 1 + slides.length) % slides.length;
    showSlide(current);
  }

  function startAutoplay() {
    interval = setInterval(nextSlide, 5000);
  }

  function resetAutoplay() {
    clearInterval(interval);
    startAutoplay();
  }

  var prevBtn = document.querySelector('.carousel-btn.prev');
  var nextBtn = document.querySelector('.carousel-btn.next');

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      prevSlide();
      resetAutoplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      nextSlide();
      resetAutoplay();
    });
  }

  showSlide(0);
  startAutoplay();
}

/* ============================== */
/* MOBILE MENU                    */
/* ============================== */
function initMobileMenu() {
  var hamburger = document.querySelector('.hamburger');
  var mobileMenu = document.querySelector('.mobile-menu');
  var overlay = document.querySelector('.mobile-menu-overlay');
  if (!hamburger || !mobileMenu) return;

  var icon = hamburger.querySelector('i');
  var mobileLinks = mobileMenu.querySelectorAll('a');

  function closeMenu() {
    mobileMenu.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    icon.classList.remove('fa-times');
    icon.classList.add('fa-bars');
  }

  hamburger.addEventListener('click', function() {
    var isActive = mobileMenu.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
    document.body.style.overflow = isActive ? 'hidden' : '';

    if (isActive) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    } else {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  });

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  mobileLinks.forEach(function(link) {
    link.addEventListener('click', closeMenu);
  });
}

/* ============================== */
/* SCROLL SPY                     */
/* ============================== */
function initScrollSpy() {
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('[data-section]');
  if (sections.length === 0 || navLinks.length === 0) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        navLinks.forEach(function(link) {
          link.classList.remove('active');
        });
        navLinks.forEach(function(link) {
          if (link.getAttribute('data-section') === entry.target.id) {
            link.classList.add('active');
          }
        });
      }
    });
  }, {threshold: 0.2, rootMargin: '-80px 0px -40% 0px'});

  sections.forEach(function(section) {
    observer.observe(section);
  });
}

/* ============================== */
/* SMOOTH SCROLL                  */
/* ============================== */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      var href = link.getAttribute('href');
      if (href === '#') return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({behavior: 'smooth'});
      }
    });
  });
}

/* ============================== */
/* GALLERY LIGHTBOX               */
/* ============================== */
function initLightbox() {
  var overlay = document.querySelector('.lightbox-overlay');
  if (!overlay) return;

  var lightboxImg = overlay.querySelector('img');
  var lightboxDesc = overlay.querySelector('.lightbox-description');
  var closeBtn = overlay.querySelector('.lightbox-close');
  var prevBtn = overlay.querySelector('.lightbox-prev');
  var nextBtn = overlay.querySelector('.lightbox-next');
  var items = Array.from(document.querySelectorAll('.gallery-item'));
  var currentIndex = 0;

  function showImage(index) {
    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;
    currentIndex = index;

    var item = items[currentIndex];
    var imgSrc =
        item.getAttribute('data-full-src') || item.querySelector('img').src;
    var desc = item.getAttribute('data-description') || '';

    lightboxImg.src = imgSrc;
    lightboxDesc.textContent = desc;
    lightboxDesc.style.display = desc ? 'block' : 'none';

    // Hide nav if only one image
    if (prevBtn) prevBtn.style.display = items.length > 1 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = items.length > 1 ? 'flex' : 'none';
  }

  items.forEach(function(item, i) {
    item.addEventListener('click', function() {
      showImage(i);
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  if (prevBtn)
    prevBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      showImage(currentIndex - 1);
    });

  if (nextBtn)
    nextBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      showImage(currentIndex + 1);
    });

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeLightbox();
  });

  document.addEventListener('keydown', function(e) {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
    if (e.key === 'ArrowRight') showImage(currentIndex + 1);
  });

  // Touch/swipe support
  var touchStartX = 0;
  var touchEndX = 0;
  var SWIPE_THRESHOLD = 50;

  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, {passive: true});

  overlay.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    var diff = touchStartX - touchEndX;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0)
        showImage(currentIndex + 1);  // swipe left = next
      else
        showImage(currentIndex - 1);  // swipe right = prev
    }
  }, {passive: true});

  function closeLightbox() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/* ============================== */
/* HEADER SCROLL EFFECT           */
/* ============================== */
function initHeaderScroll() {
  var header = document.querySelector('header');
  if (!header) return;

  // Don't override if already has scrolled class (non-home pages)
  if (header.classList.contains('scrolled')) return;

  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}
