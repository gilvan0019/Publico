// ==UserScript==
// @name         Smartbus - Print de horarios
// @namespace    http://tampermonkey.net/
// @version      1.9.6
// @match        *://*.smarttravelit.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

// =========================================================================
// SCRIPT 1: TABELA
// - Cabeçalho com origem/destino em autoaltura
// - Pega sempre o MENOR valor disponível da linha
// - Botão COPIAR TABELA dentro do footer da página
// - Bloco verde de crédito REMOVIDO da imagem
// =========================================================================
(function() {
    'use strict';

    function limparTudo() {
        sessionStorage.removeItem("william_credito_remarcacao");
    }

    function normalizarTexto(txt) {
        return (txt || '').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    function elementoVisivel(el) {
        if (!el || !el.isConnected) return false;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        const st = window.getComputedStyle(el);

        if (
            st.display === 'none' ||
            st.visibility === 'hidden' ||
            parseFloat(st.opacity || '1') === 0
        ) {
            return false;
        }

        return true;
    }

    function injetarEstiloBotaoTabela() {
        if (document.getElementById('william-style-copy-table')) return;
        if (!document.head) return;

        const style = document.createElement('style');
        style.id = 'william-style-copy-table';

        style.textContent = `
            #btn-copy-william {
                position: relative !important;
                z-index: 10 !important;

                width: 150px !important;
                min-width: 150px !important;
                max-width: 150px !important;

                height: 38px !important;
                min-height: 38px !important;
                max-height: 38px !important;

                padding: 0 14px !important;
                margin: 0 8px !important;

                background: #303F9F !important;
                color: #ffffff !important;

                border: none !important;
                border-radius: 2px !important;

                cursor: pointer !important;
                font-weight: 700 !important;
                font-size: 14px !important;
                line-height: 38px !important;
                font-family: Arial, Helvetica, sans-serif !important;

                text-transform: uppercase !important;
                text-align: center !important;
                white-space: nowrap !important;

                overflow: hidden !important;
                box-sizing: border-box !important;

                box-shadow: 0 4px 12px rgba(0,0,0,0.22) !important;
                transition:
                    background-color 0.18s ease,
                    transform 0.12s ease,
                    box-shadow 0.18s ease;
            }

            #btn-copy-william:hover {
                background: #26358f !important;
                box-shadow: 0 6px 16px rgba(0,0,0,0.26) !important;
                transform: translateY(-1px);
            }

            #btn-copy-william:active {
                background: #1f2d7a !important;
                transform: translateY(0);
                box-shadow: 0 3px 8px rgba(0,0,0,0.18) !important;
            }
        `;

        document.head.appendChild(style);
    }

    function encontrarFooterBotoes() {
        return document.querySelector('.div-process-footer-buttons');
    }

    function encontrarBotaoNovaPesquisaDentroFooter(footer) {
        if (!footer) return null;

        const elementos = Array.from(
            footer.querySelectorAll('button, a, [role="button"], div, span')
        );

        return elementos.find(el => {
            if (!elementoVisivel(el)) return false;

            const txt = normalizarTexto(el.innerText);
            return txt.includes('NOVA PESQUISA');
        });
    }

    function limparNomeCidade(txt) {
        return (txt || '')
            .replace(/\s+/g, ' ')
            .replace(/\s*-\s*[A-Z]{2}$/i, '')
            .replace(/^[A-Z]{3}\s*-\s*/i, '')
            .trim();
    }

    function ajustarTextoNoLimite(ctx, texto, maxWidth, tamanhoInicial, tamanhoMinimo, peso = 'bold', familia = 'Arial') {
        let tamanho = tamanhoInicial;
        let txt = (texto || '').trim();

        while (tamanho >= tamanhoMinimo) {
            ctx.font = `${peso} ${tamanho}px ${familia}`;

            if (ctx.measureText(txt).width <= maxWidth) {
                return {
                    texto: txt,
                    tamanho
                };
            }

            tamanho--;
        }

        ctx.font = `${peso} ${tamanhoMinimo}px ${familia}`;

        if (ctx.measureText(txt).width <= maxWidth) {
            return {
                texto: txt,
                tamanho: tamanhoMinimo
            };
        }

        while (txt.length > 3 && ctx.measureText(txt + '...').width > maxWidth) {
            txt = txt.slice(0, -1);
        }

        return {
            texto: txt + '...',
            tamanho: tamanhoMinimo
        };
    }

    function quebrarTextoEmLinhas(ctx, texto, maxWidth, font) {
        texto = (texto || '').trim();
        ctx.font = font;

        const palavras = texto.split(/\s+/);
        const linhas = [];
        let linhaAtual = '';

        palavras.forEach(palavra => {
            const teste = linhaAtual ? linhaAtual + ' ' + palavra : palavra;

            if (ctx.measureText(teste).width <= maxWidth) {
                linhaAtual = teste;
            } else {
                if (linhaAtual) linhas.push(linhaAtual);

                if (ctx.measureText(palavra).width > maxWidth) {
                    let pedaco = '';

                    for (let char of palavra) {
                        const testeChar = pedaco + char;

                        if (ctx.measureText(testeChar).width <= maxWidth) {
                            pedaco = testeChar;
                        } else {
                            if (pedaco) linhas.push(pedaco);
                            pedaco = char;
                        }
                    }

                    linhaAtual = pedaco;
                } else {
                    linhaAtual = palavra;
                }
            }
        });

        if (linhaAtual) linhas.push(linhaAtual);

        return linhas;
    }

    function desenharTextoMultilinha(ctx, linhas, x, y, alturaLinha) {
        linhas.forEach((linha, index) => {
            ctx.fillText(linha, x, y + (index * alturaLinha));
        });
    }

    function desenharCartao(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }

    try {
        const nav = performance.getEntriesByType("navigation")[0];

        if (nav && nav.type === "reload") {
            limparTudo();
        }
    } catch (e) {}

    let linkAtual = window.location.hash;

    setInterval(() => {
        if (window.location.hash !== linkAtual) {
            linkAtual = window.location.hash;

            if (
                linkAtual === '#/' ||
                linkAtual === '#/home' ||
                linkAtual === '#/dashboard' ||
                linkAtual === ''
            ) {
                limparTudo();
            }
        }
    }, 1500);

    function setCredito(valor) {
        sessionStorage.setItem("william_credito_remarcacao", valor.toString());
    }

    function getCredito() {
        const valor = sessionStorage.getItem("william_credito_remarcacao");
        return valor ? parseFloat(valor) : 0;
    }

    function extrairNumero(texto) {
        if (!texto) return 0;

        let limpo = texto
            .replace(/[^\d,]/g, '')
            .replace(',', '.');

        return parseFloat(limpo) || 0;
    }

    function capturarValorLiquido() {
        const ths = Array.from(document.querySelectorAll('th'));
        const idx = ths.findIndex(th => th.innerText.toUpperCase().includes('LÍQUIDO'));

        if (idx !== -1) {
            const td = document.querySelector('tbody tr td:nth-child(' + (idx + 1) + ')');

            if (td && !td.dataset.marcado) {
                const valorNum = extrairNumero(td.innerText);

                if (valorNum > 0) {
                    setCredito(valorNum);

                    td.style.backgroundColor = "#d4edda";
                    td.style.border = "3px solid #28a745";
                    td.dataset.marcado = "true";
                }
            }
        }
    }

    function capturarTrechoDetalhado() {
        let origem = document.querySelector('#txt-origem')?.value || "";
        let destino = document.querySelector('#txt-destino')?.value || "";

        if (!origem || !destino) {
            const textoTopo = document.body.innerText.substring(0, 1500);
            const match = textoTopo.match(/de\s+(.*?)\s+para\s+(.*?)(?:\n|em |$)/i);

            if (match) {
                origem = match[1].trim();
                destino = match[2].trim();
            }
        }

        let isVolta = false;

        let abasAtivas = document.querySelectorAll('.active, .current, .selected');

        for (let i = 0; i < abasAtivas.length; i++) {
            let txtAba = abasAtivas[i].innerText.toUpperCase();

            if (
                txtAba.includes('VOLTA') &&
                !txtAba.includes('IDA E VOLTA') &&
                !txtAba.includes('IDA E RETORNO')
            ) {
                isVolta = true;
                break;
            }
        }

        if (
            document.body.innerText.toUpperCase().includes('ESCOLHA SUA VOLTA') ||
            document.body.innerText.toUpperCase().includes('TRECHO DE VOLTA') ||
            document.body.innerText.toUpperCase().includes('SELECIONE A VOLTA')
        ) {
            isVolta = true;
        }

        origem = limparNomeCidade(origem);
        destino = limparNomeCidade(destino);

        if (origem && destino) {
            if (isVolta) {
                const tmp = origem;
                origem = destino;
                destino = tmp;
            }

            return {
                origem: origem.toUpperCase(),
                destino: destino.toUpperCase(),
                texto: `${origem} ➔ ${destino}`.toUpperCase()
            };
        }

        return {
            origem: "",
            destino: "",
            texto: ""
        };
    }

    async function desenharECopiarImagem(dados) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const largura = 850;
        const margem = 30;
        const alturaCartao = 95;
        const espacoEntreCartoes = 15;

        const temTrechoDetalhado = !!(
            dados.trechoInfo &&
            dados.trechoInfo.origem &&
            dados.trechoInfo.destino
        );

        const boxW = 315;
        const conteudoMax = boxW - 28;
        const fonteTrecho = 'bold 22px Arial';
        const alturaLinhaTrecho = 20;

        let origemLinhas = [];
        let destinoLinhas = [];
        let alturaBoxTrecho = 60;
        let alturaCabecalho = 100;

        if (temTrechoDetalhado) {
            origemLinhas = quebrarTextoEmLinhas(
                ctx,
                dados.trechoInfo.origem,
                conteudoMax,
                fonteTrecho
            );

            destinoLinhas = quebrarTextoEmLinhas(
                ctx,
                dados.trechoInfo.destino,
                conteudoMax,
                fonteTrecho
            );

            const maiorQtdLinhas = Math.max(origemLinhas.length, destinoLinhas.length);

            alturaBoxTrecho = Math.max(
                60,
                30 + (maiorQtdLinhas * alturaLinhaTrecho) + 12
            );

            alturaCabecalho = 55 + alturaBoxTrecho + 25;
        }

        let altura = alturaCabecalho + 40;
        altura += (dados.viagens.length * (alturaCartao + espacoEntreCartoes)) + 30;

        canvas.width = largura;
        canvas.height = altura;

        ctx.fillStyle = '#F4F6F8';
        ctx.fillRect(0, 0, largura, altura);

        ctx.fillStyle = '#303F9F';
        ctx.fillRect(0, 0, largura, alturaCabecalho);

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.font = 'bold 26px Arial';
        ctx.fillText(`${dados.isRemarcacao ? 'REMARCAÇÃO' : 'VIAGEM'}`, margem, 34);

        ctx.textAlign = 'right';

        const dataHeader = ajustarTextoNoLimite(
            ctx,
            dados.dataTexto || 'DATA',
            300,
            18,
            14,
            'bold',
            'Arial'
        );

        ctx.font = `bold ${dataHeader.tamanho}px Arial`;
        ctx.fillText(dataHeader.texto, largura - margem, 34);

        ctx.textAlign = 'left';

        if (temTrechoDetalhado) {
            const boxY = 55;
            const box1X = margem;
            const box2X = largura - margem - boxW;
            const arrowX = largura / 2;

            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            desenharCartao(ctx, box1X, boxY, boxW, alturaBoxTrecho, 10);

            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('ORIGEM', box1X + 14, boxY + 18);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = fonteTrecho;
            desenharTextoMultilinha(
                ctx,
                origemLinhas,
                box1X + 14,
                boxY + 43,
                alturaLinhaTrecho
            );

            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            desenharCartao(ctx, box2X, boxY, boxW, alturaBoxTrecho, 10);

            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('DESTINO', box2X + 14, boxY + 18);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = fonteTrecho;
            desenharTextoMultilinha(
                ctx,
                destinoLinhas,
                box2X + 14,
                boxY + 43,
                alturaLinhaTrecho
            );

            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 34px Arial';
            ctx.fillText('➜', arrowX, boxY + (alturaBoxTrecho / 2) + 11);
            ctx.textAlign = 'left';
        } else {
            const trechoTexto = dados.trechoInfo?.texto || '';

            if (trechoTexto) {
                const trechoAjustado = ajustarTextoNoLimite(
                    ctx,
                    trechoTexto,
                    largura - (margem * 2),
                    22,
                    14,
                    'bold',
                    'Arial'
                );

                ctx.fillStyle = '#FFFFFF';
                ctx.font = `bold ${trechoAjustado.tamanho}px Arial`;
                ctx.fillText(trechoAjustado.texto, margem, 76);
            }
        }

        let yAtual = alturaCabecalho + 20;

        dados.viagens.forEach((v) => {
            ctx.shadowColor = 'rgba(0,0,0,0.08)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;

            ctx.fillStyle = '#FFFFFF';
            desenharCartao(ctx, margem, yAtual, largura - (margem * 2), alturaCartao, 10);

            ctx.shadowColor = 'transparent';

            ctx.fillStyle = '#212121';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(v.saida, margem + 25, yAtual + 40);

            ctx.fillStyle = '#757575';
            ctx.font = '16px Arial';
            ctx.fillText(`chegada ${v.chegada}`, margem + 25, yAtual + 65);

            ctx.fillStyle = '#E0E0E0';
            ctx.fillRect(margem + 150, yAtual + 20, 2, 55);

            ctx.fillStyle = '#303F9F';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(v.servico, margem + 175, yAtual + 40);

            ctx.fillStyle = '#616161';
            ctx.font = '16px Arial';
            ctx.fillText(`💺 ${v.textoPoltronas}`, margem + 175, yAtual + 65);

            ctx.fillStyle = '#E0E0E0';
            ctx.fillRect(largura - margem - 300, yAtual + 20, 2, 55);

            ctx.textAlign = 'right';

            let prefixo = "";
            let valorEmDestaque = v.displayValor;

            if (v.displayValor.includes("R$")) {
                const partes = v.displayValor.split("R$");
                prefixo = partes[0].trim();
                valorEmDestaque = "R$ " + partes[1].trim();
            }

            if (prefixo !== "") {
                ctx.fillStyle = '#757575';
                ctx.font = '14px Arial';
                ctx.fillText(prefixo, largura - margem - 25, yAtual + 40);

                ctx.fillStyle = '#00BD07';
                ctx.font = 'bold 26px Arial';
                ctx.fillText(valorEmDestaque, largura - margem - 25, yAtual + 70);
            } else {
                ctx.fillStyle = '#00BD07';
                ctx.font = 'bold 24px Arial';
                ctx.fillText(valorEmDestaque, largura - margem - 25, yAtual + 55);
            }

            ctx.textAlign = 'left';

            yAtual += alturaCartao + espacoEntreCartoes;
        });

        canvas.toBlob(async function(blob) {
            try {
                const item = new ClipboardItem({
                    "image/png": blob
                });

                await navigator.clipboard.write([item]);

                limparTudo();

                const btn = document.getElementById('btn-copy-william');

                if (btn) {
                    btn.style.background = "#28a745";
                    btn.innerHTML = `✅ COPIADO`;

                    setTimeout(() => {
                        btn.style.background = "#303F9F";
                        btn.innerHTML = "COPIAR TABELA";
                    }, 3000);
                }
            } catch (err) {
                console.error(err);
                alert("Erro ao copiar. Clique na tela e tente novamente.");
            }
        }, "image/png");
    }

    function extrairDados() {
        const credito = getCredito();

        const elementoData = document.querySelector(
            '.service-date-title, #txt-data-ida-retorno, .active .date-value'
        );

        let dataTexto = elementoData ? elementoData.innerText.trim().toUpperCase() : "DATA";

        dataTexto = dataTexto
            .replace('EM ', '')
            .replace('COPIAR', '')
            .trim();

        const trechoInfo = capturarTrechoDetalhado();

        const blocosHorario = document.querySelectorAll('.service-col-3');

        let viagens = [];

        blocosHorario.forEach(bloco => {
            const linha = bloco.closest('.service-row') || bloco.parentElement?.parentElement;

            if (!linha) return;

            const b = bloco.querySelectorAll('b');

            const saida = b[0]?.innerText.trim() || "";
            const chegada = b[1]?.innerText.trim() || "";

            if (!saida || saida === "00:00") return;

            const servico = linha.querySelector('.spn-class')?.innerText.trim() || "CONVENCIONAL";

            const poltTxt = linha
                .querySelector('.service-availability, [class*="availability"]')
                ?.innerText
                .replace(/[^0-9]/g, '') || "0";

            const polt = parseInt(poltTxt);

            if (polt <= 0) return;

            let valoresEncontrados = [];

            const celulas = linha.querySelectorAll(
                'td, .price-family-container, .service-price-family'
            );

            for (let c of celulas) {
                let txt = c.innerText.toUpperCase();

                if (
                    (txt.includes('BRL') || txt.includes('R$')) &&
                    !txt.includes('INDISPONÍVEL') &&
                    !txt.includes('ESGOTADO')
                ) {
                    const valoresNoTexto = txt.match(/(?:BRL|R\$)\s*\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];

                    valoresNoTexto.forEach(valorTexto => {
                        const valorNum = extrairNumero(valorTexto);

                        if (valorNum > 0) {
                            valoresEncontrados.push(valorNum);
                        }
                    });
                }
            }

            if (valoresEncontrados.length === 0) return;

            let valorNovo = Math.min(...valoresEncontrados);

            let displayValor = "R$ " + valorNovo.toLocaleString('pt-BR', {
                minimumFractionDigits: 2
            });

            const textoPoltronas = polt === 1 ? "1 vaga" : `${polt} vagas`;

            viagens.push({
                saida,
                chegada,
                servico,
                displayValor,
                textoPoltronas
            });
        });

        if (viagens.length > 0) {
            desenharECopiarImagem({
                isRemarcacao: credito > 0,
                credito,
                dataTexto,
                trechoInfo,
                viagens
            });
        } else {
            alert("Nenhum horário com vaga disponível encontrado.");
        }
    }

    function gerenciarBotao() {
        injetarEstiloBotaoTabela();

        const temHorarios = document.querySelector('.service-col-3') !== null;
        let btn = document.getElementById('btn-copy-william');

        if (temHorarios) {
            const footer = encontrarFooterBotoes();

            if (!footer) return;

            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btn-copy-william';
                btn.innerHTML = 'COPIAR TABELA';
                btn.onclick = extrairDados;
            }

            btn.style.display = 'inline-block';

            const botaoNovaPesquisa = encontrarBotaoNovaPesquisaDentroFooter(footer);

            if (botaoNovaPesquisa && botaoNovaPesquisa.parentElement) {
                if (btn.parentElement !== footer) {
                    footer.insertBefore(btn, botaoNovaPesquisa);
                }
            } else {
                if (btn.parentElement !== footer) {
                    footer.appendChild(btn);
                }
            }

        } else if (btn) {
            btn.style.display = 'none';
        }
    }

    setInterval(() => {
        gerenciarBotao();
        capturarValorLiquido();
    }, 1200);

})();

// =========================================================================
// SCRIPT 2: CARTÃO DE EMBARQUE DIGITAL (V4.7 ORIGINAL COM AVISO PRÉVIO)
// =========================================================================
(function() {
    'use strict';

    const DICIONARIO_CIDADES = {
        "THE": "TERESINA",
        "PHB": "PARNAÍBA",
        "FOR": "FORTALEZA",
        "SLZ": "SÃO LUÍS",
        "PIC": "PICOS",
        "FLR": "FLORIANO",
        "SOB": "SOBRAL",
        "CJP": "CAJUEIRO DA PRAIA",
        "LCR": "LUÍS CORREIA",
        "NAT": "NATAL",
        "REC": "RECIFE",
        "JPA": "JOÃO PESSOA",
        "MCZ": "MACEIÓ",
        "AJU": "ARACAJU",
        "SSA": "SALVADOR",
        "BEL": "BELÉM",
        "IMP": "IMPERATRIZ",
        "PNZ": "PETROLINA",
        "JDO": "JUAZEIRO DO NORTE",
        "CMP": "CAMPO MAIOR",
        "PIR": "PIRIPIRI",
        "MOS": "MOSSORÓ",
        "TBA": "TIANGUÁ",
        "CCM": "CAMOCIM",
        "CANGA": "RECIFE (CAXANGA)"
    };

    function desenharRetanguloArredondado(ctx, x, y, width, height, radius, fillStyle) {
        ctx.fillStyle = fillStyle;

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }

    function traduzirSigla(sigla) {
        let s = sigla.replace(/[^A-Z]/ig, '').toUpperCase();
        return DICIONARIO_CIDADES[s] || sigla;
    }

    function espionarTrechosCompletos() {
        try {
            let origem = document.querySelector('#txt-origem')?.value || "";
            let destino = document.querySelector('#txt-destino')?.value || "";

            if (!origem || !destino) {
                const textoTopo = document.body.innerText.substring(0, 1500);
                const match = textoTopo.match(/de\s+(.*?)\s+para\s+(.*?)(?:\n|em |$)/i);

                if (match) {
                    origem = match[1].trim();
                    destino = match[2].trim();
                }
            }

            if (origem && destino) {
                origem = origem
                    .replace(/\s*-\s*[A-Z]{2}$/i, '')
                    .replace(/^[A-Z]{3}\s*-\s*/i, '')
                    .trim()
                    .toUpperCase();

                destino = destino
                    .replace(/\s*-\s*[A-Z]{2}$/i, '')
                    .replace(/^[A-Z]{3}\s*-\s*/i, '')
                    .trim()
                    .toUpperCase();

                if (origem.length > 2 && destino.length > 2) {
                    sessionStorage.setItem("william_cidades_longas", JSON.stringify({
                        origem,
                        destino
                    }));
                }
            }
        } catch (erro) {}
    }

    function capturarDadosConfirmacao() {
        let reserva = {
            tipo: "CONFERÊNCIA DE REMARCAÇÃO",
            origem: "---",
            destino: "---",
            data: "---",
            horario: "---",
            passageiro: "---",
            servico: "CONVENCIONAL",
            poltrona: "--"
        };

        let textoAchatado = document.body.innerText.replace(/\s+/g, ' ').toUpperCase();

        let mData = textoAchatado.match(/(\d{2}\/\d{2}\/\d{4})/);

        if (mData) {
            reserva.data = mData[1];
        }

        let mHora = textoAchatado.match(/(\d{2}:\d{2})\s*(?:-|ÀS|ATÉ)\s*(\d{2}:\d{2})/);

        if (mHora) {
            reserva.horario = `${mHora[1]} às ${mHora[2]}`;
        }

        let mNome = textoAchatado.match(
            /#\d+\s+([A-ZÀ-ÖØ-öø-ÿ\s]+?)\s+(?:NORMAL|PASSE LIVRE|IDOSO|ESTUDANTE|BPE|ID JOVEM|CRIANÇA|GRATUIDADE|CORTESIA|RG|CPF|BRL|R\$)/
        );

        if (mNome) {
            reserva.passageiro = mNome[1].trim();
        }

        let mTrecho = textoAchatado.match(
            /\b([A-Z]{2,12})\b\s*(?:->|➔|→|>)?\s*\b([A-Z]{2,12})\b\s*\(([^()]{2,20})\)\s*(\d{1,3})\b/
        );

        if (mTrecho) {
            reserva.origem = mTrecho[1];
            reserva.destino = mTrecho[2];
            reserva.servico = mTrecho[3].replace(/[^A-Z]/g, '');
            reserva.poltrona = mTrecho[4];
        } else {
            let mTrechoIsolado = textoAchatado.match(
                /\b([A-Z]{2,12})\b\s*(?:->|➔|→|>)?\s*\b([A-Z]{2,12})\b\s*\(([^()]{2,20})\)/
            );

            if (mTrechoIsolado) {
                reserva.origem = mTrechoIsolado[1];
                reserva.destino = mTrechoIsolado[2];
                reserva.servico = mTrechoIsolado[3].replace(/[^A-Z]/g, '');

                let pos = textoAchatado.indexOf(mTrechoIsolado[0]);
                let textoRestante = textoAchatado.substring(pos + mTrechoIsolado[0].length).trim();
                let mPoltronaGarante = textoRestante.match(/^(\d{1,3})\b/);

                if (mPoltronaGarante) {
                    reserva.poltrona = mPoltronaGarante[1];
                }
            }
        }

        if (reserva.servico.length > 15 || reserva.servico.length < 2) {
            if (textoAchatado.includes('LEITO')) {
                reserva.servico = 'LEITO';
            } else if (textoAchatado.includes('EXECUTIVO')) {
                reserva.servico = 'EXECUTIVO';
            } else {
                reserva.servico = 'CONVENCIONAL';
            }
        }

        reserva.origem = traduzirSigla(reserva.origem);
        reserva.destino = traduzirSigla(reserva.destino);

        try {
            let trechosMemoria = sessionStorage.getItem("william_cidades_longas");

            if (trechosMemoria) {
                let dadosSalvos = JSON.parse(trechosMemoria);

                if (dadosSalvos.origem && dadosSalvos.origem.length > 3) {
                    reserva.origem = dadosSalvos.origem;
                }

                if (dadosSalvos.destino && dadosSalvos.destino.length > 3) {
                    reserva.destino = dadosSalvos.destino;
                }
            }
        } catch(e) {}

        return reserva;
    }

    async function gerarImagemCartao(reserva) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const largura = 850;
        const altura = 490;
        const margem = 30;

        canvas.width = largura;
        canvas.height = altura;

        ctx.fillStyle = '#F4F6F8';
        ctx.fillRect(0, 0, largura, altura);

        ctx.fillStyle = '#303F9F';
        ctx.fillRect(0, 0, largura, 90);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`🔄 ${reserva.tipo}`, margem, 55);

        let yAtual = 115;

        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        desenharRetanguloArredondado(
            ctx,
            margem,
            yAtual,
            largura - (margem * 2),
            65,
            8,
            '#FFF3F3'
        );

        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#FFCDD2';
        ctx.lineWidth = 2;
        ctx.strokeRect(margem, yAtual, largura - (margem * 2), 65);

        ctx.fillStyle = '#B71C1C';
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px Arial';
        ctx.fillText("Verifique os dados abaixo.", largura / 2, yAtual + 28);

        ctx.font = 'bold 14px Arial';
        ctx.fillText("O bilhete final será gerado somente após a sua confirmação.", largura / 2, yAtual + 48);

        yAtual += 80;

        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        desenharRetanguloArredondado(
            ctx,
            margem,
            yAtual,
            largura - (margem * 2),
            140,
            10,
            '#FFFFFF'
        );

        ctx.shadowColor = 'transparent';
        ctx.textAlign = 'left';

        ctx.fillStyle = '#757575';
        ctx.font = '14px Arial';
        ctx.fillText('PASSAGEIRO', margem + 25, yAtual + 30);

        ctx.fillStyle = '#212121';
        ctx.font = 'bold 22px Arial';

        let nomeVisual = reserva.passageiro.length > 45
            ? reserva.passageiro.substring(0, 45) + "..."
            : reserva.passageiro;

        ctx.fillText(nomeVisual, margem + 25, yAtual + 55);

        ctx.textAlign = 'right';

        ctx.fillStyle = '#757575';
        ctx.font = '14px Arial';
        ctx.fillText('CLASSE', largura - margem - 25, yAtual + 30);

        ctx.fillStyle = '#E65100';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(reserva.servico, largura - margem - 25, yAtual + 55);

        ctx.textAlign = 'left';

        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(margem + 20, yAtual + 75, largura - (margem * 2) - 40, 2);

        ctx.fillStyle = '#303F9F';

        let textoItin = `${reserva.origem}  ➔  ${reserva.destino}`;
        let tamFonte = textoItin.length > 35 ? 24 : 32;

        ctx.font = `bold ${tamFonte}px Arial`;
        ctx.fillText(textoItin, margem + 25, yAtual + 115);

        yAtual += 155;

        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        desenharRetanguloArredondado(
            ctx,
            margem,
            yAtual,
            largura - (margem * 2),
            100,
            10,
            '#FFFFFF'
        );

        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#757575';
        ctx.font = '14px Arial';
        ctx.fillText('DATA', margem + 25, yAtual + 40);

        ctx.fillStyle = '#212121';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(`📅 ${reserva.data}`, margem + 25, yAtual + 70);

        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(margem + 230, yAtual + 20, 2, 60);

        ctx.fillStyle = '#757575';
        ctx.font = '14px Arial';
        ctx.fillText('HORÁRIO', margem + 260, yAtual + 40);

        ctx.fillStyle = '#212121';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(`⏱️ ${reserva.horario}`, margem + 260, yAtual + 70);

        let boxPW = 140;
        let boxPX = largura - margem - boxPW - 20;
        let boxPY = yAtual + 15;

        desenharRetanguloArredondado(
            ctx,
            boxPX,
            boxPY,
            boxPW,
            70,
            8,
            '#E8F5E9'
        );

        ctx.textAlign = 'center';

        ctx.fillStyle = '#2E7D32';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('POLTRONA', boxPX + (boxPW / 2), boxPY + 25);

        ctx.font = '900 32px Arial';
        ctx.fillText(reserva.poltrona, boxPX + (boxPW / 2), boxPY + 58);

        ctx.textAlign = 'left';

        canvas.toBlob(async function(blob) {
            try {
                const item = new ClipboardItem({
                    "image/png": blob
                });

                await navigator.clipboard.write([item]);

                const btn = document.getElementById('btn-bilhete-william');

                if (btn) {
                    btn.style.background = "#28a745";
                    btn.innerHTML = `✅ Prévia Copiada`;

                    setTimeout(() => {
                        btn.style.background = "#303F9F";
                        btn.innerHTML = "Gerar Prévia de Remarcação";
                    }, 3000);
                }
            } catch (err) {
                alert("Erro ao copiar para a área de transferência.");
            }
        }, "image/png");
    }

    function adicionarDrag(btn) {
        let isDragging = false;
        let dragStartX;
        let dragStartY;

        btn.onmousedown = function(e) {
            isDragging = false;

            dragStartX = e.clientX;
            dragStartY = e.clientY;

            let shiftX = e.clientX - btn.getBoundingClientRect().left;
            let shiftY = e.clientY - btn.getBoundingClientRect().top;

            function moveAt(pageX, pageY) {
                btn.style.bottom = 'auto';
                btn.style.right = 'auto';
                btn.style.left = pageX - shiftX + 'px';
                btn.style.top = pageY - shiftY + 'px';
            }

            function onMouseMove(e) {
                if (
                    Math.abs(e.clientX - dragStartX) > 3 ||
                    Math.abs(e.clientY - dragStartY) > 3
                ) {
                    isDragging = true;
                    moveAt(e.clientX, e.clientY);
                }
            }

            document.addEventListener('mousemove', onMouseMove);

            document.onmouseup = function() {
                document.removeEventListener('mousemove', onMouseMove);
                document.onmouseup = null;
            };
        };

        btn.onclick = function() {
            if (isDragging) return;

            btn.innerHTML = "⌛ Gerando...";
            gerarImagemCartao(capturarDadosConfirmacao());
        };
    }

    function iniciar() {
        espionarTrechosCompletos();

        const textoTela = document.body.innerText.toUpperCase();

        const isRemarcacao = (
            textoTela.includes('TIPO DA OPERAÇÃO') ||
            textoTela.includes('TIPO DA OPERACAO')
        ) && textoTela.includes('PASSAGEIRO');

        let btn = document.getElementById('btn-bilhete-william');

        if (isRemarcacao) {
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btn-bilhete-william';
                btn.innerHTML = 'Gerar Prévia de Remarcação';

                btn.style = `
                    position: fixed;
                    bottom: 17px;
                    right: 600px;
                    z-index: 999999;
                    padding: 5px 8px;
                    background: #303F9F;
                    color: white;
                    border: 3px solid #303F9F;
                    border-radius: 0px;
                    cursor: pointer;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    font-size: 16px;
                `;

                document.body.appendChild(btn);
                adicionarDrag(btn);
            }
        } else if (btn) {
            btn.remove();
        }
    }

    setInterval(iniciar, 1500);

})();
