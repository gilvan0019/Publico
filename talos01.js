// ==UserScript==
// @name         Tallos01
// @namespace    https://tallos.chat.quick.replies.final.ui
// @version      15.0.0
// @description  Respostas rápidas com menu ➕, import/export TXT e tooltips superiores
// @match        https://app.tallos.com.br/app/chat*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TOOLBAR_SELECTOR = '.ql-toolbar.ql-snow';
  const EDITOR_SELECTOR = '.ql-editor';
  const GRUPO_ID = 'tallos-botoes-mensagens';
  const LS_MSGS = 'tallos_msgs_custom';
  const LS_ORDER = 'tallos_msgs_order';
  const HOLD_TIME = 500;

  /* ================= STORAGE ================= */
  const getCustom = () => JSON.parse(localStorage.getItem(LS_MSGS) || '[]');
  const saveCustom = msgs => localStorage.setItem(LS_MSGS, JSON.stringify(msgs));
  const getOrder = () => JSON.parse(localStorage.getItem(LS_ORDER) || '[]');
  const saveOrder = ordem => localStorage.setItem(LS_ORDER, JSON.stringify(ordem));

  /* ================= UTIL ================= */
  function inserirTexto(texto) {
    const editor = document.querySelector(EDITOR_SELECTOR);
    if (!editor) return;
    editor.innerHTML = texto
      .split('\n')
      .map(l => (l.trim() ? `<p>${l}</p>` : '<p><br></p>'))
      .join('');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const copiar = t => navigator.clipboard.writeText(t);

  function feedback(btn) {
    const o = btn.innerHTML;
    btn.innerHTML = '✅';
    setTimeout(() => (btn.innerHTML = o), 400);
  }

  /* ================= IMPORT / EXPORT TXT ================= */
  function exportarTXT() {
    const msgs = getCustom();
    let txt = '';
    msgs.forEach(m => {
      txt += `---MSG---\nICON=${m.icon}\nTITLE=${m.title}\nTEXT=\n${m.texto}\n---END---\n\n`;
    });
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tallos_respostas.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importarTXT() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const blocks = reader.result
          .split('---MSG---')
          .map(b => b.trim())
          .filter(Boolean);

        const novos = blocks.map(b => {
          const icon = (b.match(/ICON=(.*)/) || [,'📝'])[1];
          const title = (b.match(/TITLE=(.*)/) || [,'SEM TITULO'])[1];
          const text = (b.match(/TEXT=\n([\s\S]*?)\n---END---/) || [,''])[1];
          return {
            id: 'IMP_' + crypto.randomUUID(),
            icon,
            title,
            texto: text.trim()
          };
        });

        if (!novos.length) return alert('Arquivo inválido');

        saveCustom(novos);
        saveOrder(novos.map(n => n.id));
        montarBarra(true);
      };
      reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  /* ================= MODAL CRIAR / EDITAR ================= */
  function abrirModalMensagem({ title='', texto='', emoji='📝' }, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0;
      background:rgba(0,0,0,.45);
      display:flex; align-items:center; justify-content:center;
      z-index:999999;
    `;
    const modal = document.createElement('div');
    modal.style.cssText = `
      background:#fff;
      width:560px;
      max-width:95%;
      border-radius:10px;
      padding:16px;
      font-family:sans-serif;
    `;
    modal.innerHTML = `
      <h3>Mensagem</h3>
      <label>Emoji</label>
      <input id="e" value="${emoji}" style="font-size:24px;width:80px;text-align:center"><br><br>
      <label>Título</label>
      <input id="t" value="${title}" style="width:100%;padding:6px"><br><br>
      <label>Texto</label>
      <textarea id="x" style="width:100%;height:220px">${texto}</textarea><br><br>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="c">Cancelar</button>
        <button id="s">Salvar</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#c').onclick = () => overlay.remove();
    modal.querySelector('#s').onclick = () => {
      const t = modal.querySelector('#t').value.trim();
      const x = modal.querySelector('#x').value;
      const e = modal.querySelector('#e').value.trim() || '📝';
      if (!t || !x) return alert('Preencha tudo');
      overlay.remove();
      onConfirm({ title:t, texto:x, emoji:e });
    };
  }

  /* ================= CRUD ================= */
  const adicionarMensagem = () =>
    abrirModalMensagem({}, ({title,texto,emoji}) => {
      const c = getCustom();
      const id = 'CUST_' + Date.now();
      c.push({ id, icon:emoji, title, texto });
      saveCustom(c);
      const o = getOrder(); o.push(id); saveOrder(o);
      montarBarra(true);
    });

  const editarMensagem = msg =>
    abrirModalMensagem(
      { title:msg.title, texto:msg.texto, emoji:msg.icon },
      ({title,texto,emoji}) => {
        const c = getCustom();
        const i = c.findIndex(m => m.id === msg.id);
        if (i < 0) return;
        c[i] = { ...c[i], title, texto, icon:emoji };
        saveCustom(c);
        montarBarra(true);
      }
    );

  const excluirMensagem = msg => {
    if (!confirm(`Excluir "${msg.title}"?`)) return;
    saveCustom(getCustom().filter(m => m.id !== msg.id));
    saveOrder(getOrder().filter(id => id !== msg.id));
    montarBarra(true);
  };

  const mover = (id, dir) => {
    const o = getOrder();
    const i = o.indexOf(id);
    const n = dir === 'left' ? i-1 : i+1;
    if (i<0 || n<0 || n>=o.length) return;
    [o[i], o[n]] = [o[n], o[i]];
    saveOrder(o);
    montarBarra(true);
  };

  /* ================= UI ================= */
  function montarBarra(refresh=false) {
    const toolbar = document.querySelector(TOOLBAR_SELECTOR);
    if (!toolbar) return;

    let grupo = document.getElementById(GRUPO_ID);
    if (grupo && refresh) grupo.remove();
    if (grupo) return;

    grupo = document.createElement('div');
    grupo.id = GRUPO_ID;
    grupo.style.cssText = 'display:flex;gap:1px;margin-right:12px;';

    /* ➕ com menu */
    const plusWrap = document.createElement('div');
    plusWrap.style.position = 'relative';

    const plus = document.createElement('button');
    plus.innerHTML = '➕';
    plus.dataset.tooltip = 'Opções';

    const menu = document.createElement('div');
    menu.style.cssText = `
      position:absolute;
      bottom:28px;
      left:0;
      background:#fff;
      border:1px solid #ccc;
      border-radius:6px;
      padding:4px;
      display:none;
      flex-direction:column;
      z-index:9999;
      box-shadow:0 4px 10px rgba(0,0,0,.15);
    `;

    [
      ['➕ Nova mensagem', adicionarMensagem],
      ['📤 Exportar TXT', exportarTXT],
      ['📥 Importar TXT', importarTXT]
    ].forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.innerText = label;
      b.style.cssText = `
        background:none;
        border:none;
        padding:6px 10px;
        text-align:left;
        cursor:pointer;
        white-space:nowrap;
      `;
      b.onclick = () => { menu.style.display='none'; fn(); };
      menu.appendChild(b);
    });

    plus.onclick = e => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    };

    document.addEventListener('click', () => menu.style.display = 'none');

    plusWrap.appendChild(plus);
    plusWrap.appendChild(menu);
    grupo.appendChild(plusWrap);

    /* mensagens */
    const msgs = getCustom();
    let ordem = getOrder();
    if (!ordem.length) { ordem = msgs.map(m => m.id); saveOrder(ordem); }

    ordem.forEach(id => {
      const msg = msgs.find(m => m.id === id);
      if (!msg) return;

      const wrap = document.createElement('div');
      wrap.className = 'wrap-btn';

      const ctr = document.createElement('div');
      ctr.className = 'controles';

      [
        ['⬅️', () => mover(msg.id,'left')],
        ['✏️', () => editarMensagem(msg)],
        ['🗑️', () => excluirMensagem(msg)],
        ['➡️', () => mover(msg.id,'right')]
      ].forEach(([ico, fn]) => {
        const b = document.createElement('button');
        b.innerHTML = ico;
        b.onclick = fn;
        ctr.appendChild(b);
      });

      const btn = document.createElement('button');
      btn.innerHTML = msg.icon;
      btn.title = msg.title;
      btn.dataset.tooltip = msg.title;

      let t;
      btn.onmousedown = () => t = setTimeout(() => wrap.classList.add('modo-ordem'), HOLD_TIME);
      btn.onmouseup = btn.onmouseleave = () => clearTimeout(t);

      btn.onclick = () => {
        if (!wrap.classList.contains('modo-ordem')) {
          inserirTexto(msg.texto);
          feedback(btn);
        }
      };

      btn.oncontextmenu = e => {
        e.preventDefault();
        copiar(msg.texto);
        feedback(btn);
      };

      wrap.appendChild(ctr);
      wrap.appendChild(btn);
      grupo.appendChild(wrap);
    });

    toolbar.insertBefore(grupo, toolbar.firstChild);
  }

  /* ================= STYLE ================= */
  const style = document.createElement('style');
  style.innerHTML = `
    #${GRUPO_ID} .wrap-btn{position:relative;display:flex;justify-content:center}

    #${GRUPO_ID} .controles{
      position:absolute;
      top:-18px;
      display:none;
      gap:6px;
    }

    #${GRUPO_ID} .wrap-btn.modo-ordem .controles{
      display:flex;
    }

    #${GRUPO_ID} .controles button{
      background:none;
      border:none;
      cursor:pointer;
      font-size:14px;
      padding:0;
    }

    /* TOOLTIP EM CIMA */
    #${GRUPO_ID} button[data-tooltip]{
      position:relative;
    }

    #${GRUPO_ID} button[data-tooltip]::after{
      content: attr(data-tooltip);
      position:absolute;
      top:-34px;
      left:50%;
      transform:translateX(-50%);
      background:#000;
      color:#fff;
      padding:4px 8px;
      border-radius:6px;
      font-size:11px;
      white-space:nowrap;
      opacity:0;
      pointer-events:none;
      transition:opacity .15s ease;
      z-index:99999;
    }

    #${GRUPO_ID} button[data-tooltip]:hover::after{
      opacity:1;
    }
  `;
  document.head.appendChild(style);

  new MutationObserver(() => montarBarra()).observe(document.body,{childList:true,subtree:true});
  montarBarra();
})();
