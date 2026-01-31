// ==UserScript==
// @name         Tallos02
// @namespace    https://tallos.chat.full.tools
// @version      1.1.0
// @description  Copiar mensagens por clique/seleção + botão copiar telefone limpo + botões customizados
// @author       GILVAN
// @match        https://app.tallos.com.br/app/chat*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     ======================= ESTILOS =========================
     ========================================================= */
  GM_addStyle(`
    .bg-message-from-customer,
    .bg-message-from-agent,
    .bg-message-from-employee {
      border: 2px dashed rgba(106, 0, 255, 0);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease;
    }

    .bg-message-from-customer:hover,
    .bg-message-from-agent:hover,
    .bg-message-from-employee:hover {
      border-color: rgba(106, 0, 255, .35);
      background: rgba(106, 0, 255, .04);
    }

    .tallos-copiado {
      border-color: rgba(34,197,94,.6)!important;
    }

    #tallos-btn-telefone{
      position:fixed;
      top:72px;
      right:300px;
      z-index:999999;
      padding:6px 10px;
      border-radius:8px;
      border:1px solid #ccc;
      background:#276d9b;
      color:#fff;
      cursor:pointer;
      font-size:14px;
      box-shadow:0 2px 6px rgba(0,0,0,.25);
    }
  `);

  /* =========================================================
     ================== PARTE 1 — CHAT =======================
     ========================================================= */

  const MSG_SELECTOR =
    '.bg-message-from-customer, .bg-message-from-agent, .bg-message-from-employee';

  function copiarTexto(texto, el) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      if (el) {
        el.classList.add('tallos-copiado');
        setTimeout(() => el.classList.remove('tallos-copiado'), 500);
      }
    });
  }

  function prepararMensagem(msg) {
    if (msg.dataset.tallosReady) return;

    msg.addEventListener('click', e => {
      e.stopPropagation();
      const sel = window.getSelection();
      const txtSel = sel?.toString().trim();

      if (txtSel && msg.contains(sel.anchorNode)) {
        copiarTexto(txtSel, msg);
      } else {
        copiarTexto(msg.innerText.trim(), msg);
      }
      sel?.removeAllRanges();
    });

    msg.dataset.tallosReady = 'true';
  }

  function aplicarMensagens() {
    document.querySelectorAll(MSG_SELECTOR).forEach(prepararMensagem);
  }

  function iniciarChatSeguro() {
    aplicarMensagens();
    new MutationObserver(aplicarMensagens).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /* =========================================================
     ================== PARTE 2 — TELEFONE ===================
     ========================================================= */

  const BOTAO_ID = 'tallos-btn-telefone';

  function limparTelefone(t) {
    return t.replace(/\|/g,'').replace(/\s+/g,'').replace(/^55/,'');
  }

  function criarBotaoTelefone() {
    if (document.getElementById(BOTAO_ID)) return;

    const btn = document.createElement('button');
    btn.id = BOTAO_ID;
    btn.innerText = 'Copiar Telefone';

    btn.onclick = async () => {
      const item = document.querySelector('.d-flex.align-items-center.list-item-heading');
      if (!item) return alert('Telefone não encontrado');

      const cont = item.closest('.list-item') || item.parentElement;
      const telEl = cont?.querySelector('.text-muted');
      if (!telEl) return alert('Telefone não encontrado');

      const tel = limparTelefone(telEl.innerText);
      await navigator.clipboard.writeText(tel);
      btn.innerText = 'Copiado';
      setTimeout(()=>btn.innerText='Copiar Telefone',1500);
    };

    document.body.appendChild(btn);
  }

  function removerBotaoTelefone() {
    document.getElementById(BOTAO_ID)?.remove();
  }

  function verificarTelefone() {
    const existe = document.querySelector('.d-flex.align-items-center.list-item-heading');
    existe ? criarBotaoTelefone() : removerBotaoTelefone();
  }

  /* =========================================================
     ======================= START ===========================
     ========================================================= */

  function startTudo() {
    iniciarChatSeguro();
    verificarTelefone();

    new MutationObserver(verificarTelefone).observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  const wait = setInterval(() => {
    if (document.querySelector('#chat-messages-wrapper')) {
      clearInterval(wait);
      startTudo();
    }
  }, 300);

})();
