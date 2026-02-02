// ==UserScript==
// @name         OCR 0102
// @namespace    http://tampermonkey.net/
// @version      6.1.0
// @description  OCR com layout flutuante, linhas numeradas e nomes em vermelho no BB
// @match        https://app.chatpro.com.br/chat*
// @grant        GM_addStyle
// @author       GILVAN
// ==/UserScript==
const registrosOCR = [];

(async function () {
    'use strict';
    const arquivosAnexados = new Set();
    /* ========= LOAD LIBS ========= */
    function load(src){
        return new Promise(r=>{
            const s=document.createElement('script');
            s.src=src;
            s.onload=r;
            document.head.appendChild(s);
        });
    }
    if (!window.XLSX)
        await load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');

    if(!window.Tesseract)
        await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

    if(!window.pdfjsLib){
        await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    function gerarId() {
        return 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    }

    function restaurarCardsDaTela() {
        registrosOCR.forEach(r => {

            const body = criarDoc(r.arquivo || '');

            body.dataset.salvo = '1';
            body.dataset.ocrId = r.id;

            atualizarVisualFinal(body); // ✅ ESSENCIAL
        });

        atualizarContador();
        atualizarTotalTela();
    }
    function calcularTotalTela() {
    let total = 0;

    registrosOCR.forEach(r => {
        const pix = parseValor(r.valor);
        const taxa = Number(r.taxa || 0);

        if (pix.numero !== null) {
            total += pix.numero - taxa;
        }
    });

    return total;
}
function calcularTaxaServico(valor) {
  if (valor <= 150) return 0.18;
  if (valor <= 300) return 0.12;
  if (valor <= 450) return 0.10;
  return 0.06;
}

  function atualizarVisualFinal(body) {
    if (!body) return;

    const id = body.dataset.ocrId;
    if (!id) return;

    const r = registrosOCR.find(x => x.id === id);
    if (!r) return;

    const pix = parseValor(r.valor);
    const taxa = Number(r.taxa || 0);

    let pixLiquidoTxt = r.valor || '-';

    if (pix.numero !== null) {
        const liquido = pix.numero - taxa;
        pixLiquidoTxt = liquido
            .toFixed(2)
            .replace('.', ',');
    }

    body.innerHTML = `
      <div class="doc-line doc-final">
        <span class="final-nome">${r.nome || '-'}</span>
        <span class="final-hora">${r.hora || '-'}</span>
        <span class="final-pix">R$ ${pixLiquidoTxt}</span>
        <span class="final-taxa">
          ${taxa > 0 ? `R$ ${taxa.toFixed(2).replace('.', ',')}` : '-'}
        </span>
      </div>
    `;
}



    function atualizarTotalTela() {
        const total = calcularTotalTela();
        totalTela.textContent =
            `TOTAL R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    }
    GM_addStyle(`
.ocr-overlay{
  position: fixed;
  top: 120px;
  left: 120px;
  width: auto;
  height: auto;
  z-index: 999999;
  font-family: Arial;
}

.ocr-box{
  width:600px;
  max-height:85vh;
  background:#fff;
  border-radius:16px;
  padding:28px 16px 16px 16px; /* 🔼 mais espaço no topo */
  overflow:auto;
  box-shadow:0 15px 40px rgba(0,0,0,.35);
  cursor:move;
}

.ocr-drop{
  border: 2px dashed #414345;
  padding: 28px;
  text-align: center;
  border-radius: 18px;
  font-weight: bold;
  font-size: 15px;
  color: #1e3c72;
  margin-bottom: 10px;
  cursor: pointer;
  background: #f5f8ff;
  margin-top: 30px;
}

.ocr-input,
.ocr-select {
  height: 42px;
  padding: 10px 14px;
  border-radius: 18px;
  border: 1px solid #ccc;
  font-size: 14px;
  margin-top: 4px !important;
  margin-bottom: 4px;
}

/* 🔧 remove estilo nativo do select */
.ocr-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 40px;          /* espaço da seta */
  background-image:
    linear-gradient(45deg, transparent 50%, #555 50%),
    linear-gradient(135deg, #555 50%, transparent 50%);
  background-position:
    calc(100% - 20px) 17px,
    calc(100% - 14px) 17px;
  background-size: 6px 6px;
  background-repeat: no-repeat;
}

.doc{
  border:1px solid #e0e0e0;
  border-radius:14px;
  margin-bottom:12px;
  background:#fafafa
}

.doc-header{
  padding:12px;
  font-weight:bold;
  cursor:pointer;
  display:flex;
  justify-content:space-between
}

.doc-body{
  display:none;
  padding:10px;
  font-size:13px
}

.doc-actions{
  display:flex;
  gap:10px;
  padding:10px
}

.doc-actions button{
  flex:1;
  padding:10px;
  border:0;
  border-radius:999px;
  font-weight:bold;
  cursor:pointer;
  font-size:13px
}

.copy {
  transition:
    background 0.25s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease,
    filter 0.15s ease;
}

.copy:hover {
  background: linear-gradient(135deg, #1e88e5, #1565c0);
  box-shadow: 0 6px 14px rgba(30,136,229,0.35);
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.copy:active {
  transform: translateY(0);
  box-shadow: 0 3px 8px rgba(30,136,229,0.25);
}

.copy,
.remove {
  transition: filter 0.2s ease;
}

/* escurece levemente */
.copy:hover,
.remove:hover {
  filter: brightness(0.85);
  cursor: pointer;
}

/* clique */
.copy:active,
.remove:active {
  filter: brightness(0.75);
}

.btn-green {
  background: linear-gradient(135deg, #232526, #414345);
  color: #fff;
  border: 0;
  border-radius: 999px;
  padding: 12px;
  font-weight: bold;
  cursor: pointer;
}

.btn-green:hover {
  filter: brightness(1.15);
}
.ocr-actions-bottom {
  display: flex;
  gap: 14px;
  margin-top: 16px;
}

.ocr-actions-bottom button {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  font-size: 14px;
}
.ocr-actions-bottom button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.doc-final {
  display: flex;
  gap: 10px;
  font-size: 14px;
  font-weight: bold;
}
.final-nome {
  color: #212121;
}

.final-hora {
  color: #757575;
}

.final-valor {
  color: #0d47a1;
}
.ocr-top-actions {
  position: absolute;
  top: 12px;
  right: 16px;
  display: flex;
  gap: 8px;
}
/* ================= FULLSCREEN LIMPO E ESTÁVEL ================= */

.ocr-overlay.fullscreen {
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
}

.ocr-overlay.fullscreen .ocr-box {
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  border-radius: 0 !important;
  cursor: default !important;
}

/* ===== CORREÇÃO: TUDO NA MESMA LINHA ===== */

/* o card vira a linha */
.ocr-overlay.fullscreen .doc {
  display: flex !important;
  align-items: center;
  gap: 14px;
}

/* corpo com info */
.ocr-overlay.fullscreen .doc-body {
  display: flex !important;
  align-items: center;
  gap: 14px;
  padding: 0;
  flex: 1;                 /* ocupa o espaço do meio */
}

/* info interna */
.ocr-overlay.fullscreen .doc-final {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* botões no fim da MESMA linha */
.ocr-overlay.fullscreen .doc-actions {
  display: flex !important;
  gap: 6px;
  padding: 0;
  margin: 0;
}

/* botões pequenos */
.ocr-overlay.fullscreen .doc-actions button {
  flex: none !important;
  padding: 4px 8px;
  font-size: 11px;
  height: 26px;
  border-radius: 6px;
}

/* ===== FEEDBACK NO BOTÃO COPIAR ===== */

.copy {
  transition: background 0.2s ease, filter 0.2s ease;
}

.copy.copiado {
  background: linear-gradient(135deg, #2e7d32, #1b5e20) !important;
  color: #fff;
}

.copy.copiado::before {
  content: "";
}
/* REMOVE O TRIÂNGULO DO HEADER */
.doc-header span {
  display: none !important;
}

.ocr-box {
  width: 600px;
  max-height: 85vh;
  background: #fff;
  border-radius: 16px;
  padding: 22px 16px 16px 16px;
  overflow: hidden;      /* 🔒 certo */
  box-shadow: 0 15px 40px rgba(0,0,0,.35);
  cursor: move;
  display: flex;
  flex-direction: column;
}

/* 📜 LISTA ROLÁVEL (CORRETO) */
.ocr-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  margin-bottom: 8px;
}
/* BARRA DE AÇÕES NO FUNDO */
.ocr-actions-bottom {
  margin-top: auto;
  padding-top: 10px;
  background: #fff;
}
/* 🔒 altura fixa dos campos */
.ocr-input,
.ocr-select {
  box-sizing: border-box;
  border-radius: 18px !important;
}


.ocr-info {
  margin: 8px 0 10px 0;
  padding-left: 2px;
  font-size: 13px;
  font-weight: bold;
  color: #0d47a1;
  line-height: 1.4;
}

/* 👤 NOME + SELECT JUNTOS */
.ocr-header-form {
  display: flex;
  flex-direction: column;   /* um embaixo do outro */
  gap: 10px;
  margin-bottom: 14px;
}

/* 💻 EM TELA CHEIA, SE QUISER LADO A LADO */
.ocr-overlay.fullscreen .ocr-header-form {
  flex-direction: row;
  gap: 14px;
}

.ocr-overlay.fullscreen .ocr-header-form .ocr-input,
.ocr-overlay.fullscreen .ocr-header-form .ocr-select {
  flex: 1;
}
/* ================== 🌙 MODO ESCURO ================== */

.ocr-overlay.dark .ocr-box {
  background: #1e1e1e;
  color: #e0e0e0;
  box-shadow: 0 20px 50px rgba(0,0,0,.6);
}

/* DROP */
.ocr-overlay.dark .ocr-drop {
  background: #2a2a2a;
  border-color: #555;
  color: #90caf9;
}

/* INPUTS */
/* 👤 INPUT DO NOME – CINZA CLARO NO DARK */
.ocr-overlay.dark .ocr-input {
  background: #2b2b2b !important;  /* cinza claro */
  color: #fff !important;         /* letra preta */
  border: 1px solid #555 !important;
}

/* placeholder (se houver) */
.ocr-overlay.dark .ocr-input::placeholder {
  color: #444 !important;
}

/* SELECT SETA */
.ocr-overlay.dark .ocr-select {
  background-image:
    linear-gradient(45deg, transparent 50%, #bbb 50%),
    linear-gradient(135deg, #bbb 50%, transparent 50%);
}

/* INFO (ARQUIVO / TOTAL) */
.ocr-overlay.dark .ocr-info {
  color: #90caf9;
}

/* CARDS */
.ocr-overlay.dark .doc {
  background: #252525;
  border-color: #444;
}

.ocr-overlay.dark .doc-header {
  color: #e0e0e0;
}

/* TEXTO FINAL */
.ocr-overlay.dark .final-nome {
  color: #fff;
}
.ocr-overlay.dark .final-hora {
  color: #b0b0b0;
}
.ocr-overlay.dark .final-valor {
  color: #81c784;
}

/* BOTÕES */
.ocr-overlay.dark .copy {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
}

.ocr-overlay.dark .remove {
  background: linear-gradient(135deg, #8e0000, #c62828);
}

.ocr-overlay.dark .btn-green {
  background: linear-gradient(135deg, #111, #333);
}

/* LISTA SCROLL */
.ocr-overlay.dark .ocr-list::-webkit-scrollbar {
  width: 8px;
}
.ocr-overlay.dark .ocr-list::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 6px;
}
.ocr-overlay.dark .ocr-list::-webkit-scrollbar-track {
  background: #1e1e1e;
}

/* ===== SELECT NO MODO ESCURO ===== */
.ocr-overlay.dark .ocr-select {
  background-color: #2b2b2b;
  color: #f1f1f1;
  border: 1px solid #555;
}

/* seta do select no dark */
.ocr-overlay.dark .ocr-select {
  background-image:
    linear-gradient(45deg, transparent 50%, #ccc 50%),
    linear-gradient(135deg, #ccc 50%, transparent 50%);
}
/* ===== RODAPÉ NO MODO ESCURO ===== */
.ocr-overlay.dark .ocr-actions-bottom {
  background: #1e1e1e;
  border-top: 1px solid #333;
}

/* ===== SELECT DARK MODE - DEFINITIVO ===== */
.ocr-overlay.dark select,
.ocr-overlay.dark select:focus,
.ocr-overlay.dark select:active {
  background-color: #2b2b2b !important;
  color: #ffffff !important;
  border: 1px solid #555 !important;
  outline: none !important;
}

/* texto da opção selecionada */
.ocr-overlay.dark select option {
  background-color: #2b2b2b;
  color: #ffffff;
}

/* quando o dropdown abre */
.ocr-overlay.dark select option:checked {
  background-color: #1e1e1e;
  color: #90caf9;
}
.ocr-overlay.dark {
  color-scheme: dark;
}
/* 🌙 BOTÕES INVERTIDOS NO MODO ESCURO */
.ocr-overlay.dark .ocr-actions-bottom button {
  background: #e0e0e0 !important;   /* cinza claro */
  color: #111 !important;           /* texto escuro */
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

/* hover */
.ocr-overlay.dark .ocr-actions-bottom button:hover {
  background: #ffffff !important;
  filter: none !important;
}

/* botão fechar com destaque */
.ocr-overlay.dark .ocr-actions-bottom button:last-child {
  color: #c62828 !important;
}

/* ícone do fechar */
.ocr-overlay.dark .ocr-actions-bottom button:last-child svg,
.ocr-overlay.dark .ocr-actions-bottom button:last-child span {
  color: #c62828 !important;
}


/* texto das opções quando abre */
.ocr-overlay.dark select option {
  color: #fff !important;           /* texto preto */
  background: #2b2b2b !important;   /* fundo claro */
}

/* opção selecionada */
.ocr-overlay.dark select option:checked {
  color: #fff !important;
  background: #2b2b2b !important;
}


.taxa:hover{
  filter: brightness(0.9);
}

.editar:hover{
  filter: brightness(0.9);
}
.edit-field {
  background: #fffbe6;
  border: 1px dashed #000;
  border-radius: 6px;
  padding: 2px 6px;
  outline: none;
}

.ocr-overlay.dark .edit-field {
  background: #333;
  border-color: #fff;
  color: #fff;
}
.editable {
    margin: 8px 0;
}

.edit {
    display: inline-block;
    padding: 5px 10px;
    border: 1px solid #ccc;
    border-radius: 8px;
    cursor: pointer;
}

.edit:hover {
    background-color: #f0f0f0;
}

.edit[contenteditable="true"] {
    background-color: #fff;
    border: 1px solid #3f51b5;
}

.edit[contenteditable="true"]:empty:before {
    content: "Clique para editar";
    color: #aaa;
}

.save {
    background: linear-gradient(135deg, #6a1b9a, #8e24aa);
    color:#fff;
    border: 0;
    border-radius: 999px;
    font-weight: bold;
    cursor: pointer;
}

.save:hover {
    filter: brightness(0.9);
}
.final-pix {
  color: #0d47a1;
  font-weight: bold;
}

.final-taxa {
  color: #ff8f00;
  font-weight: bold;
}
/* ===== BOTÕES – ESTADO NEUTRO ===== */
.doc-actions button{
  background: #f1f3f5;          /* cinza claro (não branco) */
  color: #374151;               /* texto cinza escuro */
  border: 1px solid #d0d7de;    /* borda visível */
  border-radius: 999px;
  font-weight: 600;
  transition:
    background .25s ease,
    color .25s ease,
    box-shadow .25s ease,
    transform .15s ease;
}

/* leve destaque ao passar o mouse (antes da cor) */
.doc-actions button:hover{
  box-shadow: 0 4px 10px rgba(0,0,0,.12);
  transform: translateY(-1px);
}
/* =====================================================
   BOTÕES – ESTADO NEUTRO (CINZA CLARO AJUSTADO)
===================================================== */
.doc-actions button{
  flex: 1;
  padding: 10px;
  background: #ecebea;
border: 1px solid #d2d0cd;
  color: #374151;
  border-radius: 999px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition:
    background .25s ease,
    color .25s ease,
    box-shadow .25s ease,
    transform .15s ease;
}

/* leve elevação no hover (sem cor) */
.doc-actions button:hover{
  box-shadow: 0 4px 10px rgba(0,0,0,.12);
  transform: translateY(-1px);
}

/* =====================================================
   CORES ORIGINAIS NO HOVER
===================================================== */

/* 📋 COPIAR — AZUL */
.doc-actions .copy:hover{
  background: linear-gradient(135deg,#1e3a8a,#2563eb);
  color: #fff;
  border-color: transparent;
}

/* ✏️ EDITAR — ROXO */
.doc-actions .editar:hover{
  background: linear-gradient(135deg,#5b21b6,#7c3aed);
  color: #fff;
  border-color: transparent;
}

/* 💰 TAXA — AMARELO */
.doc-actions .taxa:hover{
  background: linear-gradient(135deg,#d97706,#f59e0b);
  color: #fff;
  border-color: transparent;
}

/* ➖ REMOVER — VERMELHO */
.doc-actions .remove:hover{
  background: linear-gradient(135deg,#991b1b,#dc2626);
  color: #fff;
  border-color: transparent;
}
/* ===============================
   DARK MODE — ESTADO NEUTRO
================================ */
.ocr-overlay.dark .doc-actions button{
  background: #1f1f1f;      /* cinza escuro (quase preto) */
  color: #e5e7eb;
  border: 1px solid #3a3a3a;
  box-shadow: none;
}
/* ===============================
   DARK MODE — HOVERS COLORIDOS
================================ */

/* 📋 COPIAR — AZUL */
.ocr-overlay.dark .doc-actions .copy:hover{
  background: linear-gradient(135deg,#1e3a8a,#2563eb) !important;
  color:#fff !important;
  border-color: transparent !important;
}

/* ✏️ EDITAR — ROXO */
.ocr-overlay.dark .doc-actions .editar:hover{
  background: linear-gradient(135deg,#5b21b6,#7c3aed) !important;
  color:#fff !important;
  border-color: transparent !important;
}

/* 💰 TAXA — AMARELO */
.ocr-overlay.dark .doc-actions .taxa:hover{
  background: linear-gradient(135deg,#d97706,#f59e0b) !important;
  color:#fff !important;
  border-color: transparent !important;
}

/* ➖ REMOVER — VERMELHO */
.ocr-overlay.dark .doc-actions .remove:hover{
  background: linear-gradient(135deg,#991b1b,#dc2626) !important;
  color:#fff !important;
  border-color: transparent !important;
}
/* 🔝 CONTAINER DOS BOTÕES SUPERIORES */
.ocr-top-actions {
  position: absolute;
  top: 12px;        /* 👈 DESCE OS DOIS JUNTOS */
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 10;
}

/* 🔘 BOTÕES DO TOPO */
.ocr-top-actions button {
  background: linear-gradient(135deg,#232526,#414345);
  color: #fff;
  border: none;
  width: 34px;
  height: 34px;
  border-radius: 10px; /* quadrado arredondado */
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0,0,0,.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* hover bonito */
.ocr-top-actions button:hover {
  filter: brightness(1.15);
}
/* 🌙 DARK MODE — INVERTER BOTÕES DO TOPO */
.ocr-overlay.dark .ocr-top-actions button {
  background: #e0e0e0 !important;   /* fundo claro */
  color: #111 !important;           /* ícone escuro */
  box-shadow: 0 4px 10px rgba(0,0,0,0.6);
}

/* hover no dark */
.ocr-overlay.dark .ocr-top-actions button:hover {
  background: #ffffff !important;
  filter: none !important;
}


.ocr-overlay.dark .final-pix,
.ocr-overlay.dark .final-valor,
.ocr-overlay.dark .ocr-info,
.ocr-overlay.dark .ocr-info *{
  color: #fbc02d !important; /* dourado */
}
.ocr-overlay.dark .final-taxa {
  color: #ef9a9a !important;
}

/* ================= ABA CALCULADORA (INLINE) ================= */

.calc-panel {
  display: none;
  margin: 10px 0 14px 0;
  padding: 14px;
  border-radius: 14px;
  background: #f5f7fb;
}

.calc-panel h3 {
  margin: 0 0 10px 0;
  font-size: 15px;
  text-align: center;
}

.calc-panel input {
  width: 100%;
  height: 42px;
  border-radius: 12px;
  border: 1px solid #ccc;
  padding: 0 12px;
  font-size: 16px;
  margin-bottom: 10px;
}

.calc-panel .calc-result {
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
  line-height: 1.6;
}

/* 🌙 DARK MODE */
.ocr-overlay.dark .calc-panel {
  background: #2a2a2a;
}

.ocr-overlay.dark .calc-panel .calc-result {
  background: #1e1e1e;
}

/* =========================
   🌙 CALCULADORA — DARK MODE FIX
========================= */

/* painel */
.ocr-overlay.dark .calc-panel {
  background: #1e1e1e;
  border: 1px solid #333;
}

/* título */
.ocr-overlay.dark .calc-panel h3 {
  color: #fbc02d;
}

/* input */
.ocr-overlay.dark .calc-panel input {
  background: #2b2b2b !important;
  color: #ffffff !important;
  border: 1px solid #555 !important;
}

/* placeholder */
.ocr-overlay.dark .calc-panel input::placeholder {
  color: #9ca3af !important;
}

/* resultado */
.ocr-overlay.dark .calc-panel .calc-result {
  background: #2a2a2a !important;
  color: #e5e7eb !important;
  border: 1px solid #333;
}

/* valores destacados */
.ocr-overlay.dark .calc-panel b {
  color: #fbc02d;
}

`);
    const STORAGE_KEY = 'OCR_REGISTROS_V1';

    function salvarStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registrosOCR));
    }

    function carregarStorage() {
        try {
            const salvo = localStorage.getItem(STORAGE_KEY);
            if (salvo) {
                const dados = JSON.parse(salvo);
                if (Array.isArray(dados)) {
                    registrosOCR.length = 0;
                    dados.forEach(d => registrosOCR.push(d));
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar storage', e);
        }
    }

    function limparStorage() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /* ========= UI ========= */
    const overlay = document.createElement('div');
    overlay.className = 'ocr-overlay';

    const box = document.createElement('div');
    box.className = 'ocr-box';
// Criar o container para os botões
const topActions = document.createElement('div');
topActions.className = 'ocr-top-actions';
box.appendChild(topActions);

    // 🧮 BOTÃO CALCULADORA
const calcBtn = document.createElement('button');
calcBtn.textContent = '🧮';
calcBtn.title = 'Calculadora';

// adiciona primeiro
topActions.appendChild(calcBtn)
   calcBtn.onclick = () => {
  const aberto = calcPanel.style.display === 'block';
  calcPanel.style.display = aberto ? 'none' : 'block';

  inputCalc.value = '';
  resultadoCalc.innerHTML = 'Informe um valor para calcular.';
};


    const maxBtn = document.createElement('button');
    maxBtn.textContent = '⤢';
    maxBtn.title = 'Maximizar / Restaurar';
    maxBtn.className = 'ocr-max';
    topActions.appendChild(maxBtn);


    const darkBtn = document.createElement('button');
    darkBtn.textContent = '🌙';
    darkBtn.title = 'Modo escuro';

    topActions.appendChild(darkBtn);


    const drop = document.createElement('div');
    drop.className = 'ocr-drop';
    drop.textContent = '📄 Arraste, clique';

    // 🔢 CONTADOR DE ARQUIVOS
    const counter = document.createElement('div');
    counter.style.cssText = `
  margin:6px 0 12px 0;
  font-size:20px;
  font-weight:bold;
  color: #0d47a1;
`;
    counter.textContent = 'ARQUIVO 0';

    // 💰 TOTAL DA TELA
    const totalTela = document.createElement('div');
    totalTela.style.cssText = `
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: bold;
  color: #0d47a1;
`;
    totalTela.textContent = 'TOTAL R$ 0,00';

    // 📦 WRAPPER INFO (ARQUIVO + TOTAL)
    const infoWrapper = document.createElement('div');
    infoWrapper.className = 'ocr-info';
    infoWrapper.append(counter, totalTela);



    // 🔴 FALTAVA ISSO
    const list = document.createElement('div');
    list.className = 'ocr-list';

    const closeBtn = document.createElement('button');
closeBtn.textContent = '❌ Fechar';
closeBtn.className = 'btn-green';

const reportBtn = document.createElement('button');
reportBtn.textContent = ' Gerar relatório EXCEL';
reportBtn.className = 'btn-green';

reportBtn.onclick = gerarRelatorioExcel;

closeBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
});

    // 👤 CAMPO AGENTE
    const agenteInput = document.createElement('input');
    agenteInput.placeholder = 'Nome do agente';
    agenteInput.value = ' GILVAN LIMA';
    agenteInput.className = 'ocr-input';
    // 📋 SELECT TIPO
    const tipoSelect = document.createElement('select');
    tipoSelect.className = 'ocr-select';

    [
        'TOP VIAGENS',
        'VALE VIAGENS',
        'SUPORTE ONLINE',
        'AGENCIA',
        'CANOA'
    ].forEach(op => {
        const o = document.createElement('option');
        o.value = op;
        o.textContent = op;
        tipoSelect.appendChild(o);
    });
    // 📦 WRAPPER NOME + TIPO
    const headerForm = document.createElement('div');
    headerForm.className = 'ocr-header-form';

    headerForm.append(
        agenteInput,
        tipoSelect
    );
    const calcPanel = document.createElement('div');
calcPanel.className = 'calc-panel';

calcPanel.innerHTML = `
  <h3>🧮 Calculadora de Taxa</h3>

  <input type="text" id="calcValorInline" placeholder="Digite o valor (ex: 250,00)">

  <div class="calc-result" id="calcResultadoInline">
    Informe um valor para calcular.
  </div>
`;
    const inputCalc = calcPanel.querySelector('#calcValorInline');
const resultadoCalc = calcPanel.querySelector('#calcResultadoInline');

inputCalc.addEventListener('input', () => {
  let v = inputCalc.value
    .replace(/[^\d,]/g, '')
    .replace(',', '.');

  const valor = Number(v);

  if (isNaN(valor) || valor <= 0) {
    resultadoCalc.innerHTML = 'Informe um valor válido.';
    return;
  }

  const taxaPerc = calcularTaxaServico(valor);
  const taxaValor = valor * taxaPerc;


  resultadoCalc.innerHTML = `
    💰 Valor bruto: <b>R$ ${valor.toFixed(2).replace('.', ',')}</b><br>
    ⚙️ Taxa: <b>${(taxaPerc * 100).toFixed(0)}%</b><br>
    ➖ Taxa serviço: <b>R$ ${taxaValor.toFixed(2).replace('.', ',')}</b><br>
  `;
});

    const actionsBottom = document.createElement('div');
    actionsBottom.className = 'ocr-actions-bottom';

    actionsBottom.append(reportBtn, closeBtn);

    box.append(
  drop,
  headerForm,
  calcPanel,      // 👈 AQUI
  infoWrapper,
  list,
  actionsBottom
);

    reportBtn.className = 'btn-green';
    closeBtn.className  = 'btn-green';
    overlay.append(box);
    document.body.appendChild(overlay);
    overlay.style.display = 'none';

    carregarStorage();
    restaurarCardsDaTela();
    atualizarTotalTela();
    atualizarContador();

    /* ========= DRAG ========= */
    let drag=false,ox=0,oy=0;
    box.onmousedown = e => {
        if (fullscreen) return; // 🔒 trava drag em tela cheia
        if (e.target.tagName === 'BUTTON') return;
        drag = true;
        ox = e.clientX - overlay.offsetLeft;
        oy = e.clientY - overlay.offsetTop;
    };
    document.onmousemove=e=>{
        if(drag){
            overlay.style.left=e.clientX-ox+'px';
            overlay.style.top=e.clientY-oy+'px';
        }
    };
    document.onmouseup=()=>drag=false;

   /* ========= FLOAT BTN (MÓVEL) ========= */
const btn = document.createElement('button');
btn.textContent = '📄 OCR';

btn.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  padding: 12px 16px;
  border-radius: 999px;
  border: 0;
  background: #303F9F;
  color: #fff;
  font-weight: bold;
  cursor: grab;
  box-shadow: 0 6px 16px rgba(0,0,0,.35);
`;

document.body.appendChild(btn);

/* abrir OCR */
btn.onclick = (e) => {
  if (btn._arrastando) return; // evita clique ao soltar drag
  overlay.style.display = 'block';
};

/* ===== DRAG DO BOTÃO ===== */
let dragBtn = false, bx = 0, by = 0;

btn.addEventListener('mousedown', e => {
  dragBtn = true;
  btn._arrastando = false;
  bx = e.clientX - btn.offsetLeft;
  by = e.clientY - btn.offsetTop;
  btn.style.cursor = 'grabbing';
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragBtn) return;

  btn._arrastando = true;

  btn.style.left = (e.clientX - bx) + 'px';
  btn.style.top  = (e.clientY - by) + 'px';
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
  dragBtn = false;
  btn.style.cursor = 'grab';
});


    /* ========= INPUT ========= */
    const input=document.createElement('input');
    input.type='file';
    input.accept='.png,.jpg,.jpeg,.pdf';
    input.multiple=true;
    input.hidden=true;
    document.body.appendChild(input);

    drop.onclick=()=>input.click();
    drop.ondragover=e=>e.preventDefault();
    drop.ondrop=e=>{
        e.preventDefault();
        processFiles(e.dataTransfer.files);
    };
    input.onchange=()=>processFiles(input.files);

    let fullscreen = false;
    let estadoOriginal = {};
    let darkMode = localStorage.getItem('OCR_DARK') === '1';

    if (darkMode) {
        overlay.classList.add('dark');
        darkBtn.textContent = '☀️';
    }

    darkBtn.onclick = () => {
        darkMode = !darkMode;

        overlay.classList.toggle('dark', darkMode);
        darkBtn.textContent = darkMode ? '☀️' : '🌙';

        localStorage.setItem('OCR_DARK', darkMode ? '1' : '0');
    };

    maxBtn.onclick = () => {
        if (!fullscreen) {
            // salva estado flutuante
            estadoOriginal = {
                top: overlay.style.top,
                left: overlay.style.left,
                width: box.style.width,
                height: box.style.height
            };

            // ativa fullscreen real
            overlay.classList.add('fullscreen');
            box.classList.add('fullscreen');

            // 🔥 abre todos os comprovantes (modo informativo)
            document.querySelectorAll('.doc-body').forEach(b => {
                b.style.display = 'block';
            });

            maxBtn.textContent = '⤡'; // recolher
            fullscreen = true;

        } else {
            // restaura modo flutuante
            overlay.classList.remove('fullscreen');
            box.classList.remove('fullscreen');

            overlay.style.top = estadoOriginal.top || '120px';
            overlay.style.left = estadoOriginal.left || '120px';
            box.style.width = estadoOriginal.width || '600px';
            box.style.height = estadoOriginal.height || '';

            // 🔁 volta comportamento normal (cards fechados)
            document.querySelectorAll('.doc-body').forEach(b => {
                b.style.display = 'none';
            });

            maxBtn.textContent = '⤢'; // expandir
            fullscreen = false;
        }
    };


    /* ========= SOBRENOMES ========= */
    const SOBRENOMES=new Set([
        'SILVA','SANTOS','OLIVEIRA','PEREIRA','COSTA','RODRIGUES','ALVES','LIMA','GOMES',
        'RIBEIRO','CARVALHO','SOUZA','FERNANDES','ARAUJO','ROCHA','MARTINS','BARROS',
        'FREITAS','BATISTA','TEIXEIRA','NOGUEIRA','MOREIRA','CUNHA','CORREIA','MENDES',
        'PACHECO','FARIAS','MACEDO','GUEDES','MOURA','AZEVEDO','TORRES','ANTUNES',
        'FIGUEIREDO','SIQUEIRA','PAIVA','TAVARES','BEZERRA','LOPES','DANTAS','AMARAL',
        'FONSECA','MAGALHAES','NEVES','VASCONCELOS','NASCIMENTO','GUIMARAES'
    ]);

    function ehSobrenomeProvavel(p){
        return SOBRENOMES.has(
            p.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
        );
    }
    /* ========= BANCO ========= */
    function identificarBanco(texto){
        const t = texto.toUpperCase();

        // 🟡 MERCADO PAGO — SEMPRE PRIMEIRO
        if (
            t.includes('MERCADO PAGO') &&
            t.includes('COMPROVANTE DE PIX')
        ) {
            return 'MERCADO_PAGO';
        }

        // 🔵 BANCO DO BRASIL (APP BB)
        if (
            (t.includes('COMPROVANTE BB') || t.startsWith('BANCO DO BRASIL')) &&
            !t.includes('MERCADO PAGO')
        ) {
            return 'BB';
        }

        // 🟠 BANCO INTER
        if (
            t.includes('BANCO INTER')
        ) {
            return 'INTER';
        }

        // 🟣 NUBANK
        if (
            t.includes('NUBANK')
        ) {
            return 'NUBANK';
        }
        // 🔴 SANTANDER
        if (
            t.includes('SANTANDER') ||
            t.includes('BANCO SANTANDER') ||
            t.includes('COMPROVANTE DO PIX') && t.includes('SANTANDER')
        ) {
            return 'SANTANDER';
        }
        // 🔴 BRADESCO
        if (
            t.includes('BRADESCO')
        ) {
            return 'BRADESCO';
        }
        // 🔵 ITAÚ
        if (
            t.includes('ITAU') ||
            t.includes('ITAÚ')
        ) {
            return 'ITAU';
        }
        // 🟦 CAIXA
        if (
            t.includes('CAIXA ECONÔMICA') ||
            t.includes('CAIXA ECONOMICA') ||
            t.includes('CAIXA')
        ) {
            return 'CAIXA';
        }
        // 🟢 PICPAY
        if (
            t.includes('PICPAY') ||
            t.includes('COMPROVANTE DE PIX') && t.includes('PICPAY')
        ) {
            return 'PICPAY';
        }
        if (
            t.includes('BANCO C6') ||
            t.includes('BANCO: 336') ||
            t.includes(' C6 ') ||
            t.includes('\nC6\n') ||
            t.includes('C6 AR') ||   // cobre C6ArNK
            t.includes('C6ARNK')
        ) {
            return 'C6';
        }
        // 🚌 PASSAGEM RODOVIÁRIA (GUANABARA)
        if (
            t.includes('VIA DO PASSAGEIRO') ||
            t.includes('GUANABARA') ||
            t.includes('GUANASARA')
        ) {
            return 'PASSAGEM';
        }

        return 'OUTRO';
    }
    function removerSegundos(hora) {
        if (!hora) return hora;
        // remove apenas :SS (HH:MM:SS → HH:MM)
        return hora.replace(/:(\d{2})$/, match =>
                            hora.split(':').length === 3 ? '' : match
                           );
    }

    function jaEstaFinal(body) {
        return body.querySelector('.doc-final') !== null;
    }

    function extrairHoraUniversal(linhasHTML) {
        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t
                .toLowerCase()
                .replace(/às/g, 'as')
                .replace(/o/g, '0')
                .trim();

            // às 14h00 | as 14h00 | 14h00
            let m = t.match(/(?:as\s*)?(\d{1,2})h(\d{2})/);
            if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;

            // 14:00
            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            // 1400
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;
        }

        return '';
    }
    function extrairValorUniversal(linhasHTML) {
        let inteiro = '';
        let erroCentavos = false;

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t.replace(/O/g,'0').replace(/o/g,'0');

            // R$ 8,00
            let m = t.match(/R\$\s*(\d+)[,.](\d{2})/);
            if (m) return `${m[1]},${m[2]}`;

            // R$ 8° | R$ 8%
            m = t.match(/R\$\s*(\d+)\s*[%°º]/);
            if (m) {
                inteiro = m[1];
                erroCentavos = true;
                break;
            }

            // R$ 800
            m = t.match(/R\$\s*(\d+)/);
            if (m) {
                inteiro = m[1];
                break;
            }
        }

        if (erroCentavos && inteiro) {
            return `${inteiro}, erro ao ler centavos`;
        }

        if (inteiro) {
            if (inteiro.length === 1) return `0,0${inteiro}`;
            if (inteiro.length === 2) return `0,${inteiro}`;
            return `${inteiro.slice(0,-2)},${inteiro.slice(-2)}`;
        }

        return '';
    }
    function extrairNomeGlobal(linhasHTML) {
        const stopWords = [
            'instituicao',
            'instituição',
            'banco',
            'agencia',
            'agência',
            'conta',
            'cpf',
            'cnpj',
            'pix'
        ];

        for (let i = 0; i < linhasHTML.length; i++) {
            const atual = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent
            ?.trim() || '';

            const t = atual.toLowerCase();

            // 🔑 contexto forte
            if (t === 'origem' || t === 'pagador' || t === 'quem pagou') {

                // 🔍 janela de até 3 linhas
                for (let j = 1; j <= 3; j++) {
                    const prox = linhasHTML[i + j]
                    ?.querySelector('span:last-child')
                    ?.textContent
                    ?.trim() || '';

                    if (!prox) continue;

                    const p = prox.toLowerCase();

                    // ignora lixo
                    if (stopWords.some(w => p.includes(w))) continue;

                    // ignora linhas vazias / símbolos
                    if (prox.length < 4) continue;

                    // remove "Nome:"
                    return limparNome(prox);
                }
            }
        }

        return '';
    }

    // ===== RENDERIZAÇÃO FINAL (FORMATO ÚNICO LIMPO) =====
   function renderFinal(body, { nome, hora, valor }) {

    let valorLimpo = (valor || '')
        .replace(/R\$\s*/gi, '')
        .trim();

    if (!body.dataset.salvo) {
        const novoId = gerarId();
        body.dataset.ocrId = novoId;

        registrosOCR.push({
            id: novoId,
            arquivo: body.dataset.nomeArquivo || '',
            nome: nome || '',
            hora: hora || '',
            valor: valorLimpo || '',
            taxa: 0
        });

        body.dataset.salvo = '1';
        salvarStorage();
        atualizarContador();
    } else {
        const r = registrosOCR.find(x => x.id === body.dataset.ocrId);
        if (r) {
            r.nome = nome || r.nome;
            r.hora = hora || r.hora;
            r.valor = valorLimpo || r.valor;
            salvarStorage();
        }
    }

    atualizarVisualFinal(body);
    atualizarTotalTela();
}


    function horaParaMinutos(hora) {
        if (!hora || !hora.includes(':')) return 9999;
        const [h, m] = hora.split(':').map(Number);
        return (h * 60) + m;
    }
    function limparCPFdoNome(nome) {
        if (!nome) return nome;

        // mantém apenas letras e espaços
        return nome
            .normalize('NFD')
            .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ') // remove tudo que não é letra
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function limparNome(n) {
        return n
            .replace(/^\s*NOME\s*:?\s*/i, '') // remove "Nome", "NOME :", etc
            .replace(/^N0ME\s*/i, 'NOME ')
            .trim();
    }
    /* ========= REGRA BB (CORRIGIDA) ========= */
    function regraBancoBrasil(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        const INDEX_LINHA_6  = 5;   // valor
        const INDEX_LINHA_7  = 6;   // horário
        const INDEX_LINHA_23 = 22;  // nome

        let valor = '';
        let hora  = '';
        let nome  = '';

        // 💚 VALOR
        if (linhasHTML[INDEX_LINHA_6]) {
            const t = linhasHTML[INDEX_LINHA_6]
            .querySelector('span:last-child').textContent;
            const m = t.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        // 🔵 HORÁRIO
        if (linhasHTML[INDEX_LINHA_7]) {
            const t = linhasHTML[INDEX_LINHA_7]
            .querySelector('span:last-child').textContent;
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        // 🔴 NOME — BB (corrige nome colado + símbolos)
        if (linhasHTML[INDEX_LINHA_23]) {
            nome = linhasHTML[INDEX_LINHA_23]
                .querySelector('span:last-child')
                .textContent

            // 🧠 insere espaço antes de maiúscula colada (SouzaRocha → Souza Rocha)
                .replace(/([a-zÀ-ÿ])([A-ZÀ-Ý])/g, '$1 $2')

            // remove símbolos finais tipo *
                .replace(/[*•:]+$/g, '')

            // remove qualquer lixo
                .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')

            // normaliza espaços
                .replace(/\s{2,}/g, ' ')
                .trim();
        }
        // 🧹 LIMPA TUDO E MOSTRA SÓ O ESSENCIAL
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraNubank(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        function extrairHora(n) {
            const m = txtLinha(n).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            return m ? m[0] : '';
        }

        function extrairValor(n) {
            const m = txtLinha(n).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            return m ? m[0] : '';
        }

        /* =====================================================
     CASO 1 — "TRANSFERÊNCIA" NA LINHA 4
  ====================================================== */
        if (txtLinha(3).toUpperCase().includes('TRANSFERÊNCIA')) {

            hora  = extrairHora(5); // linha 6
            valor = extrairValor(7); // linha 8

            for (let i = 0; i < linhasHTML.length; i++) {
                if (txtLinha(i).toUpperCase() === 'ORIGEM') {

                    // tenta 1 linha abaixo
                    if (txtLinha(i + 1).toUpperCase().startsWith('NOME')) {
                        nome = limparNome(txtLinha(i + 1));
                    }
                    // tenta 2 linhas abaixo
                    else if (txtLinha(i + 2).toUpperCase().startsWith('NOME')) {
                        nome = limparNome(txtLinha(i + 2));
                    }

                    break;
                }
            }
        }


        /* =====================================================
   CASO — "TRANSFERÊNCIA" NA LINHA 5
===================================================== */
        else if (txtLinha(4).toUpperCase().includes('TRANSFERÊNCIA')) {

            // 🔵 HORÁRIO — linha 6
            hora = extrairHora(5);

            // 💚 VALOR — linha 7
            valor = extrairValor(6);

            // 🔴 ORIGEM NA LINHA 15 → PAGADOR LINHA 16
            if (txtLinha(14).toUpperCase() === 'ORIGEM') {
                nome = limparNome(txtLinha(15));
            }
        }

        /* =====================================================
   CASO — "TRANSFERÊNCIA" NA LINHA 6
===================================================== */
        else if (txtLinha(5).toUpperCase().includes('TRANSFERÊNCIA')) {

            // 🔵 HORÁRIO — linha 7
            hora = extrairHora(6);

            // 💚 VALOR — linha 8
            valor = extrairValor(7);

            // 🔴 ORIGEM ENTRE LINHA 16 E 20
            for (let i = 15; i <= 19; i++) {
                if (txtLinha(i).toUpperCase() === 'ORIGEM') {
                    nome = limparNome(txtLinha(i + 1));

                    // 🧹 REMOVE "Nome " DO INÍCIO
                    nome = nome.replace(/^NOME\s+/i, '').trim();

                    break;
                }
            }
        }
        /* =====================================================
     FALLBACK — REGRA ANTIGA (SEGURANÇA)
  ====================================================== */
        if (!valor || !hora || !nome) {
            linhasHTML.forEach((linha, i) => {
                const txt = txtLinha(i).toUpperCase();

                if (!valor && txt.includes('R$')) {
                    const m = txt.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
                    if (m) valor = m[0];
                }

                if (!hora) {
                    const m = txt.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                    if (m) hora = m[0];
                }

                if (txt === 'ORIGEM' && !nome) {
                    nome = txtLinha(i + 1);
                }
            });
        }
        /* =========================
     OUTPUT FINAL
  ========================== */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraBancoInter(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        function extrairValor(n) {
            const m = txtLinha(n).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            return m ? m[0] : '';
        }

        function extrairHoraTexto(t) {
            t = t.trim();

            // 12h18 | 15h06
            let m = t.match(/(\d{1,2})h(\d{2})/i);
            if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;

            // OCR bug: 12018 → 12h18
            m = t.match(/\b(\d{2})0(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            // 12:18
            m = t.match(/\b\d{2}:\d{2}\b/);
            if (m) return m[0];

            // fallback simples: 1218 → 12:18
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            return '';
        }

        /* =====================================================
       VALOR — PRIMEIRA LINHA COM R$
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            valor = extrairValor(i);
            if (valor) break;
        }

        /* =====================================================
       HORÁRIO — APÓS A PALAVRA "HORÁRIO"
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase().includes('HORÁRIO')) {

                // tenta na mesma linha
                hora = extrairHoraTexto(txtLinha(i));
                if (hora) break;

                // tenta na próxima linha
                hora = extrairHoraTexto(txtLinha(i + 1));
                if (hora) break;
            }
        }

        /* =====================================================
       NOME — DEPOIS DE "QUEM PAGOU"
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase() === 'QUEM PAGOU') {
                nome = limparNome(txtLinha(i + 1));
                break;
            }
        }

        if (!hora) hora = '-';
        if (!nome) nome = '-';

        /* =========================
       OUTPUT FINAL
    ========================== */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraSantander(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        const INDEX_HORA    = 6;   // linha 7
        const INDEX_VALOR   = 10;  // linha 11
        const INDEX_PAGADOR = 38;  // linha 39

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= VALOR ========= */
        if (linhasHTML[INDEX_VALOR]) {
            const t = txtLinha(INDEX_VALOR);
            const m = t.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        /* ========= HORÁRIO ========= */
        if (linhasHTML[INDEX_HORA]) {
            const t = txtLinha(INDEX_HORA);
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        /* ========= PAGADOR ========= */
        if (linhasHTML[INDEX_PAGADOR]) {
            nome = limparNome(txtLinha(INDEX_PAGADOR));
        }

        /* ========= OUTPUT FINAL ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
   function regraBradesco(texto, body) {
    const linhasHTML = body.querySelectorAll('.doc-line');

    let valor = '';
    let hora  = '';
    let nome  = '';

    function txtLinha(i) {
        return linhasHTML[i]
            ?.querySelector('span:last-child')
            ?.textContent
            ?.trim() || '';
    }

    /* =====================================================
       🔹 LAYOUT NOVO (PRIORIDADE)
       horário 7 | valor 8 | pagador 20
    ====================================================== */

    // ⏰ HORÁRIO — linha 7 (index 6)
    if (!hora && txtLinha(6)) {
        const m = txtLinha(6).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
        if (m) hora = m[0];
    }

    // 💰 VALOR — linha 8 (index 7)
    if (!valor && txtLinha(7)) {
        const m = txtLinha(7).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
        if (m) valor = m[0];
    }

    // 👤 PAGADOR — linha 20 (index 19)
    if (!nome && txtLinha(19)) {
        nome = limparNome(txtLinha(19));
    }

    /* =====================================================
       🔹 LAYOUT ANTIGO (FALLBACK)
       horário 7 | valor 9 | pagador 31
    ====================================================== */

    // ⏰ HORÁRIO — linha 7 (index 6)
    if (!hora && txtLinha(6)) {
        const m = txtLinha(6).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
        if (m) hora = m[0];
    }

    // 💰 VALOR — linha 9 (index 8)
    if (!valor && txtLinha(8)) {
        const m = txtLinha(8).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
        if (m) valor = m[0];
    }

    // 👤 PAGADOR — linha 31 (index 30)
    if (!nome && txtLinha(30)) {
        nome = limparNome(txtLinha(30));
    }

    /* =========================
       OUTPUT FINAL
    ========================== */
    renderFinal(body, {
        nome,
        hora: removerSegundos(hora),
        valor
    });
}

    function extrairHoraMercadoPago(linhasHTML) {
        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t
                .toLowerCase()
                .replace(/às/g, 'as')
                .replace(/o/g, '0'); // corrige hO0 → h00

            // 1️⃣ as 14h00 | às 14h00 | 14h00
            let m = t.match(/(?:as\s*)?(\d{1,2})h(\d{2})/);
            if (m) {
                return `${m[1].padStart(2,'0')}:${m[2]}`;
            }

            // 2️⃣ 14:00
            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) {
                return `${m[1]}:${m[2]}`;
            }

            // 3️⃣ 1400
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) {
                return `${m[1]}:${m[2]}`;
            }
        }

        return '';
    }

    function regraItau(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        const INDEX_VALOR   = 3;  // linha 4
        const INDEX_HORA    = 5;  // linha 6
        const INDEX_PAGADOR = 9;  // linha 10

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= VALOR ========= */
        if (linhasHTML[INDEX_VALOR]) {
            const t = txtLinha(INDEX_VALOR);
            const m = t.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        /* ========= HORÁRIO ========= */
        if (linhasHTML[INDEX_HORA]) {
            const t = txtLinha(INDEX_HORA);
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        /* ========= PAGADOR ========= */
        if (linhasHTML[INDEX_PAGADOR]) {
            nome = limparNome(txtLinha(INDEX_PAGADOR));
        }

        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraCaixa(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        let valor = '';
        let hora  = '';
        let nome  = '-';

        /* ========= VALOR + HORA — após "valor data" ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i).toLowerCase();

            if (t.includes('valor data')) {

                // 💚 VALOR — linha seguinte
                const v = txtLinha(i + 1);
                const mv = v.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
                if (mv) valor = mv[0];

                // 🔵 HORÁRIO — linha depois do valor
                const h = txtLinha(i + 2);
                const mh = h.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                if (mh) hora = mh[0];

                break;
            }
        }
        /* ========= PAGADOR — "Dados do pagador" ========= */
        /* ========= PAGADOR — CAIXA (ROBUSTO) ========= */
        for (let i = 0; i < linhasHTML.length; i++) {

            if (txtLinha(i).toLowerCase() === 'dados do pagador') {

                // procura "nome" depois do bloco
                for (let j = i + 1; j < i + 8; j++) {

                    if (txtLinha(j).toLowerCase() === 'nome') {

                        // agora procura o nome real
                        for (let k = j + 1; k < j + 8; k++) {

                            const candidato = txtLinha(k);
                            if (!candidato) continue;

                            const up = candidato.toUpperCase();

                            // ⛔ condição de parada
                            if (
                                up.includes('CPF') ||
                                up.includes('CNPJ')
                            ) break;

                            // ignora lixo
                            if (candidato.length < 4) continue;

                            nome = limparCPFdoNome(
                                limparNome(candidato)
                            );
                            break;
                        }
                        break;
                    }
                }
                break;
            }
        }

        /* ========= OUTPUT FINAL ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraPicPay(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        let valor = '';
        let hora  = '';
        let nome  = '';

        /* ========= HORÁRIO — após "Comprovante de Pix" ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase().includes('comprovante de pix')) {
                for (let j = 1; j <= 4; j++) {
                    const m = txtLinha(i + j)
                    .match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                    if (m) {
                        hora = m[0];
                        break;
                    }
                }
                break;
            }
        }

        /* ========= VALOR — após "Valor" ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase() === 'valor') {
                for (let j = 1; j <= 2; j++) {
                    const m = txtLinha(i + j)
                    .match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
                    if (m) {
                        valor = m[0];
                        break;
                    }
                }
                break;
            }
        }

        /* ========= PAGADOR — após "De" (ROBUSTO) ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase() === 'de') {

                let partesNome = [];

                for (let j = i + 1; j < linhasHTML.length; j++) {
                    const linha = txtLinha(j);
                    if (!linha) continue;

                    const up = linha.toUpperCase();

                    // ⛔ condição de parada — CPF/CNPJ (normal ou mascarado)
                    if (
                        up.includes('CPF') ||
                        up.includes('CNPJ') ||
                        /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(linha) ||
                        /\*{2,3}\.\d{3}\.\d{3}-\*{2}/.test(linha) ||
                        /\+\*{2}\.\d{3}\.\d{3}-\*{2}/.test(linha) ||
                        /\*{2,3}\d{6}\*{2}/.test(linha)
                    ) {
                        break;
                    }
                    // ignora lixo
                    if (linha.length < 3) continue;
                    if (
                        up.includes('BANCO') ||
                        up.includes('INSTITUIÇÃO') ||
                        up.includes('PICPAY')
                    ) break;

                    partesNome.push(linha);
                }

                if (partesNome.length) {
                    nome = limparCPFdoNome(
                        limparNome(partesNome.join(' '))
                    );
                    // 🧹 remove CPF/CNPJ mascarado ou colado no final
                    nome = nome
                        .replace(/\*{2,3}\.\d{3}\.\d{3}-\*{2}.*/g, '')
                        .replace(/\+\*{2}\.\d{3}\.\d{3}-\*{2}.*/g, '')
                        .replace(/\*{2,3}\d{6}\*{2}.*/g, '')
                        .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}.*/g, '')
                        .trim();
                }
                break;
            }
        }
        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraC6Bank(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= HORÁRIO — C6 ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i);

            let m = t.match(/\b(\d{2}:\d{2})\s+\1\b/);
            if (m) {
                hora = m[1];
                break;
            }

            m = t.match(/\b\d{2}:\d{2}\b/);
            if (m) {
                hora = m[0];
                break;
            }
        }

        /* ========= VALOR ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const m = txtLinha(i).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) {
                valor = m[0];
                break;
            }
        }

        /* ========= PAGADOR — BANCO: 336 ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase().includes('BANCO: 336')) {
                const candidato = txtLinha(i - 1);

                if (
                    candidato.length > 5 &&
                    !candidato.toUpperCase().includes('CPF') &&
                    !candidato.toUpperCase().includes('CNPJ')
                ) {
                    nome = limparNome(candidato);
                }
                break;
            }
        }
        /* ========= PRECAUÇÃO — PAGADOR APÓS "ORIGEM" ========= */
        if (!nome) {
            for (let i = 0; i < linhasHTML.length; i++) {
                if (txtLinha(i).toUpperCase().includes('ORIGEM')) {
                    for (let j = 1; j <= 2; j++) {
                        const candidato = txtLinha(i + j);

                        if (
                            candidato.length > 5 &&
                            !candidato.toUpperCase().includes('CPF') &&
                            !candidato.toUpperCase().includes('CNPJ') &&
                            !candidato.toUpperCase().includes('CONTA') &&
                            !candidato.toUpperCase().includes('AGÊNCIA')
                        ) {
                            nome = limparNome(candidato);
                            break;
                        }
                    }
                    break;
                }
            }
        }

        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }


    function regraMercadoPago(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }
        /* ========= HORÁRIO ========= */
        let hora = '';

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = txtLinha(i)
            .toLowerCase()
            .replace(/às/g, 'as')
            .replace(/o/g, '0');

            let m = t.match(/as\s*(\d{1,2})h(\d{2})/);
            if (m) {
                hora = `${m[1].padStart(2,'0')}:${m[2]}`;
                break;
            }

            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) {
                hora = `${m[1]}:${m[2]}`;
                break;
            }
        }
        /* ========= VALOR (MP — DEFINITIVO COMPLETO) ========= */
        let valor = '';
        let inteiro = '';
        let erroCentavos = false;

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = txtLinha(i);
            if (!t) continue;

            // normalização OCR
            t = t
                .replace(/O/g, '0')
                .replace(/o/g, '0');

            // 1️⃣ valor perfeito: R$ 8,00 | R$8,00 | R$ 2875,00
            let m = t.match(/R\$\s*(\d+)[,.](\d{2})/);
            if (m) {
                valor = `${m[1]},${m[2]}`;
                break;
            }

            // 2️⃣ inteiro + erro de centavos (% ° º)
            m = t.match(/R\$\s*(\d+)\s*[%°º]/);
            if (m) {
                inteiro = m[1];
                erroCentavos = true;
                break;
            }

            // 3️⃣ inteiro puro (sem símbolo depois)
            m = t.match(/R\$\s*(\d+)/);
            if (m) {
                inteiro = m[1];
                break;
            }
        }

        // decisão final
        if (valor) {
            // ok
        }
        else if (erroCentavos && inteiro) {
            valor = `${inteiro} , erro ao ler centavos`;
        }
        else if (inteiro) {
            // 🔥 regra nova: vírgula 2 casas antes
            if (inteiro.length === 1) {
                valor = `0,0${inteiro}`;
            }
            else if (inteiro.length === 2) {
                valor = `0,${inteiro}`;
            }
            else {
                const i = inteiro.slice(0, -2);
                const c = inteiro.slice(-2);
                valor = `${i},${c}`;
            }
        }
        else {
            valor = 'valor não encontrado';
        }


        /* ========= PAGADOR — REGRA FINAL (ROBUSTA) ========= */
        let nome = '';

        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i)
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^[^a-z]+/, '') // remove lixo antes
            .trim();

            // aceita: "e de", "o de", "- e de", etc
            if (t === 'e de' || t.endsWith(' de')) {
                nome = txtLinha(i + 1);

                // 🧹 limpa CPF / CNPJ se vier junto
                nome = nome
                    .replace(/cpf.*$/i, '')
                    .replace(/cnpj.*$/i, '')
                    .trim();

                break;
            }
        }
        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraPassagem(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }
        let nome = '';
        let hora = '';
        let somaValor = 0;
        let encontrouValor = false;

        /* ================= NOME DO PASSAGEIRO ================= */
        for (let i = 22; i <= 40 && i < linhasHTML.length; i++) {
            let t = txtLinha(i);
            if (!t) continue;

            if (/PASSA?GEIRO/i.test(t)) {

                // 1️⃣ tenta pegar da mesma linha
                let nomeTemp = t
                .replace(/^.*PASSA?GEIRO[:.\s]*/i, '')
                .replace(/CPF.*$/i, '')
                .replace(/RG.*$/i, '')
                .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

                // 2️⃣ fallback: linha seguinte
                let linhaNomeIndex = i;
                if (nomeTemp.length < 6) {
                    const prox = txtLinha(i + 1);
                    if (prox) {
                        nomeTemp = prox
                            .replace(/CPF.*$/i, '')
                            .replace(/RG.*$/i, '')
                            .replace(/IDOSO.*$/i, '')
                            .replace(/ID\s*JOVEM.*$/i, '')
                            .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                        linhaNomeIndex = i + 1;
                    }
                }

                // 3️⃣ continuação do nome (até +2 linhas)
                const BLOQUEADAS = [
                    'OBRIGATORIO','OBRIGATÓRIO',
                    'COMPARECIMENTO',
                    'EMBARQUE',
                    'MINUTOS',
                    'ANTES',
                    'HORA',
                    'HORARIO','HORÁRIO',
                    'UTILIZE','UTILIZAR',
                    'DOCUMENTO'
                ];

                for (let k = 1; k <= 2; k++) {
                    const proxLinha = txtLinha(linhaNomeIndex + k);
                    if (!proxLinha) continue;

                    const contLimpo = proxLinha
                    .replace(/CPF.*$/i, '')
                    .replace(/RG.*$/i, '')
                    .replace(/IDOSO.*$/i, '')
                    .replace(/ID\s*JOVEM.*$/i, '')
                    .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();

                    const palavras = contLimpo
                    .split(' ')
                    .filter(p => p.length >= 3);

                    const palavrasUpper = palavras.map(p => p.toUpperCase());

                    let novas = [];

                    for (let p of palavrasUpper) {
                        if (BLOQUEADAS.includes(p)) {
                            // encontrou aviso → limpa e CONTINUA procurando sobrenome depois
                            novas = [];
                            continue;
                        }
                        if (p.length >= 3) {
                            novas.push(p);
                        }
                    }
                    if (novas.length) {
                        const total =
                              nomeTemp.split(' ').length + novas.length;

                        if (total <= 6) {
                            nomeTemp = `${nomeTemp} ${novas.join(' ')}`.trim();
                        }
                    }
                }
                if (nomeTemp.length >= 6) {
                    nome = nomeTemp;
                }
                break;
            }
        }
        /* ================= SOMA DE VALORES (TODAS AS PÁGINAS) ================= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i).toUpperCase();

            if (t.includes('VALOR') && t.includes('PAGO')) {
                for (let j = i; j <= i + 3; j++) {
                    let v = txtLinha(j);
                    if (!v) continue;

                    v = v.replace(/O/g,'0').replace(/o/g,'0');

                    // R$ 28,99
                    let m = v.match(/R\$\s*(\d+)[,.](\d{2})/);
                    if (m) {
                        somaValor += Number(`${m[1]}.${m[2]}`);
                        encontrouValor = true;
                        break;
                    }

                    // 2899 → 28,99
                    m = v.match(/\b(\d{3,})\b/);
                    if (m) {
                        const n = m[1];
                        somaValor += Number(`${n.slice(0,-2)}.${n.slice(-2)}`);
                        encontrouValor = true;
                        break;
                    }
                }
            }
        }

        /* ================= ÚLTIMA HORA (AUTORIZAÇÃO) ================= */
        for (let i = linhasHTML.length - 1; i >= 0; i--) {
            const t = txtLinha(i).toLowerCase();

            if (t.includes('autoriz')) {
                let m = t.match(/\b\d{2}:\d{2}\b/);
                if (m) {
                    hora = m[0];
                    break;
                }

                for (let j = i + 1; j <= i + 5; j++) {
                    const h = txtLinha(j)?.match(/\b\d{2}:\d{2}\b/);
                    if (h) {
                        hora = h[0];
                        break;
                    }
                }
                break;
            }
        }

        const valorFinal = encontrouValor
        ? somaValor.toFixed(2).replace('.', ',')
        : '-';

        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valorFinal
        });
    }



    function parseValor(valor) {
        if (!valor) return { numero: null, texto: '' };

        // se tem erro explícito
        if (/erro ao ler centavos/i.test(valor)) {
            return {
                numero: null,
                texto: valor.trim()
            };
        }

        const v = valor
        .replace(/[^\d,]/g, '')
        .replace(',', '.');

        const n = Number(v);

        return {
            numero: isNaN(n) ? null : n,
            texto: valor.trim()
        };
    }
    function gerarRelatorioExcel() {
        const dados = [];

        const agente = agenteInput.value || 'SEM NOME';
        const tipo   = tipoSelect.value;

        // ===== LINHA 1 =====
        dados.push([
            `AGENTE: ${agente.toUpperCase()}`,
            XLSX.SSF.format('dd/mm/yyyy', new Date()),
            '',
            '',
            tipo
        ]);

        // ===== LINHA 2 (CABEÇALHO) =====
        dados.push([
            'NOME',
            'HORA',
            'PIX',
            'TAXA',
            'PIX TOTAL'
        ]);

        // ===== ORDENA JSON POR HORÁRIO (00:00 → 23:59) =====
        const registrosOrdenados = [...registrosOCR].sort((a, b) => {
            return horaParaMinutos(a.hora) - horaParaMinutos(b.hora);
        });

        // ===== MONTA EXCEL A PARTIR DO JSON =====
        registrosOrdenados.forEach(item => {

            if (
                (!item.nome || item.nome === '-') &&
                (!item.hora || item.hora === '-') &&
                (!item.valor || item.valor === '-')
            ) return;

            const linhaExcel = dados.length + 1;
            const pixOriginal = parseValor(item.valor);
const taxa = Number(item.taxa || 0);

// 🔥 PIX LÍQUIDO (igual à tela)
let pixLiquido = pixOriginal.numero;
if (pixLiquido !== null && taxa > 0) {
    pixLiquido = pixLiquido - taxa;
}

dados.push([
  item.nome ? item.nome.toUpperCase() : '',
  item.hora || '',
  pixLiquido !== null ? pixLiquido : pixOriginal.texto, // ✅ PIX LÍQUIDO
  taxa || 0,
  pixLiquido !== null
    ? { f: `IF(ISNUMBER(C${linhaExcel}),C${linhaExcel}+D${linhaExcel},"")` }
    : ''
]);
        });


        if (dados.length <= 2) {
            alert('Nenhum dado válido para gerar Excel.');
            return;
        }
        // ===== LINHA EM BRANCO (SEPARADOR) =====
        dados.push(['', '', '', '', '']);

        // ===== LINHA DE TOTAL =====
        const primeiraLinhaDados = 3;
        const ultimaLinhaDados = dados.length - 1; // 🔥 ignora a linha em branco

        dados.push([
            'TOTAL',
            '',
            '',
            '',
            { f: `SUM(E${primeiraLinhaDados}:E${ultimaLinhaDados})` }
        ]);

        const ws = XLSX.utils.aoa_to_sheet(dados);
        // ===== FORMATA PIX (C) E TAXA (D) COMO MOEDA =====
        const range = XLSX.utils.decode_range(ws['!ref']);

        for (let R = 2; R <= range.e.r; ++R) { // começa na linha de dados
            const pixCell  = XLSX.utils.encode_cell({ r: R, c: 2 }); // coluna C
            const taxaCell = XLSX.utils.encode_cell({ r: R, c: 3 }); // coluna D

            if (ws[pixCell] && typeof ws[pixCell].v === 'number') {
                ws[pixCell].z = '#,##0.00';
            }

            if (ws[taxaCell] && typeof ws[taxaCell].v === 'number') {
                ws[taxaCell].z = '#,##0.00';
            }
        }
        ws['!cols'] = [
            { wch: 40 }, // Nome
            { wch: 10 }, // Hora
            { wch: 18 }, // Pix
            { wch: 10 }, // Taxa
            { wch: 15 }  // Pix Total
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatório OCR');

        XLSX.writeFile(wb, 'relatorio_ocr.xlsx');
    }

    /* ========= NUMERA + APLICA ========= */
    function aplicarRegras(body){
        const texto = body.textContent;
        const linhas = texto.split('\n');
        const banco = identificarBanco(texto);

        // 🔢 Numera todas as linhas
        body.innerHTML = linhas.map((l,i)=>
                                    `<div class="doc-line"><span class="ln">${i+1}</span><span>${l}</span></div>`
                                   ).join('');

        // 🏦 Regras específicas por banco
        if (banco === 'BB') {
            regraBancoBrasil(texto, body);
        }
        else if (banco === 'BRADESCO') {
            regraBradesco(texto, body);
        }
        else if (banco === 'NUBANK') {
            regraNubank(texto, body);
        }
        else if (banco === 'INTER') {
            regraBancoInter(texto, body);
        }
        else if (banco === 'MERCADO_PAGO') {
            regraMercadoPago(texto, body);
        }
        else if (banco === 'C6') {
            regraC6Bank(texto, body);
        }
        else if (banco === 'ITAU') {
            regraItau(texto, body);
        }
        else if (banco === 'SANTANDER') {
            regraSantander(texto, body);
        }
        else if (banco === 'PICPAY') {
            regraPicPay(texto, body);
        }
        else if (banco === 'CAIXA') {
            regraCaixa(texto, body);
        }else if (banco === 'PASSAGEM') {
            regraPassagem(texto, body);
        }



        // 📄 Linhas atuais (após regra do banco)
        const linhasHTML = body.querySelectorAll('.doc-line');

        // 🛟 FALLBACK UNIVERSAL — só se banco não resolveu
        if (banco !== 'C6' && !jaEstaFinal(body)) {

            const valor = extrairValorUniversal(linhasHTML);
            const hora  = extrairHoraUniversal(linhasHTML);
            let nome = extrairNomeGlobal(linhasHTML);
            if (!nome) {
                nome = extrairNomeUniversal(linhasHTML);
            }

            if (valor || hora || nome) {
                body.innerHTML = `
            <div class="doc-line">
                <span class="ln">1</span>
                <span style="color:#2E7D32;font-weight:bold">${valor || '-'}</span>
            </div>
            <div class="doc-line">
                <span class="ln">2</span>
                <span style="color:#1976D2;font-weight:bold">${removerSegundos(hora) || '-'}</span>
            </div>
            <div class="doc-line">
                <span class="ln">3</span>
                <span style="color:red;font-weight:bold">${nome || '-'}</span>
            </div>
        `;
            }
        }
    }
    function chaveArquivo(file) {
        return `${file.name}__${file.size}__${file.type}`;
    }
    /* ========= OCR ========= */
    async function processFiles(files) {
        for (const file of files) {
            const chave = chaveArquivo(file);

            // 🚫 já foi anexado
            if (arquivosAnexados.has(chave)) {
                console.log('Arquivo ignorado (duplicado):', file.name);
                continue;
            }

            arquivosAnexados.add(chave);
            atualizarContador();
            processFile(file);
        }
    }
    function atualizarContador() {
        counter.textContent = `ARQUIVO ${registrosOCR.length}`;
    }
    function criarDoc(titulo){
        const d=document.createElement('div');
        d.className='doc';
        d.innerHTML=`
   <div class="doc-header">${titulo}</div>
    <div class="doc-body"></div>
    <div class="doc-actions">
  <button class="copy">📋 Copiar</button>
  <button class="editar">✏️ Editar</button>
  <button class="taxa">💰 Taxa</button>
  <button class="remove">➖ Remover</button>
</div>`;
        const body=d.querySelector('.doc-body');
        d.querySelector('.doc-header').onclick=()=>{
            body.style.display=body.style.display==='none'?'block':'none';
        };
        d.querySelector('.copy').onclick = function () {
            const texto =
                  body.querySelector('.doc-final')?.innerText || '';

            navigator.clipboard.writeText(texto.trim());

            // ===== FEEDBACK NO PRÓPRIO BOTÃO =====
            const btn = this;
            const original = btn.innerHTML;

            btn.classList.add('copiado');
            btn.innerHTML = '✅ Copiado';

            setTimeout(() => {
                btn.classList.remove('copiado');
                btn.innerHTML = original;
            }, 1000);
        };
       d.querySelector('.editar').onclick = () => {
    const id = body.dataset.ocrId;
    if (!id) return;

    const registro = registrosOCR.find(r => r.id === id);
    if (!registro) return;

    const nomeEl = body.querySelector('.final-nome');
    const horaEl = body.querySelector('.final-hora');
    const pixEl  = body.querySelector('.final-pix');
    const taxaEl = body.querySelector('.final-taxa');

    if (!nomeEl || !horaEl || !pixEl ) return;

    // 🔓 ativa edição
    [nomeEl, horaEl, pixEl].forEach(el => {
        el.contentEditable = true;
        el.classList.add('edit-field');
    });

    nomeEl.focus();

    const salvar = () => {
        // 🧾 salva dados limpos
        registro.nome = nomeEl.textContent.trim();
        registro.hora = horaEl.textContent.trim();

        registro.valor = pixEl.textContent
            .replace(/[^\d,]/g, '')
            .trim();



        // 🔒 trava edição
        [nomeEl, horaEl, pixEl].forEach(el => {
            el.contentEditable = false;
            el.classList.remove('edit-field');
        });

        salvarStorage();
        atualizarVisualFinal(body);
        atualizarTotalTela();
    };

    // ⏎ ENTER salva
    [nomeEl, horaEl, pixEl].forEach(el => {
        el.onkeydown = e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                salvar();
            }
        };
    });

    // 🖱️ sair do último campo salva
    taxaEl.onblur = salvar;
};



        d.querySelector('.taxa').onclick = () => {
            const id = body.dataset.ocrId;
            if (!id) return;

            const registro = registrosOCR.find(r => r.id === id);
            if (!registro) return;

            const atual = registro.taxa
            ? registro.taxa.toString().replace('.', ',')
            : '';

            let valor = prompt('Informe a TAXA (ex: 5,00)', atual);
            if (valor === null) return;

            valor = valor
                .replace(/[^\d,]/g, '')
                .replace(',', '.');

            const n = Number(valor);

            if (isNaN(n)) {
                alert('❌ Taxa inválida');
                return;
            }

            registro.taxa = n; // ✅ número real
            salvarStorage();
            atualizarVisualFinal(body);
            alert(`✅ Taxa R$ ${n.toFixed(2)} salva`);
        };

        d.querySelector('.remove').onclick = () => {

            const id = d.querySelector('.doc-body')?.dataset?.ocrId;

            // remove do JSON
            if (id) {
                const idx = registrosOCR.findIndex(r => r.id === id);
                if (idx !== -1) {
                    registrosOCR.splice(idx, 1);
                    salvarStorage();
                    atualizarTotalTela();
                }
            }

            // remove da tela
            const chave = d.getAttribute('data-chave');
            if (chave) arquivosAnexados.delete(chave);

            d.remove();
            atualizarContador();

        };
        list.prepend(d);
        return body;
    }

    async function processFile(file){
        const body=criarDoc(file.name);
        body.dataset.nomeArquivo = file.name;

        body.closest('.doc').setAttribute('data-chave', chaveArquivo(file));
        body.textContent='🔍 Processando...\n';
        if(file.type.includes('pdf')) await ocrPDF(file,body);
        else await ocrImg(file,body);
        body.textContent+='\n✅ Finalizado';
        aplicarRegras(body);
        atualizarTotalTela();

    }

    async function ocrImg(file,target){
        const {data}=await Tesseract.recognize(file,'por');
        target.textContent+=data.text;
    }

    async function ocrPDF(file,target){
        const buf=await file.arrayBuffer();
        const pdf=await pdfjsLib.getDocument({data:buf}).promise;
        for(let i=1;i<=pdf.numPages;i++){
            const p=await pdf.getPage(i);
            const v=p.getViewport({scale:2});
            const c=document.createElement('canvas');
            const ctx=c.getContext('2d');
            c.width=v.width;
            c.height=v.height;
            await p.render({canvasContext:ctx,viewport:v}).promise;
            const blob=await new Promise(r=>c.toBlob(r));
            const {data}=await Tesseract.recognize(blob,'por');
            target.textContent+=`\n📄 Página ${i}\n${data.text}`;
        }
    }
    /* ========= PASTE ========= */
    document.addEventListener('paste',e=>{
        for(const i of e.clipboardData?.items||[]){
            if(i.type.startsWith('image/')){
                processFiles([i.getAsFile()]);

            }
        }
    });
})();
