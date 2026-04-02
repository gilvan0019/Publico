// ==UserScript==
// @name         SmartBus Unificado - Completo + Configurações
// @namespace    https://smartbus.unificado
// @version      5.6.0
// @description  Documento por passageiro + print reserva + copiar dados + print horários + arrasto promo/normal + painel de configurações com botão móvel + idade completa abaixo da data de nascimento + validação de CPF + lógica melhor de RG
// @match        https://prod-guanabara-frontoffice-smartbus.smarttravelit.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     CONFIG
  ========================================================= */
  const CONFIG_KEY = 'smartbus_unificado_config_v6';
  const CONFIG_FAB_POS_KEY = 'smartbus_unificado_fab_pos_v1';

  const DEFAULT_CONFIG = {
    passengerDocPanel: true,
    reservaPrint: false,
    copyTrecho: true,
    clickCopy: true,
    copyLink: true,
    horariosPrint: false,
    promoDrag: false
  };

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return { ...DEFAULT_CONFIG, ...saved };
    } catch (_) {
      return { ...DEFAULT_CONFIG };
    }
  }

  let currentConfig = loadConfig();

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(currentConfig));
  }

  function isEnabled(key) {
    return !!currentConfig[key];
  }

  /* =========================================================
     HELPERS
  ========================================================= */
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function addStyleOnce(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function onlyDigits(str) {
    return String(str || '').replace(/\D+/g, '');
  }

  function formatCPF(cpf) {
    const d = onlyDigits(cpf);
    if (d.length !== 11) return cpf || '';
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function isValidCPF(cpf) {
    const d = onlyDigits(cpf);

    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;

    function calcCheckDigit(base, startWeight) {
      let sum = 0;

      for (let i = 0; i < base.length; i++) {
        sum += Number(base[i]) * (startWeight - i);
      }

      let result = (sum * 10) % 11;
      if (result === 10) result = 0;

      return result;
    }

    const digit1 = calcCheckDigit(d.slice(0, 9), 10);
    const digit2 = calcCheckDigit(d.slice(0, 10), 11);

    return digit1 === Number(d[9]) && digit2 === Number(d[10]);
  }

  function formatPhone(phone) {
    const d = onlyDigits(phone);
    if (!d) return '(00) 0000-0001';
    if (d.length === 8) return d.replace(/(\d{4})(\d{4})/, '$1-$2');
    if (d.length === 9) return d.replace(/(\d{5})(\d{4})/, '$1-$2');
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    return phone || '(00) 0000-0001';
  }

  function formatDateToInput(value) {
    if (!value) return '';
    const s = String(value).trim().replace(/[.]/g, '/');

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;

    m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;

    m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m) {
      const yy = Number(m[3]);
      const yyyy = yy <= 29 ? 2000 + yy : 1900 + yy;
      return `${m[1]}/${m[2]}/${yyyy}`;
    }

    return s;
  }

  function isVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => {
        s.dataset.loaded = 'true';
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureHtml2Canvas() {
    if (window.html2canvas) return;
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
  }

  function getNativeSetter(element) {
    let proto = element;
    while (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) return desc.set;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function dispatchAll(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'a' }));
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    const lastValue = el.value;
    const setter = getNativeSetter(el);
    el.focus();
    if (setter) setter.call(el, value);
    else el.value = value;
    if (el._valueTracker) el._valueTracker.setValue(lastValue);
    dispatchAll(el);
    el.blur();
    return true;
  }

  async function hardClearField(input) {
    if (!input) return;
    input.focus();
    await sleep(20);

    for (let i = 0; i < 3; i++) {
      setNativeValue(input, '');
      dispatchAll(input);
      await sleep(20);
    }

    try {
      input.select();
      document.execCommand('delete');
    } catch (_) {}

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Delete' }));

    setNativeValue(input, '');
    dispatchAll(input);
    await sleep(40);
    input.blur();
  }

  async function typeLikeUser(input, value) {
    if (!input || value == null || value === '') return false;

    const setter = getNativeSetter(input);
    let current = '';

    input.focus();
    if (setter) setter.call(input, '');
    else input.value = '';
    dispatchAll(input);
    await sleep(20);

    for (const ch of String(value)) {
      current += ch;
      if (setter) setter.call(input, current);
      else input.value = current;

      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ch
      }));

      await sleep(12);
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.blur();

    await sleep(20);
    return true;
  }

  async function fillFieldWithFallback(input, value) {
    if (!input || value == null) return false;
    const expected = String(value).trim();

    await hardClearField(input);
    await sleep(25);
    await typeLikeUser(input, expected);
    await sleep(50);
    if ((input.value || '').trim() === expected) return true;

    await hardClearField(input);
    setNativeValue(input, expected);
    await sleep(50);
    if ((input.value || '').trim() === expected) return true;

    await hardClearField(input);
    await typeLikeUser(input, expected);
    await sleep(50);
    return (input.value || '').trim() === expected;
  }

  async function fillEmailField(input, value) {
    if (!input || !value) return false;
    const expected = String(value).trim();

    await hardClearField(input);
    await sleep(40);
    await typeLikeUser(input, expected);
    await sleep(120);
    if (normalizeText(input.value) === normalizeText(expected)) return true;

    await hardClearField(input);
    setNativeValue(input, expected);
    dispatchAll(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.blur();
    await sleep(140);

    return normalizeText(input.value) === normalizeText(expected);
  }

  async function fillPhoneField(input, value) {
    if (!input || !value) return false;
    const formatted = formatPhone(value);
    const digits = onlyDigits(value);

    for (const candidate of [formatted, digits]) {
      await hardClearField(input);
      await sleep(40);
      await typeLikeUser(input, candidate);
      await sleep(120);
      if (onlyDigits(input.value) === digits) return true;

      await hardClearField(input);
      setNativeValue(input, candidate);
      dispatchAll(input);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      input.blur();
      await sleep(120);
      if (onlyDigits(input.value) === digits) return true;
    }

    return false;
  }

  /* =========================================================
     ESTILOS GERAIS + CONFIGURAÇÕES
  ========================================================= */
  addStyleOnce('smartbus-unificado-global-style', `
    #sb-config-fab {
      position: fixed;
      left: 18px;
      bottom: 18px;
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 999px;
      background: linear-gradient(180deg, #243241 0%, #101820 100%);
      color: #fff;
      font-size: 19px;
      cursor: grab;
      z-index: 1000001;
      box-shadow:
        0 10px 24px rgba(0,0,0,.28),
        inset 0 1px 0 rgba(255,255,255,.08);
      touch-action: none;
      user-select: none;
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
    }

    #sb-config-fab:hover {
      background: linear-gradient(180deg, #2b3c4d 0%, #141d26 100%);
      transform: translateY(-1px);
      box-shadow:
        0 14px 28px rgba(0,0,0,.32),
        inset 0 1px 0 rgba(255,255,255,.10);
    }

    #sb-config-fab:active {
      cursor: grabbing;
      transform: scale(0.98);
    }

    #sb-config-fab .sb-fab-icon {
      line-height: 1;
      transform: translateY(-1px);
      pointer-events: none;
    }

    #sb-config-panel {
      position: fixed;
      left: 18px;
      bottom: 74px;
      width: 315px;
      max-width: calc(100vw - 28px);
      background: linear-gradient(180deg, #ffffff 0%, #fafbff 100%);
      color: #222;
      border: 1px solid #d7deea;
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 20px 45px rgba(0,0,0,.22);
      z-index: 1000001;
      font-family: Arial, sans-serif;
      display: none;
      box-sizing: border-box;
    }

    #sb-config-panel.open {
      display: block;
    }

    #sb-config-panel .sb-config-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    #sb-config-panel .sb-config-title {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      color: #1f2933;
      line-height: 1.2;
    }

    #sb-config-panel .sb-config-sub {
      font-size: 12px;
      color: #66707a;
      margin: 6px 0 0;
      line-height: 1.45;
    }

    #sb-config-panel .sb-config-close {
      width: 30px;
      height: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      background: #fff;
      color: #334155;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      flex: 0 0 auto;
      box-shadow: 0 2px 8px rgba(0,0,0,.06);
    }

    #sb-config-panel .sb-config-close:hover {
      background: #f8fafc;
    }

    #sb-config-panel .sb-config-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #sb-config-panel .sb-config-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      padding: 10px 12px;
      border: 1px solid #eceff6;
      border-radius: 12px;
      background: #fff;
      transition: background .15s ease, border-color .15s ease;
    }

    #sb-config-panel .sb-config-item:hover {
      background: #f8faff;
      border-color: #d9def0;
    }

    #sb-config-panel input[type="checkbox"] {
      width: 17px;
      height: 17px;
      cursor: pointer;
      flex: 0 0 auto;
      accent-color: #b14bd4;
    }

    #sb-config-panel .sb-config-label {
      line-height: 1.35;
      font-weight: 600;
      color: #2a3139;
    }

    #sb-config-panel .sb-config-footer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #eef1f6;
      font-size: 11px;
      color: #67707a;
      line-height: 1.45;
    }

    body.smartbus-print-force,
    body.smartbus-print-force *:not(.badge):not(.badge *):not(.label):not(.label *) {
      color: #000 !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      filter: none !important;
      backdrop-filter: none !important;
      text-shadow: none !important;
    }

    body.smartbus-print-force i.fas.i-trip-detail.fa-info-circle {
      display: none !important;
    }

    span.service-price-family {
      outline: none !important;
      background-color: rgba(150, 150, 150, 0.08);
    }

    span.service-price-family.promo {
      background-color: #ffffff !important;
    }

    .print-reserva-box-topo {
      position: absolute;
      top: 6px;
      left: 185px;
      z-index: 9999;
    }

    #btn-print-reserva {
      padding: 8px 14px;
      background: #7b1e3a;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }

    #btn-print-reserva:hover {
      background: #64162f;
    }

    .btn-copiar-trecho {
      position: absolute;
      top: 50px;
      right: 6px;
      z-index: 10;
      padding: 4px 8px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: #800000;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,.2);
      user-select: none;
    }

    .btn-copiar-trecho:hover {
      background: #5c0000;
    }

    .smart-copy-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .smart-copy-btn {
      height: 36px;
      padding: 8px 14px;
      background: #7b1e3a;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }

    .smart-copy-btn:hover {
      background: #64162f;
    }

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
      display: none;
    }

    #btn-print-smartbus:hover {
      background: #000;
    }
  `);

  /* =========================================================
     CONFIG PANEL
  ========================================================= */
  function buildConfigPanel() {
    if (document.getElementById('sb-config-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'sb-config-fab';
    fab.type = 'button';
    fab.innerHTML = '<span class="sb-fab-icon">⚙</span>';

    const panel = document.createElement('div');
    panel.id = 'sb-config-panel';
    panel.innerHTML = `
      <div class="sb-config-head">
        <div>
          <div class="sb-config-title">Configurações SmartBus</div>
          <div class="sb-config-sub">Marque ou desmarque as funções que você quer usar. Salva automaticamente.</div>
        </div>
        <button class="sb-config-close" type="button" aria-label="Fechar">×</button>
      </div>

      <div class="sb-config-list">
        ${[
          ['passengerDocPanel', 'Painel de documento por passageiro'],
          ['reservaPrint', 'Print da reserva'],
          ['copyTrecho', 'Botão copiar trecho'],
          ['clickCopy', 'Copiar com clique'],
          ['copyLink', 'Botão copiar link'],
          ['horariosPrint', 'Print horários'],
          ['promoDrag', 'Arrasto PROMO / NORMAL']
        ].map(([key, label]) => `
          <label class="sb-config-item">
            <input type="checkbox" data-config-key="${key}" ${isEnabled(key) ? 'checked' : ''}>
            <span class="sb-config-label">${label}</span>
          </label>
        `).join('')}
      </div>

      <div class="sb-config-footer">
        As opções ficam salvas mesmo depois de atualizar a página.
      </div>
    `;

    const closeBtn = panel.querySelector('.sb-config-close');

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function saveFabPosition(left, top) {
      localStorage.setItem(CONFIG_FAB_POS_KEY, JSON.stringify({ left, top }));
    }

    function loadFabPosition() {
      try {
        return JSON.parse(localStorage.getItem(CONFIG_FAB_POS_KEY) || 'null');
      } catch (_) {
        return null;
      }
    }

    function applyFabPosition(left, top) {
      const maxLeft = window.innerWidth - fab.offsetWidth - 8;
      const maxTop = window.innerHeight - fab.offsetHeight - 8;

      const safeLeft = clamp(left, 8, Math.max(8, maxLeft));
      const safeTop = clamp(top, 8, Math.max(8, maxTop));

      fab.style.left = `${safeLeft}px`;
      fab.style.top = `${safeTop}px`;
      fab.style.bottom = 'auto';
      fab.style.right = 'auto';
    }

    function positionPanel() {
      const fabRect = fab.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || 315;
      const spacing = 10;

      let left = fabRect.left;
      let top = fabRect.top - panel.offsetHeight - spacing;

      if (left + panelWidth > window.innerWidth - 8) {
        left = window.innerWidth - panelWidth - 8;
      }
      if (left < 8) left = 8;

      if (top < 8) {
        top = fabRect.bottom + spacing;
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.bottom = 'auto';
    }

    let isDragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    fab.addEventListener('mousedown', (e) => {
      isDragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = fab.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        moved = true;
      }

      const newLeft = startLeft + dx;
      const newTop = startTop + dy;

      applyFabPosition(newLeft, newTop);

      if (panel.classList.contains('open')) {
        positionPanel();
      }
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = '';

      const rect = fab.getBoundingClientRect();
      saveFabPosition(rect.left, rect.top);
    });

    fab.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
        return;
      }

      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        positionPanel();
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('open');
    });

    panel.addEventListener('change', (e) => {
      const input = e.target.closest('input[data-config-key]');
      if (!input) return;

      const key = input.getAttribute('data-config-key');
      currentConfig[key] = !!input.checked;
      saveConfig();
      applyFeatureConfig();
    });

    document.addEventListener('click', (e) => {
      if (!panel.classList.contains('open')) return;
      if (e.target === fab || fab.contains(e.target) || panel.contains(e.target)) return;
      panel.classList.remove('open');
    });

    window.addEventListener('resize', () => {
      const rect = fab.getBoundingClientRect();
      applyFabPosition(rect.left, rect.top);
      if (panel.classList.contains('open')) {
        positionPanel();
      }
    });

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    requestAnimationFrame(() => {
      const savedPos = loadFabPosition();
      if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
        applyFabPosition(savedPos.left, savedPos.top);
      } else {
        const rect = fab.getBoundingClientRect();
        applyFabPosition(rect.left, rect.top);
      }
    });
  }

  /* =========================================================
     MÓDULO 1 — DOCUMENTO POR PASSAGEIRO
  ========================================================= */
  const DocModule = (() => {
    const TARGET_HASH = '#/main/sale/passenger';
    const PANEL_CLASS = 'sb-doc-reader-panel';
    const PASSENGER_ATTR = 'data-sb-passenger-card';
    const PASSENGER_ID_ATTR = 'data-sb-passenger-id';
    const PANEL_ATTR = 'data-sb-doc-panel';
    const LAST_FILE_PROP = '__sbLastPastedFile';

    let libsPromise = null;
    let observerStarted = false;
    let initTimeout = null;

    function isPassengerScreen() {
      return location.href.includes(TARGET_HASH);
    }

    async function ensureLibraries() {
      if (window.Tesseract && window.pdfjsLib) return;
      if (libsPromise) return libsPromise;

      libsPromise = (async () => {
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.js');
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js';
        }
      })();

      return libsPromise;
    }

    function ensureStyles() {
      addStyleOnce('sb-doc-reader-style', `
        .${PANEL_CLASS} {
          position: absolute !important;
          top: 10px !important;
          right: 10px !important;
          width: 235px !important;
          z-index: 999999 !important;
          font-family: Arial, sans-serif !important;
        }

        .${PANEL_CLASS} .sb-mini-card {
          background: #fff !important;
          border: 1px solid #d9e0f2 !important;
          border-right: 3px solid #3c4bb3 !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,.14) !important;
          padding: 10px !important;
          box-sizing: border-box !important;
        }

        .${PANEL_CLASS} .sb-title {
          margin: 0 0 6px !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          color: #2f3fa4 !important;
        }

        .${PANEL_CLASS} .sb-subtitle {
          margin: 0 0 8px !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
          color: #555 !important;
        }

        .${PANEL_CLASS} .sb-dropzone {
          border: 1.5px dashed #b8c3ee !important;
          background: #f8faff !important;
          border-radius: 10px !important;
          padding: 10px 8px !important;
          text-align: center !important;
          color: #32408f !important;
          cursor: pointer !important;
          margin-bottom: 8px !important;
          user-select: none !important;
        }

        .${PANEL_CLASS} .sb-dropzone.drag-over {
          border-color: #3342ad !important;
          background: #eef3ff !important;
        }

        .${PANEL_CLASS} .sb-drop-title {
          font-size: 12px !important;
          font-weight: 700 !important;
          margin-bottom: 2px !important;
        }

        .${PANEL_CLASS} .sb-drop-sub {
          font-size: 11px !important;
          color: #667 !important;
          line-height: 1.3 !important;
        }

        .${PANEL_CLASS} .sb-file-row {
          display: flex !important;
          gap: 6px !important;
          align-items: center !important;
          margin-bottom: 8px !important;
        }

        .${PANEL_CLASS} input[type="file"] {
          display: none !important;
        }

        .${PANEL_CLASS} .sb-file-btn {
          border: 1px solid #c9cfdd !important;
          background: #fff !important;
          color: #333 !important;
          border-radius: 7px !important;
          padding: 6px 10px !important;
          cursor: pointer !important;
          font-size: 11px !important;
          white-space: nowrap !important;
        }

        .${PANEL_CLASS} .sb-file-name {
          font-size: 11px !important;
          color: #666 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          min-width: 0 !important;
          flex: 1 !important;
        }

        .${PANEL_CLASS} .sb-action-btn {
          width: 100% !important;
          border: 0 !important;
          background: #3b49b3 !important;
          color: #fff !important;
          border-radius: 8px !important;
          padding: 9px 8px !important;
          cursor: pointer !important;
          font-weight: 700 !important;
          font-size: 12px !important;
        }

        .${PANEL_CLASS} .sb-action-btn:disabled {
          opacity: .65 !important;
          cursor: wait !important;
        }

        .${PANEL_CLASS} .sb-status {
          margin-top: 8px !important;
          font-size: 11px !important;
          color: #333 !important;
          white-space: pre-wrap !important;
          line-height: 1.35 !important;
        }

        .${PANEL_CLASS} .sb-preview {
          margin-top: 8px !important;
          font-size: 11px !important;
          background: #f7f7f7 !important;
          border-radius: 8px !important;
          padding: 8px !important;
          border: 1px solid #ececec !important;
          color: #555 !important;
          line-height: 1.35 !important;
        }

        .sb-age-badge {
          position: absolute !important;
          right: 0 !important;
          top: calc(100% + 4px) !important;
          background: #eef2ff !important;
          color: #2f3fa4 !important;
          border: 1px solid #c7d2fe !important;
          border-radius: 4px !important;
          padding: 3px 6px !important;
          font-size: 9px !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
          pointer-events: none !important;
          z-index: 3 !important;
          box-sizing: border-box !important;
        }

        .sb-age-badge.sb-age-warning {
          background: #ffe8a3 !important;
          color: #8a6500 !important;
          border: 1px solid #c9a227 !important;
        }
      `);
    }

    function getCleanLines(text) {
      return String(text || '')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
    }

    function isDateLike(line) {
      return /^\d{2}[./-]\d{2}[./-]\d{2,4}$/.test(String(line || '').trim());
    }

    function isBirthLine(line) {
      const t = normalizeText(line);
      return t.startsWith('dn') || t.startsWith('data de nascimento') || t.startsWith('nascimento');
    }

    function isSeatLine(line) {
      const t = normalizeText(line);
      return t.startsWith('poltrona') || t.includes('poltrona ') || t.startsWith('seat') || t.includes('seat ');
    }

    function getNumericCandidates(text) {
      return getCleanLines(text)
        .map((line, index) => ({
          line,
          index,
          normalized: normalizeText(line),
          digits: onlyDigits(line)
        }))
        .filter(item => {
          if (!item.digits) return false;
          if (isDateLike(item.line)) return false;
          if (isBirthLine(item.line)) return false;
          if (isSeatLine(item.line)) return false;
          return true;
        });
    }

    function extractEmail(text) {
      const m = String(text || '').match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
      return m ? m[0].trim() : '';
    }

    function cleanName(name) {
      return String(name || '')
        .replace(/^\s*nome completo\s*[:\-]\s*/i, '')
        .replace(/^\s*nome\s*[:\-]\s*/i, '')
        .replace(/dados do passageiro\s*\-?/gi, '')
        .replace(/[^\p{L}\s'-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function extractDate(text) {
      const patterns = [
        /\b(?:dn|data de nascimento|nascimento)\s*[:\-]?\s*(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})\b/i,
        /\b(?:dn|data de nascimento|nascimento)\s*[:\-]?\s*(\d{2}[\/.\-]\d{2}[\/.\-]\d{2})\b/i,
        /\b(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})\b/,
        /\b(\d{4}[\/.\-]\d{2}[\/.\-]\d{2})\b/,
        /\b(\d{2}[\/.\-]\d{2}[\/.\-]\d{2})\b/
      ];

      for (const p of patterns) {
        const m = String(text || '').match(p);
        if (m) return m[1] || m[0];
      }
      return '';
    }

    function hasStrictCpfMask(text) {
      return /\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/.test(String(text || ''));
    }

    function extractExplicitCpfDigits(text) {
      const lines = getCleanLines(text);

      for (const line of lines) {
        if (isBirthLine(line) || isSeatLine(line)) continue;

        const sameLine = line.match(/\bcpf\s*[:\-]?\s*([0-9.\-\s]{11,25})/i);
        if (!sameLine?.[1]) continue;

        const d = onlyDigits(sameLine[1]);
        if (isValidCPF(d)) return d;
      }

      return '';
    }

    function extractExplicitRgDigits(text, cpfDigits = '') {
      const lines = getCleanLines(text);

      for (const line of lines) {
        if (isBirthLine(line) || isSeatLine(line)) continue;

        const sameLine = line.match(/\b(?:rg|identidade|registro geral)\s*[:\-]?\s*([0-9.\-xX\s]{5,30})/i);
        if (!sameLine?.[1]) continue;

        const d = onlyDigits(sameLine[1]);
        if (!d) continue;
        if (d === cpfDigits) continue;

        if (d.length >= 5 && d.length <= 20) {
          return d;
        }
      }

      return '';
    }

    function extractDocumentFields(text) {
      const raw = String(text || '');

      const candidates = getNumericCandidates(raw)
        .filter(item => item.digits.length >= 5 && item.digits.length <= 20)
        .filter(item => !/(telefone|fone|celular|tel|phone|mobile)/i.test(item.normalized))
        .filter(item => !item.normalized.includes('poltrona'));

      let cpfDigits = extractExplicitCpfDigits(raw);

      if (!cpfDigits) {
        const cpfCandidates = candidates.filter(item =>
          item.digits.length === 11 && isValidCPF(item.digits)
        );

        let bestCpf = '';
        let bestCpfScore = -9999;
        const zeroStartCount = cpfCandidates.filter(c => c.digits.startsWith('0')).length;

        for (const item of cpfCandidates) {
          let score = 0;

          if (item.normalized.includes('cpf')) score += 220;
          if (hasStrictCpfMask(item.line)) score += 140;
          if (/\b\d{3}\.\d{3}\.\d{3}\.\d{2}\b/.test(item.line)) score -= 30;
          if (/(rg|identidade|registro geral)/i.test(item.normalized)) score -= 140;

          if (item.digits.startsWith('0')) score += 25;
          if (zeroStartCount === 1 && item.digits.startsWith('0')) score += 50;

          if (score > bestCpfScore) {
            bestCpfScore = score;
            bestCpf = item.digits;
          }
        }

        cpfDigits = bestCpf;
      }

      let rgDigits = extractExplicitRgDigits(raw, cpfDigits);

      if (!rgDigits) {
        const rgCandidates = candidates.filter(item => item.digits !== cpfDigits);

        let bestRg = '';
        let bestRgScore = -9999;

        for (const item of rgCandidates) {
          const d = item.digits;
          const n = item.normalized;
          let score = 0;

          if (n.includes('rg')) score += 220;
          if (n.includes('identidade')) score += 180;
          if (n.includes('registro geral')) score += 180;

          if (d.length >= 7 && d.length <= 14) score += 60;
          if (d.length === 8) score += 20;
          if (d.length === 9) score += 25;
          if (d.length === 10) score += 18;
          if (d.length === 11) score += 20;
          if (d.length === 12) score += 30;
          if (d.length === 13) score += 35;
          if (d.length === 14) score += 28;

          if (hasStrictCpfMask(item.line)) score -= 160;
          if (/\b\d{3}\.\d{3}\.\d{3}\.\d{2}\b/.test(item.line)) score += 55;

          if (d.length === 11 && isValidCPF(d)) {
            score += 15;
          }

          if (/^0+/.test(d)) score += 8;
          if (/^20\d+/.test(d)) score += 10;

          if (/(telefone|fone|celular|tel|phone|mobile)/i.test(n)) score -= 200;
          if (n.includes('poltrona')) score -= 200;
          if (d.length < 5 || d.length > 20) score -= 100;

          if (score > bestRgScore) {
            bestRgScore = score;
            bestRg = d;
          }
        }

        if (bestRgScore >= 20) {
          rgDigits = bestRg;
        }
      }

      if (!rgDigits && cpfDigits) {
        rgDigits = cpfDigits;
      }

      return {
        cpf: cpfDigits ? formatCPF(cpfDigits) : '',
        rg: rgDigits || ''
      };
    }

    function extractCPF(text) {
      return extractDocumentFields(text).cpf;
    }

    function extractLabeledRG(text) {
      const cpfDigits = onlyDigits(extractDocumentFields(text).cpf);
      return extractExplicitRgDigits(text, cpfDigits);
    }

    function extractRG(text) {
      return extractDocumentFields(text).rg;
    }

    function extractLabeledPhone(text) {
      const lines = getCleanLines(text);
      const docs = extractDocumentFields(text);
      const cpfDigits = onlyDigits(docs.cpf);
      const rgDigits = onlyDigits(docs.rg);

      for (const line of lines) {
        const n = normalizeText(line);

        const sameLine = line.match(/\b(?:telefone|fone|celular|tel)\s*[:\-]?\s*([0-9()\s.\-]{8,30})/i);
        if (sameLine?.[1]) {
          const d = onlyDigits(sameLine[1]);
          if (d && d !== cpfDigits && d !== rgDigits && !isBirthLine(line) && [10, 11].includes(d.length)) {
            return formatPhone(d);
          }
        }

        if (/^(telefone|fone|celular|tel)/i.test(n)) {
          const d = onlyDigits(line);
          if (d && d !== cpfDigits && d !== rgDigits && !isBirthLine(line) && [10, 11].includes(d.length)) {
            return formatPhone(d);
          }
        }
      }
      return '';
    }

    function extractPhone(text) {
      if (!text) return '';

      const explicit = extractLabeledPhone(text);
      if (explicit) return explicit;

      const cleaned = String(text).replace(/\r/g, '\n').replace(/[|]/g, ' ');
      const lines = getCleanLines(cleaned);
      const docs = extractDocumentFields(cleaned);
      const cpfDigits = onlyDigits(docs.cpf);
      const rgDigits = onlyDigits(docs.rg);

      for (const line of lines) {
        const d = onlyDigits(line);
        const n = normalizeText(line);

        if (!d) continue;
        if (d === cpfDigits || d === rgDigits) continue;
        if (/^(\d)\1+$/.test(d)) continue;
        if (isDateLike(line) || isBirthLine(line) || isSeatLine(line)) continue;
        if (/^(rg|registro geral|identidade)/i.test(n)) continue;

        if ([10, 11].includes(d.length)) {
          if (d.length === 11 && isValidCPF(d)) continue;
          return formatPhone(d);
        }
      }

      return '';
    }

    function extractNameBeforeLabels(line) {
      const m = String(line || '').trim().match(
        /^(.*?)(?:\s+\b(?:rg|cpf|telefone|fone|celular|dn|data de nascimento|nascimento)\b[\s:\-]|$)/i
      );
      if (!m?.[1]) return '';
      const candidate = cleanName(m[1]);
      if (candidate && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'`´-]+$/.test(candidate) && candidate.split(' ').length >= 2) {
        return candidate;
      }
      return '';
    }

    function extractName(text) {
      const normalized = String(text || '').replace(/\r/g, '\n');

      const directPatterns = [
        /(?:^|\n)\s*nome completo\s*[:\-]\s*([^\n]+)/i,
        /(?:^|\n)\s*nome\s*[:\-]\s*([^\n]+)/i
      ];

      for (const p of directPatterns) {
        const m = normalized.match(p);
        if (m?.[1]) {
          const name = cleanName(m[1]);
          if (name && name.split(' ').length >= 2) return name;
        }
      }

      const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        if (isSeatLine(line)) continue;
        const sameLineName = extractNameBeforeLabels(line);
        if (sameLineName) return sameLineName;
      }

      const beforeCPF = normalized.match(/^([A-ZÀ-Ú][A-Za-zÀ-ÿ\s'`´-]+?)\s+(?:CPF|RG)\s*:/im);
      if (beforeCPF?.[1]) {
        const name = cleanName(beforeCPF[1]);
        if (name && name.split(' ').length >= 2) return name;
      }

      for (const line of lines) {
        if (isSeatLine(line)) continue;

        let cleaned = line.replace(/\b(nome completo|nome|cpf|rg|dn|data de nascimento|nascimento|email|telefone)\b.*$/i, '').trim();
        cleaned = cleanName(cleaned);

        if (!cleaned || cleaned.length < 6) continue;
        if (/^(data|data de|nome|nome completo|email|telefone|rg|cpf|dn|poltrona)$/i.test(cleaned)) continue;

        const looksLikeName =
          /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'`´-]+$/.test(cleaned) &&
          cleaned.split(' ').length >= 2;

        if (looksLikeName) return cleaned;
      }

      return '';
    }

    function extractDataFromText(rawText) {
      const text = String(rawText || '')
        .replace(/[|]/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();

      const lines = getCleanLines(text);

      let email = '';
      let nascimento = '';

      for (const line of lines) {
        if (!email) {
          const found = extractEmail(line);
          if (found) email = found;
        }
        if (!nascimento) {
          const foundDate = extractDate(line);
          if (foundDate) nascimento = formatDateToInput(foundDate);
        }
      }

      const docs = extractDocumentFields(text);
      const cpf = docs.cpf;
      const nome = extractName(text);
      const rg = docs.rg || cpf;
      const telefone = extractPhone(text) || formatPhone('0000000001');

      return {
        nome: nome || '',
        email: email || '',
        telefone,
        cpf: cpf || '',
        rg: rg || '',
        nascimento: nascimento || ''
      };
    }

    function isPassengerTitleElement(el) {
      return !!el && isVisible(el) && /^passageiro\s*#\d+/.test(normalizeText(el.textContent));
    }

    function extractPassengerNumber(text) {
      const m = normalizeText(text).match(/passageiro\s*#\s*(\d+)/);
      return m ? m[1] : null;
    }

    function elementLooksLikePassengerCard(el) {
      if (!el || !isVisible(el)) return false;
      const txt = normalizeText(el.innerText || '');
      const r = el.getBoundingClientRect();
      return txt.includes('nome') && txt.includes('telefone') && txt.includes('cpf') && txt.includes('rg') && r.width > 700 && r.height > 250;
    }

    function findPassengerCardFromTitle(titleEl) {
      let current = titleEl;
      for (let i = 0; i < 8 && current; i++) {
        if (elementLooksLikePassengerCard(current)) return current;
        current = current.parentElement;
      }
      return null;
    }

    function getPassengerContainers() {
      const all = Array.from(document.querySelectorAll('div, span, strong, label, p, h1, h2, h3, h4, h5'));
      const titles = all.filter(isPassengerTitleElement);
      const map = new Map();

      for (const title of titles) {
        const number = extractPassengerNumber(title.textContent || '');
        const card = findPassengerCardFromTitle(title);
        if (!number || !card) continue;
        if (!map.has(number)) map.set(number, card);
      }

      return Array.from(map.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([number, card]) => {
          card.setAttribute(PASSENGER_ID_ATTR, number);
          return card;
        });
    }

    function getPanelElements(panel) {
      return {
        input: panel.querySelector('[data-sb-input]'),
        dropzone: panel.querySelector('[data-sb-dropzone]'),
        button: panel.querySelector('[data-sb-button]'),
        status: panel.querySelector('[data-sb-status]'),
        preview: panel.querySelector('[data-sb-preview]'),
        fileName: panel.querySelector('[data-sb-file-name]')
      };
    }

    function setPanelStatus(panel, msg) {
      const { status } = getPanelElements(panel);
      if (status) status.textContent = msg;
    }

    function setPanelSelectedFileName(panel, name) {
      const { fileName } = getPanelElements(panel);
      if (fileName) fileName.textContent = name || 'Nenhum arquivo';
    }

    function setPanelPreview(panel, data) {
      const { preview } = getPanelElements(panel);
      if (!preview) return;

      if (!data) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
      }

      preview.style.display = 'block';
      preview.innerHTML = `
        <strong>Dados:</strong><br>
        Nome: ${data.nome || '-'}<br>
        E-mail: ${data.email || '-'}<br>
        Telefone: ${data.telefone || '(00) 0000-0001'}<br>
        CPF: ${data.cpf || '-'}<br>
        RG: ${data.rg || data.cpf || '-'}<br>
        Nascimento: ${data.nascimento || '-'}
      `;
    }

    function parseBirthDate(value) {
      const s = formatDateToInput(value || '').trim();
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return null;

      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);

      const date = new Date(year, month - 1, day);
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      return date;
    }

    function getAgePartsFromBirthDate(birthDate) {
      if (!birthDate) return null;

      const today = new Date();
      const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const birth = new Date(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());

      if (birth > current) return null;

      let years = current.getFullYear() - birth.getFullYear();
      let months = current.getMonth() - birth.getMonth();
      let days = current.getDate() - birth.getDate();

      if (days < 0) {
        months -= 1;
        const daysInPrevMonth = new Date(current.getFullYear(), current.getMonth(), 0).getDate();
        days += daysInPrevMonth;
      }

      if (months < 0) {
        years -= 1;
        months += 12;
      }

      if (years < 0) return null;

      return { years, months, days };
    }

    function getAgeLabel(value) {
      const birthDate = parseBirthDate(value);
      const parts = getAgePartsFromBirthDate(birthDate);
      if (!parts) return '';

      const anoTxt = parts.years === 1 ? 'ano' : 'anos';
      const mesTxt = parts.months === 1 ? 'mês' : 'meses';
      const diaTxt = parts.days === 1 ? 'dia' : 'dias';

      return `${parts.years} ${anoTxt} ${parts.months} ${mesTxt} ${parts.days} ${diaTxt}`;
    }

    function updateAgeBadgeForInput(input, explicitValue) {
      if (!input) return;

      const host = input.parentElement;
      if (!host) return;

      const value = explicitValue != null ? explicitValue : input.value;
      const birthDate = parseBirthDate(value);
      const ageParts = getAgePartsFromBirthDate(birthDate);
      const ageLabel = ageParts ? getAgeLabel(value) : '';

      let badge = host.querySelector('.sb-age-badge');

      if (!ageLabel) {
        if (badge) badge.remove();

        if (input.dataset.sbAgeOriginalPaddingRight != null) {
          input.style.paddingRight = input.dataset.sbAgeOriginalPaddingRight;
        }

        if (host.dataset.sbAgeOriginalPaddingBottom != null) {
          host.style.paddingBottom = host.dataset.sbAgeOriginalPaddingBottom;
        }

        return;
      }

      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }

      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'sb-age-badge';
        host.appendChild(badge);
      }

      if (input.dataset.sbAgeOriginalPaddingRight == null) {
        input.dataset.sbAgeOriginalPaddingRight = input.style.paddingRight || '';
      }

      if (host.dataset.sbAgeOriginalPaddingBottom == null) {
        host.dataset.sbAgeOriginalPaddingBottom = host.style.paddingBottom || '';
      }

      input.style.paddingRight = input.dataset.sbAgeOriginalPaddingRight || '';
      host.style.paddingBottom = '22px';
      badge.textContent = ageLabel;

      const under16 = ageParts && ageParts.years < 16;
      badge.classList.toggle('sb-age-warning', !!under16);
    }

    function bindAgeBadge(input) {
      if (!input || input.dataset.sbAgeBound === '1') return;
      input.dataset.sbAgeBound = '1';

      const refresh = () => setTimeout(() => updateAgeBadgeForInput(input), 0);

      input.addEventListener('input', refresh);
      input.addEventListener('change', refresh);
      input.addEventListener('blur', refresh);

      window.addEventListener('resize', () => updateAgeBadgeForInput(input), { passive: true });
      refresh();
    }

    function handlePasteEvent(e, panel) {
      if (!isPassengerScreen() || !isEnabled('passengerDocPanel')) return;
      if (!panel || !document.body.contains(panel)) return;

      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      const text = e.clipboardData?.getData ? e.clipboardData.getData('text/plain') : '';

      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            panel[LAST_FILE_PROP] = new File([file], file.name || `colado-${Date.now()}.png`, {
              type: file.type || 'image/png'
            });
            setPanelSelectedFileName(panel, panel[LAST_FILE_PROP].name || 'arquivo colado');
            setPanelStatus(panel, `Arquivo colado: ${panel[LAST_FILE_PROP].name || 'arquivo colado'}`);
            return;
          }
        }
      }

      if (text && text.trim()) {
        const blob = new Blob([text], { type: 'text/plain' });
        panel[LAST_FILE_PROP] = new File([blob], `texto-colado-${Date.now()}.txt`, { type: 'text/plain' });
        setPanelSelectedFileName(panel, panel[LAST_FILE_PROP].name);
        setPanelStatus(panel, 'Texto colado detectado.');
      }
    }

    function createPanelElement(passengerNumber) {
      const panel = document.createElement('div');
      panel.className = PANEL_CLASS;
      panel.setAttribute(PANEL_ATTR, 'true');
      panel.setAttribute('data-sb-panel-for', passengerNumber);

      const inputId = `sb-doc-reader-input-${passengerNumber}`;

      panel.innerHTML = `
        <div class="sb-mini-card">
          <div class="sb-title">Documento</div>
          <div class="sb-subtitle">Anexar, arrastar ou colar.</div>

          <div class="sb-dropzone" data-sb-dropzone tabindex="0">
            <div class="sb-drop-title">Arraste aqui</div>
            <div class="sb-drop-sub">clique ou Ctrl+V</div>
          </div>

          <div class="sb-file-row">
            <label class="sb-file-btn" for="${inputId}">Arquivo</label>
            <div class="sb-file-name" data-sb-file-name>Nenhum arquivo</div>
          </div>

          <input id="${inputId}" data-sb-input type="file" accept=".txt,.pdf,image/*,.jpeg,.jpg,.png,.webp" />
          <button class="sb-action-btn" data-sb-button>Ler e preencher</button>
          <div class="sb-status" data-sb-status>Aguardando arquivo...</div>
          <div class="sb-preview" data-sb-preview style="display:none;"></div>
        </div>
      `;

      const { input, dropzone, button } = getPanelElements(panel);

      input.addEventListener('change', () => {
        const file = input.files?.[0] || null;
        panel[LAST_FILE_PROP] = null;
        setPanelSelectedFileName(panel, file ? file.name : 'Nenhum arquivo');
        if (file) setPanelStatus(panel, `Arquivo selecionado: ${file.name}`);
      });

      button.addEventListener('click', () => onReadAndFill(panel));
      dropzone.addEventListener('click', () => {
        if (!isEnabled('passengerDocPanel')) return;
        input.click();
      });

      ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          if (!isEnabled('passengerDocPanel')) return;
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('drag-over');
        });
      });

      ['dragleave', 'dragend'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          if (!isEnabled('passengerDocPanel')) return;
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('drag-over');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (!isEnabled('passengerDocPanel')) return;
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');

        const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
        if (!files.length) return setPanelStatus(panel, 'Nenhum arquivo encontrado no arraste.');

        const file = files[0];
        panel[LAST_FILE_PROP] = file;
        setPanelSelectedFileName(panel, file.name);
        setPanelStatus(panel, `Arquivo recebido: ${file.name}`);
      });

      dropzone.addEventListener('paste', (e) => handlePasteEvent(e, panel));
      panel.addEventListener('paste', (e) => handlePasteEvent(e, panel));

      return panel;
    }

    function isInsideOurPanel(el) {
      return !!el.closest(`.${PANEL_CLASS}[${PANEL_ATTR}]`);
    }

    function isSearchLikeInput(input) {
      const text = normalizeText([
        input?.name || '',
        input?.id || '',
        input?.placeholder || '',
        input?.type || '',
        input?.getAttribute?.('aria-label') || '',
        input?.getAttribute?.('ng-reflect-name') || '',
        input?.outerHTML || ''
      ].join(' '));

      return text.includes('informar cpf') ||
             text.includes('informar codigo') ||
             text.includes('cliente') ||
             text.includes('search') ||
             (input?.type || '').toLowerCase() === 'search';
    }

    function getVisibleInputs(container) {
      return Array.from(container.querySelectorAll('input, textarea')).filter(el =>
        isVisible(el) &&
        !el.disabled &&
        !el.readOnly &&
        !isInsideOurPanel(el) &&
        !isSearchLikeInput(el)
      );
    }

    function getLabelCandidates(container) {
      return Array.from(container.querySelectorAll('label, div, span, strong')).filter(el => {
        if (isInsideOurPanel(el)) return false;
        if (!isVisible(el)) return false;
        const txt = normalizeText(el.textContent || '');
        return !!txt && txt.length <= 120;
      });
    }

    function isProbablyPhoneInput(input) {
      const text = normalizeText([
        input?.name || '',
        input?.id || '',
        input?.placeholder || '',
        input?.getAttribute?.('aria-label') || '',
        input?.getAttribute?.('ng-reflect-name') || '',
        input?.outerHTML || ''
      ].join(' '));

      return text.includes('telefone') ||
             text.includes('phone') ||
             text.includes('celular') ||
             text.includes('mobile') ||
             (input?.type || '').toLowerCase() === 'tel';
    }

    function isProbablyEmailInput(input) {
      const text = normalizeText([
        input?.name || '',
        input?.id || '',
        input?.placeholder || '',
        input?.type || '',
        input?.getAttribute?.('aria-label') || '',
        input?.outerHTML || ''
      ].join(' '));

      return text.includes('email') ||
             text.includes('e-mail') ||
             text.includes('mail') ||
             (input?.type || '').toLowerCase() === 'email';
    }

    function scoreInputForField(input, fieldName) {
      const blob = normalizeText([
        input?.name || '',
        input?.id || '',
        input?.placeholder || '',
        input?.type || '',
        input?.getAttribute?.('aria-label') || '',
        input?.getAttribute?.('ng-reflect-name') || '',
        input?.outerHTML || ''
      ].join(' '));

      let score = 0;

      if (fieldName === 'telefone') {
        if (blob.includes('telefone')) score += 30;
        if (blob.includes('celular')) score += 25;
        if (blob.includes('phone')) score += 20;
        if (blob.includes('mobile')) score += 20;
        if ((input.type || '').toLowerCase() === 'tel') score += 25;
      }

      if (fieldName === 'email') {
        if (blob.includes('e-mail')) score += 30;
        if (blob.includes('email')) score += 30;
        if (blob.includes('mail')) score += 18;
        if ((input.type || '').toLowerCase() === 'email') score += 25;
      }

      if (fieldName === 'nome') {
        if (blob.includes('nome')) score += 20;
        if (blob.includes('name')) score += 16;
      }

      if (fieldName === 'nascimento') {
        if (blob.includes('nascimento')) score += 20;
        if (blob.includes('birth')) score += 16;
        if (blob.includes('data')) score += 10;
      }

      if (fieldName === 'rg') {
        if (blob.includes('rg')) score += 20;
        if (blob.includes('identidade')) score += 14;
      }

      if (fieldName === 'cpf') {
        if (blob.includes('cpf')) score += 20;
      }

      if (blob.includes('cliente')) score -= 100;
      if (blob.includes('informar cpf')) score -= 100;
      if (blob.includes('informar codigo')) score -= 100;
      if (blob.includes('search')) score -= 100;

      return score;
    }

    function getFieldAliases(fieldName) {
      return {
        nome: ['nome'],
        telefone: ['telefone', 'fone', 'celular', 'tel'],
        email: ['e-mail', 'email', 'mail'],
        rg: ['rg', 'identidade', 'registro geral'],
        cpf: ['cpf'],
        nascimento: ['data de nascimento', 'nascimento', 'dn']
      }[fieldName] || [fieldName];
    }

    function findLabelElements(container, fieldName) {
      const aliases = getFieldAliases(fieldName);
      return getLabelCandidates(container).filter(label => {
        const txt = normalizeText(label.textContent || '');
        return aliases.some(alias => txt === alias || txt.includes(alias));
      });
    }

    function distanceScore(labelRect, inputRect) {
      const labelCenterX = labelRect.left + labelRect.width / 2;
      const inputCenterX = inputRect.left + inputRect.width / 2;
      const verticalGap = inputRect.top - labelRect.bottom;
      const horizontalGap = Math.abs(inputCenterX - labelCenterX);

      let score = 0;
      if (verticalGap >= -8 && verticalGap <= 120) score += 70;
      else if (verticalGap > 120 && verticalGap <= 180) score += 20;
      else score -= 50;

      if (horizontalGap <= 60) score += 50;
      else if (horizontalGap <= 140) score += 25;
      else if (horizontalGap <= 260) score += 5;
      else score -= 30;

      if (inputRect.top >= labelRect.top - 8) score += 10;

      return score -
        (verticalGap > 0 ? verticalGap * 0.18 : Math.abs(verticalGap) * 0.3) -
        (horizontalGap * 0.05);
    }

    function findStrictInputByLabel(container, fieldName, used = new Set()) {
      const aliasesMap = {
        nome: ['nome'],
        telefone: ['telefone'],
        email: ['e-mail', 'email'],
        nascimento: ['data de nascimento', 'nascimento'],
        rg: ['rg'],
        cpf: ['cpf']
      };

      const aliases = aliasesMap[fieldName] || [fieldName];
      const labels = getLabelCandidates(container).filter(label => {
        const txt = normalizeText(label.textContent || '');
        return aliases.some(alias => txt === alias || txt.includes(alias));
      });

      const inputs = getVisibleInputs(container).filter(i => !used.has(i));
      if (!labels.length || !inputs.length) return null;

      let best = null;
      let bestScore = -99999;

      for (const label of labels) {
        const lr = label.getBoundingClientRect();

        for (const input of inputs) {
          const ir = input.getBoundingClientRect();
          const verticalGap = ir.top - lr.bottom;
          const horizontalGap = Math.abs(ir.left - lr.left);

          if (verticalGap < -6 || verticalGap > 120) continue;
          if (horizontalGap > 120) continue;

          let score = 1000 - verticalGap * 3 - horizontalGap * 2;

          if (fieldName === 'telefone' && isProbablyPhoneInput(input)) score += 200;
          if (fieldName === 'email' && isProbablyEmailInput(input)) score += 200;
          if (fieldName !== 'telefone' && isProbablyPhoneInput(input)) score -= 200;
          if (fieldName !== 'email' && isProbablyEmailInput(input)) score -= 120;

          if (score > bestScore) {
            bestScore = score;
            best = input;
          }
        }
      }

      return best;
    }

    function findInputByLabelGeometry(container, fieldName, used = new Set()) {
      const labels = findLabelElements(container, fieldName);
      const inputs = getVisibleInputs(container).filter(i => !used.has(i));
      if (!labels.length || !inputs.length) return null;

      let best = null;
      let bestScore = -9999;

      for (const label of labels) {
        const labelRect = label.getBoundingClientRect();

        for (const input of inputs) {
          const inputRect = input.getBoundingClientRect();
          let score = distanceScore(labelRect, inputRect);
          score += scoreInputForField(input, fieldName);

          if (fieldName === 'telefone' && isProbablyPhoneInput(input)) score += 35;
          if (fieldName === 'email' && isProbablyEmailInput(input)) score += 35;
          if (fieldName !== 'telefone' && isProbablyPhoneInput(input)) score -= 35;
          if (fieldName !== 'email' && isProbablyEmailInput(input)) score -= 20;

          if (score > bestScore) {
            bestScore = score;
            best = input;
          }
        }
      }

      return bestScore > -20 ? best : null;
    }

    function findBestScoredInput(container, fieldName, used = new Set()) {
      const inputs = getVisibleInputs(container).filter(i => !used.has(i));
      if (!inputs.length) return null;

      let best = null;
      let bestScore = -999;

      for (const input of inputs) {
        const score = scoreInputForField(input, fieldName);
        if (score > bestScore) {
          bestScore = score;
          best = input;
        }
      }

      return bestScore > 0 ? best : null;
    }

    function findInputByVisualOrder(container, fieldName, used = new Set()) {
      const visibleInputs = getVisibleInputs(container).filter(i => !used.has(i));
      if (!visibleInputs.length) return null;

      const allTextInputs = visibleInputs.filter(input => {
        const type = (input.type || 'text').toLowerCase();
        return ['text', 'email', 'search', 'tel', ''].includes(type);
      });

      const noPhone = allTextInputs.filter(i => !isProbablyPhoneInput(i));
      const noEmail = allTextInputs.filter(i => !isProbablyEmailInput(i));

      if (fieldName === 'telefone') {
        return allTextInputs.find(isProbablyPhoneInput) || allTextInputs[1] || allTextInputs[2] || null;
      }
      if (fieldName === 'email') {
        return allTextInputs.find(isProbablyEmailInput) || noPhone[1] || noPhone[2] || null;
      }
      if (fieldName === 'nome') return noPhone[0] || noEmail[0] || allTextInputs[0] || null;
      if (fieldName === 'nascimento') return noPhone[2] || noPhone[3] || allTextInputs[3] || null;
      if (fieldName === 'rg') return noPhone[3] || noPhone[4] || allTextInputs[4] || null;
      if (fieldName === 'cpf') return noPhone[4] || noPhone[5] || allTextInputs[5] || null;

      return null;
    }

    function findBestInput(container, fieldName, used = new Set()) {
      return (
        findStrictInputByLabel(container, fieldName, used) ||
        findInputByLabelGeometry(container, fieldName, used) ||
        findBestScoredInput(container, fieldName, used) ||
        findInputByVisualOrder(container, fieldName, used)
      );
    }

    function resolveFieldInputs(container) {
      const used = new Set();

      const nomeInput = findBestInput(container, 'nome', used); if (nomeInput) used.add(nomeInput);
      const telefoneInput = findBestInput(container, 'telefone', used); if (telefoneInput) used.add(telefoneInput);
      const emailInput = findBestInput(container, 'email', used); if (emailInput) used.add(emailInput);
      const nascimentoInput = findBestInput(container, 'nascimento', used); if (nascimentoInput) used.add(nascimentoInput);
      const rgInput = findBestInput(container, 'rg', used); if (rgInput) used.add(rgInput);
      const cpfInput = findBestInput(container, 'cpf', used); if (cpfInput) used.add(cpfInput);

      return { nomeInput, telefoneInput, emailInput, nascimentoInput, rgInput, cpfInput };
    }

    async function fillFormFields(data, container) {
      if (!container) return 0;

      const { nomeInput, telefoneInput, emailInput, nascimentoInput, rgInput, cpfInput } =
        resolveFieldInputs(container);

      const cpfFinal = isValidCPF(data.cpf) ? formatCPF(data.cpf) : '';
      const rgFinal = data.rg ? String(data.rg).trim() : (cpfFinal || '');
      const telefoneFinal = data.telefone ? formatPhone(data.telefone) : formatPhone('0000000001');

      let filled = 0;

      if (nomeInput) {
        if (data.nome) {
          if (await fillFieldWithFallback(nomeInput, data.nome)) filled++;
        } else {
          await hardClearField(nomeInput);
        }
      }

      if (emailInput) {
        if (data.email) {
          if (await fillEmailField(emailInput, data.email)) filled++;
        } else {
          await hardClearField(emailInput);
        }
      }

      if (nascimentoInput) {
        bindAgeBadge(nascimentoInput);

        if (data.nascimento) {
          if (await fillFieldWithFallback(nascimentoInput, data.nascimento)) filled++;
          updateAgeBadgeForInput(nascimentoInput, data.nascimento);
        } else {
          await hardClearField(nascimentoInput);
          updateAgeBadgeForInput(nascimentoInput, '');
        }
      }

      if (rgInput) {
        if (rgFinal) {
          if (await fillFieldWithFallback(rgInput, rgFinal)) filled++;
        } else {
          await hardClearField(rgInput);
        }
      }

      if (cpfInput) {
        if (cpfFinal) {
          if (await fillFieldWithFallback(cpfInput, cpfFinal)) filled++;
        } else {
          await hardClearField(cpfInput);
        }
      }

      if (telefoneInput && await fillPhoneField(telefoneInput, telefoneFinal)) filled++;

      return filled;
    }

    async function readTxtFile(file) {
      return file.text();
    }

    async function readImageWithOCR(file) {
      await ensureLibraries();
      const result = await window.Tesseract.recognize(file, 'por', { logger: () => {} });
      return result?.data?.text || '';
    }

    async function readPdfText(file) {
      await ensureLibraries();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 3); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        fullText += '\n' + textContent.items.map(item => item.str).join(' ');
      }
      return fullText.trim();
    }

    async function readPdfWithOCR(file) {
      await ensureLibraries();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 2); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const result = await window.Tesseract.recognize(blob, 'por', { logger: () => {} });
        fullText += '\n' + (result?.data?.text || '');
      }

      return fullText.trim();
    }

    async function extractTextFromFile(file) {
      const name = (file.name || '').toLowerCase();
      const type = (file.type || '').toLowerCase();

      if (type.startsWith('text/') || name.endsWith('.txt')) return readTxtFile(file);
      if (type.startsWith('image/')) return readImageWithOCR(file);

      if (type === 'application/pdf' || name.endsWith('.pdf')) {
        let text = await readPdfText(file);
        if (!text || text.length < 20) text = await readPdfWithOCR(file);
        return text;
      }

      throw new Error('Formato não suportado.');
    }

    function getChosenFile(panel) {
      const { input } = getPanelElements(panel);
      return panel[LAST_FILE_PROP] || input?.files?.[0] || null;
    }

    async function onReadAndFill(panel) {
      if (!isEnabled('passengerDocPanel')) return;

      try {
        const { button } = getPanelElements(panel);
        const file = getChosenFile(panel);
        const container = panel.closest(`[${PASSENGER_ATTR}]`);

        if (!file) return setPanelStatus(panel, 'Selecione, arraste ou cole um arquivo primeiro.');
        if (!container) return setPanelStatus(panel, 'Não encontrei o passageiro deste painel.');

        button.disabled = true;
        setPanelPreview(panel, null);
        setPanelStatus(panel, 'Lendo documento...');

        const extractedText = await extractTextFromFile(file);
        if (!extractedText || extractedText.trim().length < 2) {
          throw new Error('Não consegui extrair texto suficiente do documento.');
        }

        const data = extractDataFromText(extractedText);
        setPanelPreview(panel, data);

        const hasSomething = data.nome || data.email || data.telefone || data.rg || data.cpf || data.nascimento;
        if (!hasSomething) {
          setPanelStatus(panel, 'Li o arquivo, mas não identifiquei dados suficientes.');
          return;
        }

        const filled = await fillFormFields(data, container);
        setPanelStatus(
          panel,
          filled > 0
            ? `Preenchido com sucesso. Campos: ${filled}`
            : 'Encontrei os dados, mas não consegui preencher esse passageiro.'
        );
      } catch (err) {
        console.error(err);
        setPanelStatus(panel, `Erro: ${err.message || err}`);
      } finally {
        const { button } = getPanelElements(panel);
        if (button) button.disabled = false;
      }
    }

    function removeAllPanels() {
      document.querySelectorAll(`.${PANEL_CLASS}[${PANEL_ATTR}]`).forEach(el => el.remove());
    }

    function cleanupDuplicatePanels() {
      const panels = Array.from(document.querySelectorAll(`.${PANEL_CLASS}[${PANEL_ATTR}]`));
      const seen = new Set();

      for (const panel of panels) {
        const passenger = panel.closest(`[${PASSENGER_ATTR}]`);
        const id = passenger?.getAttribute(PASSENGER_ID_ATTR) || 'none';
        if (seen.has(id)) panel.remove();
        else seen.add(id);
      }
    }

    function mountPanels() {
      if (!isEnabled('passengerDocPanel')) {
        removeAllPanels();
        return;
      }

      ensureStyles();
      const passengers = getPassengerContainers();

      passengers.forEach((container, index) => {
        const passengerId = container.getAttribute(PASSENGER_ID_ATTR) || String(index + 1);
        container.setAttribute(PASSENGER_ATTR, passengerId);

        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }

        const existingPanels = Array.from(container.querySelectorAll(`.${PANEL_CLASS}[${PANEL_ATTR}]`));
        if (existingPanels.length > 1) existingPanels.slice(1).forEach(p => p.remove());

        let panel = container.querySelector(`.${PANEL_CLASS}[${PANEL_ATTR}]`);
        if (!panel) {
          panel = createPanelElement(passengerId);
          container.appendChild(panel);
        }

        const existingInputs = resolveFieldInputs(container);
        if (existingInputs.nascimentoInput) {
          bindAgeBadge(existingInputs.nascimentoInput);
          updateAgeBadgeForInput(existingInputs.nascimentoInput);
        }
      });

      document.querySelectorAll(`.${PANEL_CLASS}[${PANEL_ATTR}]`).forEach(panel => {
        const passenger = panel.closest(`[${PASSENGER_ATTR}]`);
        if (!passenger || !document.body.contains(passenger)) panel.remove();
      });

      cleanupDuplicatePanels();
    }

    function initIfNeeded() {
      if (!isEnabled('passengerDocPanel')) {
        removeAllPanels();
        return;
      }

      if (!isPassengerScreen()) {
        removeAllPanels();
        return;
      }

      const bodyText = normalizeText(document.body.innerText || '');
      if (!bodyText.includes('passageiro #')) return;

      mountPanels();
    }

    function scheduleInit() {
      clearTimeout(initTimeout);
      initTimeout = setTimeout(initIfNeeded, 500);
    }

    function startObserverOnce() {
      if (observerStarted) return;
      observerStarted = true;

      const observer = new MutationObserver(() => scheduleInit());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
      window.addEventListener('hashchange', () => setTimeout(initIfNeeded, 700));

      window.addEventListener('load', () => {
        setTimeout(() => {
          if (document.body) {
            startObserverOnce();
            initIfNeeded();
          }
        }, 1400);
      });

      setTimeout(() => {
        if (document.body) {
          startObserverOnce();
          initIfNeeded();
        }
      }, 1800);
    }

    function applyConfig() {
      if (!isEnabled('passengerDocPanel')) {
        removeAllPanels();
      } else {
        initIfNeeded();
      }
    }

    return { init, applyConfig };
  })();

  /* =========================================================
     MÓDULO 2 — RESERVA / COPIAR / PRINT / HORÁRIOS
  ========================================================= */
  const ReservaModule = (() => {
    let ultimaURL = location.href;
    let horariosBtn = null;
    let horariosVisibilityObserverStarted = false;

    function isReservaTitle() {
      return document.querySelector('.page-title')?.textContent?.trim() === 'Reserva';
    }

    function isTelaReserva() {
      return isReservaTitle() && !!document.querySelector('div.card.card-coupon-area');
    }

    function setCopiedState(btn, onText, offText, delay = 1200) {
      btn.textContent = onText;
      setTimeout(() => { btn.textContent = offText; }, delay);
    }

    /* ---------------- PRINT RESERVA ---------------- */
    function removePrintButton() {
      document.querySelector('.print-reserva-box-topo')?.remove();
    }

    function collectReservaElements() {
      const elements = [];

      const resumo = document.querySelector('div.row.row-coupon-summary.m-b-0');
      if (resumo) elements.push(resumo);

      const itinerario = document.querySelector('div.card.card-coupon-area');
      if (itinerario) elements.push(itinerario);

      const colunaValores = itinerario?.nextElementSibling;
      if (colunaValores && /valores|pagamentos/i.test(colunaValores.innerText || '')) {
        elements.push(colunaValores);
      }

      const total = document.querySelector('li.li-total-value');
      if (total) elements.push(total);

      return elements.filter(Boolean);
    }

    async function tirarPrintReserva() {
      if (!isEnabled('reservaPrint')) return;

      if (!isTelaReserva()) {
        alert('Essa função só pode ser usada na tela de Reserva.');
        removePrintButton();
        return;
      }

      const box = document.querySelector('.print-reserva-box-topo');
      if (box) box.style.display = 'none';

      const elements = collectReservaElements();
      if (!elements.length) {
        alert('Área da reserva não encontrada.');
        if (box) box.style.display = '';
        return;
      }

      const container = document.createElement('div');
      Object.assign(container.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '1400px',
        background: '#ffffff',
        padding: '12px',
        boxSizing: 'border-box',
        zIndex: '-1'
      });

      const line = document.createElement('div');
      Object.assign(line.style, {
        display: 'flex',
        gap: '28px',
        alignItems: 'flex-start'
      });

      let leftCol = null;
      let rightCol = null;

      elements.forEach((el, index) => {
        const clone = el.cloneNode(true);
        clone.style.margin = '0';
        clone.style.boxSizing = 'border-box';

        if (index === 0) {
          clone.style.marginBottom = '16px';
          container.appendChild(clone);
          return;
        }

        if (el.matches('div.card.card-coupon-area')) {
          leftCol = document.createElement('div');
          leftCol.style.flex = '0 0 66%';
          leftCol.appendChild(clone);
          return;
        }

        const txt = (el.innerText || '').toLowerCase();
        if (txt.includes('valores') || txt.includes('pagamentos')) {
          rightCol = document.createElement('div');
          rightCol.style.flex = '0 0 32%';
          rightCol.appendChild(clone);
          return;
        }

        if (el.matches('li.li-total-value')) {
          Object.assign(clone.style, {
            fontSize: '22px',
            fontWeight: 'bold',
            padding: '14px',
            background: '#e8f5e9',
            borderTop: '2px solid #4caf50',
            textAlign: 'right',
            listStyle: 'none',
            marginTop: '16px'
          });
          container.appendChild(clone);
        }
      });

      if (leftCol || rightCol) {
        if (leftCol) line.appendChild(leftCol);
        if (rightCol) line.appendChild(rightCol);
        container.appendChild(line);
      }

      document.body.appendChild(container);

      try {
        await ensureHtml2Canvas();
        await new Promise(resolve => requestAnimationFrame(resolve));

        const canvas = await window.html2canvas(container, {
          scale: 1,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: false
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);

        alert('Print copiado para a área de transferência!');
      } catch (err) {
        console.error(err);
        alert('Erro ao gerar o print.');
      } finally {
        container.remove();
        if (box) box.style.display = '';
      }
    }

    function createPrintButton() {
      if (!isEnabled('reservaPrint')) {
        removePrintButton();
        return;
      }

      if (!isTelaReserva()) {
        removePrintButton();
        return;
      }

      const title = document.querySelector('.page-title');
      if (!title || document.getElementById('btn-print-reserva')) return;

      const header = title.parentElement;
      if (!header) return;
      header.style.position = 'relative';

      const box = document.createElement('div');
      box.className = 'print-reserva-box-topo';

      const btn = document.createElement('button');
      btn.id = 'btn-print-reserva';
      btn.textContent = 'Print Reserva';
      btn.addEventListener('click', tirarPrintReserva);

      box.appendChild(btn);
      header.appendChild(box);
    }

    /* ---------------- COPY TRECHO ---------------- */
    function removeCopyTrechoButtons() {
      document.querySelectorAll('.btn-copiar-trecho').forEach(btn => btn.remove());
    }

    function createCopyTrechoButtons() {
      if (!isEnabled('copyTrecho')) {
        removeCopyTrechoButtons();
        return;
      }

      const trechos = document.querySelectorAll('div.col-search-way');
      if (!trechos.length) return;

      trechos.forEach(container => {
        if (container.querySelector('.btn-copiar-trecho')) return;

        const btn = document.createElement('button');
        btn.className = 'btn-copiar-trecho';
        btn.textContent = 'Copiar';

        btn.addEventListener('click', () => {
          if (!isEnabled('copyTrecho')) return;

          const texts = [];
          container.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              texts.push(node.textContent.trim());
            } else if (
              node.nodeType === Node.ELEMENT_NODE &&
              !node.classList.contains('btn-copiar-trecho')
            ) {
              texts.push(node.innerText.trim());
            }
          });

          const finalText = texts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

          navigator.clipboard.writeText(finalText).then(() => {
            setCopiedState(btn, '✅ Copiado', 'Copiar', 1500);
          }).catch(() => {
            alert('Falha ao copiar para a área de transferência');
          });
        });

        container.style.position = 'relative';
        container.appendChild(btn);
      });
    }

    /* ---------------- CLICK COPY ---------------- */
    function normalizarDocumento(texto) {
      return texto.includes('-') ? texto.split('-').slice(1).join('-').trim() : texto.trim();
    }

    function ehBadgeTarifaOuStatus(el) {
      const texto = el.textContent?.trim();
      if (!texto) return false;
      if (texto === 'NORMAL' || texto === 'Cancelado') return true;
      if (el.closest('.badge, .label')) return true;
      return false;
    }

    function activateClickCopyStyle(el) {
      if (!el.dataset.sbCopyOriginalBorder) el.dataset.sbCopyOriginalBorder = el.style.border || '';
      if (!el.dataset.sbCopyOriginalPadding) el.dataset.sbCopyOriginalPadding = el.style.padding || '';
      if (!el.dataset.sbCopyOriginalRadius) el.dataset.sbCopyOriginalRadius = el.style.borderRadius || '';
      if (!el.dataset.sbCopyOriginalCursor) el.dataset.sbCopyOriginalCursor = el.style.cursor || '';
      if (!el.dataset.sbCopyOriginalTitle) el.dataset.sbCopyOriginalTitle = el.getAttribute('title') || '';

      el.style.border = '1px dashed gray';
      el.style.padding = '3px 8px';
      el.style.borderRadius = '6px';
      el.style.cursor = 'pointer';
      el.title = 'Clique para copiar';
      el.dataset.sbCopyStyled = '1';
    }

    function deactivateClickCopyStyles() {
      document.querySelectorAll('[data-sb-copy-bound="1"]').forEach(el => {
        el.style.border = el.dataset.sbCopyOriginalBorder || '';
        el.style.padding = el.dataset.sbCopyOriginalPadding || '';
        el.style.borderRadius = el.dataset.sbCopyOriginalRadius || '';
        el.style.cursor = el.dataset.sbCopyOriginalCursor || '';

        const oldTitle = el.dataset.sbCopyOriginalTitle || '';
        if (oldTitle) el.setAttribute('title', oldTitle);
        else el.removeAttribute('title');
      });
    }

    function aplicarCliqueCopiar(el, tipo = 'normal') {
      if (!el) return;
      if (ehBadgeTarifaOuStatus(el)) return;

      if (isEnabled('clickCopy')) {
        activateClickCopyStyle(el);
      }

      if (el.dataset.sbCopyBound === '1') return;
      el.dataset.sbCopyBound = '1';

      el.addEventListener('click', (e) => {
        if (!isEnabled('clickCopy')) return;
        if (ehBadgeTarifaOuStatus(el)) return;

        e.stopPropagation();

        let texto = el.textContent?.trim() || '';
        if (!texto) return;

        if (tipo === 'documento') texto = normalizarDocumento(texto);
        navigator.clipboard.writeText(texto);

        el.style.borderColor = 'green';
        el.style.backgroundColor = '#e6f4ea';

        setTimeout(() => {
          if (!isEnabled('clickCopy')) return;
          el.style.borderColor = 'darkred';
          el.style.backgroundColor = 'transparent';
        }, 1200);
      });
    }

    function aplicarClickCopy() {
      if (!isReservaTitle()) return;

      if (!isEnabled('clickCopy')) {
        deactivateClickCopyStyles();
        return;
      }

      document.querySelectorAll('label.control.coupon-summary-value').forEach(el => {
        const texto = el.textContent.trim();
        if (/^[A-Z0-9]{5,8}$/.test(texto)) aplicarCliqueCopiar(el);
      });

      document.querySelectorAll('.col-coupon-service-title b').forEach(el => {
        aplicarCliqueCopiar(el);
      });

      document.querySelectorAll('.col-coupon-service b').forEach(b => {
        if (/\d{2}\/\d{2}\/\d{4}/.test(b.textContent)) aplicarCliqueCopiar(b);
      });

      document.querySelectorAll('td.text-center').forEach(td => {
        const texto = td.textContent.trim();
        if (/^BRL\s?\d+,\d{2}$/.test(texto)) aplicarCliqueCopiar(td);
      });

      document.querySelectorAll('tbody tr').forEach(tr => {
        tr.querySelectorAll('td').forEach(td => {
          const texto = td.textContent.trim();
          if (ehBadgeTarifaOuStatus(td)) return;

          if (/^[A-ZÀ-Ú][A-Za-zÀ-ú\s]{5,}$/.test(texto)) aplicarCliqueCopiar(td);
          if (/\d{3,}[-]?\d*/.test(texto) && texto.length <= 20) aplicarCliqueCopiar(td, 'documento');
          if (/^\d{5,}$/.test(texto)) aplicarCliqueCopiar(td);
          if (/\(\d{2}\)\s?\d{4,5}-\d{4}/.test(texto)) aplicarCliqueCopiar(td);
        });
      });

      document.querySelectorAll('.card-coupon-actions').forEach(card => {
        [...card.querySelectorAll('*')].forEach(el => {
          if (el.textContent?.trim() === 'E-mail') {
            const valor = el.nextElementSibling;
            if (valor) aplicarCliqueCopiar(valor);
          }
        });
      });
    }

    /* ---------------- COPY LINK ---------------- */
    function moverBotaoCopiarLink() {
      const modal = document.querySelector('.div-lightbox-content');
      if (!modal) return;

      const input = modal.querySelector('input[type="text"]');
      if (!input) return;

      let wrapper = input.closest('.smart-copy-wrapper');
      let btn = wrapper?.querySelector('.smart-copy-btn');

      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'smart-copy-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
      }

      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'smart-copy-btn';
        btn.textContent = 'Copiar link';

        btn.onclick = async () => {
          if (!isEnabled('copyLink')) return;

          try {
            await navigator.clipboard.writeText(input.value || '');
            setCopiedState(btn, '✅ Copiado', 'Copiar link');
          } catch (e) {
            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');
            setCopiedState(btn, '✅ Copiado', 'Copiar link');
          }
        };

        wrapper.appendChild(btn);
      }

      btn.style.display = isEnabled('copyLink') ? '' : 'none';
    }

    /* ---------------- PRINT HORÁRIOS ---------------- */
    function getHorariosTarget() {
      return document.querySelector('div.sales-step-service');
    }

    function ensureHorariosButton() {
      if (horariosBtn) return horariosBtn;

      horariosBtn = document.createElement('button');
      horariosBtn.id = 'btn-print-smartbus';
      horariosBtn.textContent = '📸 Print Horarios';
      horariosBtn.style.display = 'none';

      horariosBtn.addEventListener('click', async () => {
        if (!isEnabled('horariosPrint')) return;

        await ensureHtml2Canvas();

        const target = getHorariosTarget();
        if (!target || !isVisible(target)) {
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

        try {
          const canvas = await window.html2canvas(target, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true
          });

          canvas.toBlob(async blob => {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              alert('✅ Print copiado com sucesso!');
            } catch (e) {
              console.error(e);
              alert('Erro ao copiar o print.');
            }
          });
        } finally {
          target.scrollTop = originalScrollTop;
          target.style.backgroundColor = originalBg;
          document.body.classList.remove('smartbus-print-force');
          hidden.forEach(({ el, display }) => el.style.display = display);
        }
      });

      document.body.appendChild(horariosBtn);
      return horariosBtn;
    }

    function updateHorariosButtonVisibility() {
      const btn = ensureHorariosButton();
      const target = getHorariosTarget();

      if (isEnabled('horariosPrint') && target && isVisible(target)) {
        btn.style.display = 'block';
      } else {
        btn.style.display = 'none';
      }
    }

    function startHorariosVisibilityObserver() {
      if (horariosVisibilityObserverStarted) return;
      horariosVisibilityObserverStarted = true;

      const observer = new MutationObserver(() => {
        updateHorariosButtonVisibility();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    /* ---------------- PROMO / NORMAL DRAG ---------------- */
    let isMouseDown = false;
    let isDragging = false;
    let dragMode = null;
    let promoDragBound = false;

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

    function bindPromoDragEvents() {
      if (promoDragBound) return;
      promoDragBound = true;

      document.addEventListener('mousedown', e => {
        if (!isEnabled('promoDrag')) return;
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
        if (!isEnabled('promoDrag')) return;
        if (!isMouseDown) return;

        const span = e.target.closest('span.service-price-family');
        if (!span) return;

        isDragging = true;
        dragMode === 'hide' ? hideNumber(span) : showNumber(span);
      });

      document.addEventListener('click', e => {
        if (!isEnabled('promoDrag')) return;

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
    }

    /* ---------------- APPLY ---------------- */
    function applyAll() {
      if (isEnabled('reservaPrint')) createPrintButton();
      else removePrintButton();

      createCopyTrechoButtons();
      aplicarClickCopy();
      moverBotaoCopiarLink();
      updateHorariosButtonVisibility();
    }

    function init() {
      ensureHorariosButton();
      startHorariosVisibilityObserver();
      bindPromoDragEvents();

      setInterval(() => {
        if (location.href !== ultimaURL) {
          ultimaURL = location.href;
          setTimeout(applyAll, 300);
        }
      }, 500);

      const observer = new MutationObserver(() => applyAll());
      observer.observe(document.body, { childList: true, subtree: true });

      applyAll();
    }

    function applyConfig() {
      applyAll();
    }

    return { init, applyConfig };
  })();

  /* =========================================================
     APPLY CONFIG
  ========================================================= */
  function applyFeatureConfig() {
    DocModule.applyConfig();
    ReservaModule.applyConfig();
  }

  /* =========================================================
     START
  ========================================================= */
  function boot() {
    if (!document.body) {
      setTimeout(boot, 300);
      return;
    }

    buildConfigPanel();
    DocModule.init();
    ReservaModule.init();
    applyFeatureConfig();
  }

  boot();
})();
