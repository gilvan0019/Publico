// ==UserScript==
// @name         SMARTBUS01
// @namespace    https://smartbus.unificado
// @version      1.0.0
// @description  Print reserva + copiar trecho + copiar com clique + copiar link
// @match        https://prod-guanabara-frontoffice-smartbus.smarttravelit.com/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @author       GILVAN
// ==/UserScript==


/* =========================================================
   SCRIPT 1 — SMART - Print Reserva
========================================================= */
(() => {
 'use strict';

  const SELECTORS = [
    'div.row.row-coupon-summary.m-b-0',
    'div.card.card-coupon-area',
    'li.li-total-value'
  ];

  let botaoCriado = false;
  let ultimaURL = location.href;

  function criarBotao() {
    const card = document.querySelector('div.card.card-coupon-area');
    if (!card) return;

    if (document.getElementById('btn-print-reserva')) return;

    botaoCriado = true;

    const box = document.createElement('div');
    box.className = 'print-reserva-box';

    const btn = document.createElement('button');
    btn.id = 'btn-print-reserva';
    btn.textContent = 'Print Reserva';
    btn.addEventListener('click', tirarPrint);

    box.appendChild(btn);
    card.prepend(box);
  }

  async function tirarPrint() {
    const box = document.querySelector('.print-reserva-box');
    if (box) box.style.display = 'none';

    const elementos = SELECTORS
      .map(sel => document.querySelector(sel))
      .filter(Boolean);

    if (!elementos.length) {
      alert('Área da reserva não encontrada.');
      if (box) box.style.display = '';
      return;
    }

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.background = '#fff';
    container.style.padding = '16px';
    container.style.width = '1000px';

    for (const el of elementos) {
      const clone = el.cloneNode(true);

      if (clone.matches('li.li-total-value')) {
        clone.style.fontSize = '24px';
        clone.style.fontWeight = 'bold';
        clone.style.padding = '16px';
        clone.style.background = '#e8f5e9';
        clone.style.borderTop = '2px solid #4caf50';
        clone.style.textAlign = 'right';
      }

      clone.style.marginBottom = '16px';
      container.appendChild(clone);
    }

    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 1.5,
        backgroundColor: '#fff',
        logging: false,
        useCORS: true
      });

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      alert('Print copiado para a área de transferência!');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar o print.');
    } finally {
      document.body.removeChild(container);
      if (box) box.style.display = '';
    }
  }

  GM_addStyle(`
    .print-reserva-box {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
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
  `);

  /* ================================
     OBSERVA MUDANÇA DE ROTA (SPA)
  ================================= */
  setInterval(() => {
    if (location.href !== ultimaURL) {
      ultimaURL = location.href;
      botaoCriado = false;

      // pequeno delay para o DOM montar
      setTimeout(criarBotao, 500);
    }
  }, 500);

  /* ================================
     OBSERVA DOM NORMAL
  ================================= */
  const observer = new MutationObserver(criarBotao);
  observer.observe(document.body, { childList: true, subtree: true });

})();


/* =========================================================
   SCRIPT 2 — Botão Copiar Trecho Individual
========================================================= */
(function () {
  'use strict';

  function criarBotoesCopiar() {
    const trechos = document.querySelectorAll("div.col-search-way");
    if (!trechos.length) return;

    trechos.forEach(container => {
      if (container.querySelector(".btn-copiar-trecho")) return;

      const btn = document.createElement("button");
      btn.className = "btn-copiar-trecho";
      btn.innerText = "Copiar";

      btn.addEventListener("click", () => {
        const textos = [];
        container.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textos.push(node.textContent.trim());
          } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('btn-copiar-trecho')) {
            textos.push(node.innerText.trim());
          }
        });

        const textoFinal = textos.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        navigator.clipboard.writeText(textoFinal).then(() => {
          btn.innerText = "✅ Copiado";
          setTimeout(() => btn.innerText = "Copiar", 1500);
        }).catch(() => {
          alert("Falha ao copiar para a área de transferência");
        });
      });

      container.style.position = "relative";
      container.appendChild(btn);
    });
  }

  GM_addStyle(`
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
  `);

  const observer = new MutationObserver(criarBotoesCopiar);
  observer.observe(document.body, { childList: true, subtree: true });

})();


/* =========================================================
   SCRIPT 3 — Copiar com Clique
========================================================= */
(function () {
  'use strict';

  function isReserva() {
    return document.querySelector('.page-title')?.textContent?.trim() === 'Reserva';
  }

  function normalizarDocumento(texto) {
    if (texto.includes('-')) {
      return texto.split('-').slice(1).join('-').trim();
    }
    return texto.trim();
  }

  function ehBadgeTarifaOuStatus(el) {
    const texto = el.textContent?.trim();
    if (!texto) return false;
    if (texto === 'NORMAL' || texto === 'Cancelado') return true;
    if (el.closest('.badge, .label')) return true;
    return false;
  }

  function aplicarCliqueCopiar(el, tipo = 'normal') {
    if (!el || el.dataset.copiarAtivo) return;
    if (ehBadgeTarifaOuStatus(el)) return;

    let texto = el.textContent?.trim();
    if (!texto) return;

    if (tipo === 'documento') {
      texto = normalizarDocumento(texto);
    }

    el.dataset.copiarAtivo = 'true';

    el.style.border = '1px dashed gray';
    el.style.padding = '3px 8px';
    el.style.borderRadius = '6px';
    el.style.cursor = 'pointer';
    el.title = 'Clique para copiar';

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(texto);

      el.style.borderColor = 'green';
      el.style.backgroundColor = '#e6f4ea';

      setTimeout(() => {
        el.style.borderColor = 'darkred';
        el.style.backgroundColor = 'transparent';
      }, 1200);
    });
  }

  function aplicar() {
    if (!isReserva()) return;

    document.querySelectorAll('label.control.coupon-summary-value').forEach(el => {
      const texto = el.textContent.trim();
      if (/^[A-Z0-9]{5,8}$/.test(texto)) aplicarCliqueCopiar(el);
    });

    document.querySelectorAll('.col-coupon-service-title b').forEach(el => aplicarCliqueCopiar(el));

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

  const observer = new MutationObserver(aplicar);
  observer.observe(document.body, { childList: true, subtree: true });

  aplicar();
  GM_addStyle(`
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
  `);

  function moverBotao() {
    // modal correto
    const modal = document.querySelector('.div-lightbox-content');
    if (!modal) return;

    // input "Dados"
    const input = modal.querySelector('input[type="text"]');
    if (!input || input.dataset.smartCopy) return;

    input.dataset.smartCopy = 'true';

    // cria wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'smart-copy-wrapper';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // cria botão
    const btn = document.createElement('button');
    btn.className = 'smart-copy-btn';
    btn.textContent = 'Copiar link';

    btn.onclick = () => {
      input.select();
      input.setSelectionRange(0, 99999);
      document.execCommand('copy');
      btn.textContent = '✅ Copiado';
      setTimeout(() => (btn.textContent = 'Copiar link'), 1200);
    };

    wrapper.appendChild(btn);
  }

  new MutationObserver(moverBotao).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
