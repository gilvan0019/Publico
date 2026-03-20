// ==UserScript==
// @name         SMARTBUS01
// @namespace    https://smartbus.unificado
// @version      1.0.5
// @description  Print reserva + copiar trecho + copiar com clique + copiar link
// @match        https://prod-guanabara-frontoffice-smartbus.smarttravelit.com/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @author       GILVAN
// ==/UserScript==

/* =========================================================
   SCRIPT 1 — SMART - Print Reserva
   Só aparece na tela de Reserva
   Captura os blocos corretos da reserva
========================================================= */
(() => {
  'use strict';

  let ultimaURL = location.href;

  function isTelaReserva() {
    const titulo = document.querySelector('.page-title')?.textContent?.trim();
    return titulo === 'Reserva' && !!document.querySelector('div.card.card-coupon-area');
  }

  function removerBotao() {
    const box = document.querySelector('.print-reserva-box-topo');
    if (box) box.remove();
  }

  function criarBotao() {
    if (!isTelaReserva()) {
      removerBotao();
      return;
    }

    const titulo = document.querySelector('.page-title');
    if (!titulo) return;

    if (document.getElementById('btn-print-reserva')) return;

    const header = titulo.parentElement;
    if (!header) return;

    header.style.position = 'relative';

    const box = document.createElement('div');
    box.className = 'print-reserva-box-topo';

    const btn = document.createElement('button');
    btn.id = 'btn-print-reserva';
    btn.textContent = 'Print Reserva';
    btn.addEventListener('click', tirarPrint);

    box.appendChild(btn);
    header.appendChild(box);
  }

  function coletarElementosReserva() {
    const elementos = [];

    const resumo = document.querySelector('div.row.row-coupon-summary.m-b-0');
    if (resumo) elementos.push(resumo);

    const itinerario = document.querySelector('div.card.card-coupon-area');
    if (itinerario) elementos.push(itinerario);

    const colunaValores = itinerario?.nextElementSibling;
    if (
      colunaValores &&
      /valores|pagamentos/i.test(colunaValores.innerText || '')
    ) {
      elementos.push(colunaValores);
    }

    const total = document.querySelector('li.li-total-value');
    if (total) elementos.push(total);

    return elementos.filter(Boolean);
  }

  async function tirarPrint() {
    if (!isTelaReserva()) {
      alert('Essa função só pode ser usada na tela de Reserva.');
      removerBotao();
      return;
    }

    const box = document.querySelector('.print-reserva-box-topo');
    if (box) box.style.display = 'none';

    const elementos = coletarElementosReserva();

    if (!elementos.length) {
      alert('Área da reserva não encontrada.');
      if (box) box.style.display = '';
      return;
    }

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '1400px';
    container.style.background = '#ffffff';
    container.style.padding = '12px';
    container.style.boxSizing = 'border-box';
    container.style.zIndex = '-1';

    const linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.gap = '28px';
    linha.style.alignItems = 'flex-start';

    let colunaEsquerda = null;
    let colunaDireita = null;

    elementos.forEach((el, index) => {
      const clone = el.cloneNode(true);
      clone.style.margin = '0';
      clone.style.boxSizing = 'border-box';

      if (index === 0) {
        clone.style.marginBottom = '16px';
        container.appendChild(clone);
        return;
      }

      if (el.matches('div.card.card-coupon-area')) {
        colunaEsquerda = document.createElement('div');
        colunaEsquerda.style.flex = '0 0 66%';
        colunaEsquerda.appendChild(clone);
        return;
      }

      const texto = (el.innerText || '').toLowerCase();
      if (texto.includes('valores') || texto.includes('pagamentos')) {
        colunaDireita = document.createElement('div');
        colunaDireita.style.flex = '0 0 32%';
        colunaDireita.appendChild(clone);
        return;
      }

      if (el.matches('li.li-total-value')) {
        clone.style.fontSize = '22px';
        clone.style.fontWeight = 'bold';
        clone.style.padding = '14px';
        clone.style.background = '#e8f5e9';
        clone.style.borderTop = '2px solid #4caf50';
        clone.style.textAlign = 'right';
        clone.style.listStyle = 'none';
        clone.style.marginTop = '16px';
        container.appendChild(clone);
      }
    });

    if (colunaEsquerda || colunaDireita) {
      if (colunaEsquerda) linha.appendChild(colunaEsquerda);
      if (colunaDireita) linha.appendChild(colunaDireita);
      container.appendChild(linha);
    }

    document.body.appendChild(container);

    try {
      await new Promise(resolve => requestAnimationFrame(resolve));

      const canvas = await html2canvas(container, {
        scale: 1,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: false
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
      container.remove();
      if (box) box.style.display = '';
    }
  }

  GM_addStyle(`
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
  `);

  setInterval(() => {
    if (location.href !== ultimaURL) {
      ultimaURL = location.href;
      setTimeout(() => {
        removerBotao();
        criarBotao();
      }, 300);
    }
  }, 500);

  const observer = new MutationObserver(() => {
    if (isTelaReserva()) {
      criarBotao();
    } else {
      removerBotao();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (isTelaReserva()) criarBotao();
})();

/* =========================================================
   SCRIPT 2 — Botão Copiar Trecho Individual
========================================================= */
(() => {
  'use strict';

  function criarBotoesCopiar() {
    const trechos = document.querySelectorAll('div.col-search-way');
    if (!trechos.length) return;

    trechos.forEach(container => {
      if (container.querySelector('.btn-copiar-trecho')) return;

      const btn = document.createElement('button');
      btn.className = 'btn-copiar-trecho';
      btn.innerText = 'Copiar';

      btn.addEventListener('click', () => {
        const textos = [];

        container.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textos.push(node.textContent.trim());
          } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            !node.classList.contains('btn-copiar-trecho')
          ) {
            textos.push(node.innerText.trim());
          }
        });

        const textoFinal = textos
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        navigator.clipboard.writeText(textoFinal).then(() => {
          btn.innerText = '✅ Copiado';
          setTimeout(() => {
            btn.innerText = 'Copiar';
          }, 1500);
        }).catch(() => {
          alert('Falha ao copiar para a área de transferência');
        });
      });

      container.style.position = 'relative';
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

  const observer = new MutationObserver(() => {
    criarBotoesCopiar();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  criarBotoesCopiar();
})();

/* =========================================================
   SCRIPT 3 — Copiar com Clique
========================================================= */
(() => {
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

    el.dataset.copiarAtivo = 'true';

    el.style.border = '1px dashed gray';
    el.style.padding = '3px 8px';
    el.style.borderRadius = '6px';
    el.style.cursor = 'pointer';
    el.title = 'Clique para copiar';

    el.addEventListener('click', (e) => {
      e.stopPropagation();

      let texto = el.textContent?.trim() || '';
      if (!texto) return;

      if (tipo === 'documento') {
        texto = normalizarDocumento(texto);
      }

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
    const modal = document.querySelector('.div-lightbox-content');
    if (!modal) return;

    const input = modal.querySelector('input[type="text"]');
    if (!input || input.dataset.smartCopy) return;

    input.dataset.smartCopy = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'smart-copy-wrapper';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.className = 'smart-copy-btn';
    btn.textContent = 'Copiar link';

    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(input.value || '');
        btn.textContent = '✅ Copiado';
        setTimeout(() => {
          btn.textContent = 'Copiar link';
        }, 1200);
      } catch (e) {
        input.select();
        input.setSelectionRange(0, 99999);
        document.execCommand('copy');
        btn.textContent = '✅ Copiado';
        setTimeout(() => {
          btn.textContent = 'Copiar link';
        }, 1200);
      }
    };

    wrapper.appendChild(btn);
  }

  const observer = new MutationObserver(() => {
    aplicar();
    moverBotao();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  aplicar();
  moverBotao();
})();
