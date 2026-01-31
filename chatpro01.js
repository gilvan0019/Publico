// ==UserScript==
// @name         ChatPro01
// @namespace    https://chatpro.copy.direct
// @version      1.2.0
// @description  Copiar mensagens por clique/seleção + botão no header para copiar telefone (sem bloquear imagens/cards)
// @author       GILVAN
// @match        https://app.chatpro.com.br/chat*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     ======================= ESTILOS =========================
     ========================================================= */
  GM_addStyle(`
    .chatpro-msg {
      border: 2px dashed transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: border .15s ease, background .15s ease;
    }

    .chatpro-msg:hover {
      border-color: rgba(0,120,255,.35);
      background: rgba(0,120,255,.04);
    }

    .chatpro-copiado {
      border-color: rgba(34,197,94,.7)!important;
    }

    #chatpro-copy-phone {
      margin-left: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      border: none;
      background: #722F37;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }
  `);

  /* =========================================================
     ================== PARTE 1 — CHAT =======================
     ========================================================= */

  const MSG_CONTAINER = '.message, .chat-message, .msg';
  const MSG_TEXT = '.msg-text';

  function copiarTexto(texto, el) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      el?.classList.add('chatpro-copiado');
      setTimeout(() => el?.classList.remove('chatpro-copiado'), 500);
    });
  }

  function prepararMensagem(msg) {
    if (msg.dataset.chatproReady) return;

    msg.classList.add('chatpro-msg');

    msg.addEventListener('click', e => {

      // 🔴 NÃO INTERFERIR EM ELEMENTOS NATIVOS
      if (
        e.target.closest('img') ||
        e.target.closest('a') ||
        e.target.closest('button') ||
        e.target.closest('[role="button"]')
      ) {
        return; // deixa o ChatPro agir
      }

      const sel = window.getSelection();
      const txtSel = sel?.toString().trim();

      // ✔ Copiar apenas quando for TEXTO
      if (txtSel && msg.contains(sel.anchorNode)) {
        e.stopPropagation();
        copiarTexto(txtSel, msg);
      } else {
        const texto =
          msg.querySelector(MSG_TEXT)?.innerText.trim() ||
          msg.innerText.trim();

        if (texto) {
          e.stopPropagation();
          copiarTexto(texto, msg);
        }
      }

      sel?.removeAllRanges();
    });

    msg.dataset.chatproReady = 'true';
  }

  function aplicarMensagens() {
    document.querySelectorAll(MSG_CONTAINER).forEach(prepararMensagem);
  }

  /* =========================================================
     ================== PARTE 2 — TELEFONE ===================
     ========================================================= */

  function limparTelefone(t) {
    return t.replace(/\D+/g, '').replace(/^55/, '');
  }

  function obterTelefoneDireto() {
    const h2s = [...document.querySelectorAll('h2')];
    return h2s.find(h => /^\+?\d[\d\s()-]{8,}$/.test(h.innerText));
  }

  function criarBotaoHeader() {
    const header = document.querySelector('header.chat-messages-header');
    if (!header) return;

    if (header.querySelector('#chatpro-copy-phone')) return;

    const btn = document.createElement('button');
    btn.id = 'chatpro-copy-phone';
    btn.innerText = '📞 Copiar';

    btn.onclick = async () => {
      const telEl = obterTelefoneDireto();
      if (!telEl) return alert('Telefone não encontrado');

      const tel = limparTelefone(telEl.innerText);
      await navigator.clipboard.writeText(tel);

      btn.innerText = '✅ Copiado';
      setTimeout(() => (btn.innerText = '📞 Copiar'), 1500);
    };

    header.appendChild(btn);
  }

  /* =========================================================
     ======================= START ===========================
     ========================================================= */

  function startTudo() {
    aplicarMensagens();
    criarBotaoHeader();

    new MutationObserver(() => {
      aplicarMensagens();
      criarBotaoHeader();
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  const wait = setInterval(() => {
    if (document.querySelector('header.chat-messages-header')) {
      clearInterval(wait);
      startTudo();
    }
  }, 300);

})();
