// ==UserScript==
// @name         SMARTBUS02
// @namespace    http://tampermonkey.net/
// @version      22.0.0
// @description  Print com fundo branco e negrito + Arrasto inteligente PROMO/NORMAL (botão só dentro da área)
// @match        https://prod-guanabara-frontoffice-smartbus.smarttravelit.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     ====================== UTIL ==============================
     ========================================================= */

  function loadScript(url) {
    return new Promise(resolve => {
      if (window.html2canvas) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /* =========================================================
     ====================== ESTILOS ===========================
     ========================================================= */

  GM_addStyle(`
    /* ===== PRINT: TEXTO SEMPRE NEGRITO ===== */
    body.smartbus-print-force,
    body.smartbus-print-force *:not(.badge):not(.badge *):not(.label):not(.label *) {
      color: #000 !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      filter: none !important;
      backdrop-filter: none !important;
      text-shadow: none !important;
    }

    /* ===== PRINT: REMOVE ÍCONE INFO ===== */
    body.smartbus-print-force i.fas.i-trip-detail.fa-info-circle {
      display: none !important;
    }

    /* ===== BOTÃO PRINT ===== */
    #btn-print-smartbus {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: #1f2933;
      color: #fff !important;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,.25);
      display: none; /* começa oculto */
    }
    #btn-print-smartbus:hover {
      background: #000;
    }

    /* ===== ARRASTO PROMO / NORMAL ===== */
    span.service-price-family {
      outline: none !important;
      background-color: rgba(150, 150, 150, 0.08);
    }

    span.service-price-family.promo {
      background-color: #ffffff !important;
    }
  `);

  /* =========================================================
     ====================== BOTÃO PRINT =======================
     ========================================================= */

  const btn = document.createElement('button');
  btn.id = 'btn-print-smartbus';
  btn.textContent = '📸 Print Horarios';
  document.body.appendChild(btn);

  /* ===== CONTROLA VISIBILIDADE DO BOTÃO ===== */
  const visibilityObserver = new MutationObserver(() => {
    const target = document.querySelector('div.sales-step-service');
    if (target && isElementVisible(target)) {
      btn.style.display = 'block';
    } else {
      btn.style.display = 'none';
    }
  });

  visibilityObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  /* ===== AÇÃO DO BOTÃO ===== */
  btn.addEventListener('click', async () => {
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');

    const target = document.querySelector('div.sales-step-service');
    if (!target || !isElementVisible(target)) {
      alert('❌ Área de serviços não disponível');
      return;
    }

    const hideSelectors = [
      '.sales-step-header',
      '.col-search-way.active',
      '.sales-service-filters',
      '.sales-step-dates',
      '.sales-step-prices',
      '.sales-day',
      '.col-md-6.without-return',
      '.sales-step-summary',
      '.sales-step-actions',
      '.sales-step-topbar'
    ];

    const hidden = [];
    hideSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        hidden.push({ el, display: el.style.display });
        el.style.display = 'none';
      });
    });

    const originalBg = target.style.backgroundColor;
    target.style.backgroundColor = '#ffffff';

    document.body.classList.add('smartbus-print-force');

    const originalScrollTop = target.scrollTop;
    target.scrollTop = 0;

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });

    target.scrollTop = originalScrollTop;
    target.style.backgroundColor = originalBg;
    document.body.classList.remove('smartbus-print-force');

    hidden.forEach(({ el, display }) => el.style.display = display);

    canvas.toBlob(async blob => {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      alert('✅ Print copiado com sucesso!');
    });
  });

  /* =========================================================
     ================= ARRASTO INTELIGENTE ====================
     ========================================================= */

  let isMouseDown = false;
  let isDragging = false;
  let dragMode = null;

  function ensureOriginal(span) {
    if (!span.dataset.originalText) {
      span.dataset.originalText = span.textContent.trim();
    }
  }

  function hideNumber(span) {
    ensureOriginal(span);
    span.textContent = '';
    span.classList.add('promo');
  }

  function showNumber(span) {
    if (span.dataset.originalText) {
      span.textContent = span.dataset.originalText;
    }
    span.classList.remove('promo');
  }

  document.addEventListener('mousedown', e => {
    const span = e.target.closest('span.service-price-family');
    if (!span) return;

    isMouseDown = true;
    isDragging = false;
    dragMode = span.classList.contains('promo') ? 'hide' : 'show';
  });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
    isDragging = false;
    dragMode = null;
  });

  document.addEventListener('mousemove', e => {
    if (!isMouseDown) return;
    const span = e.target.closest('span.service-price-family');
    if (!span) return;

    isDragging = true;
    dragMode === 'hide' ? hideNumber(span) : showNumber(span);
  });

  document.addEventListener('click', e => {
    const span = e.target.closest('span.service-price-family');
    if (!span) return;

    if (isDragging) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    span.classList.contains('promo') ? showNumber(span) : hideNumber(span);
  }, true);

})();
