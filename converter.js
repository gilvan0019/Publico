// ==UserScript==
// @name         ChatPro - Conversor Universal para Google Contatos
// @namespace    https://chatpro.google.contacts.universal.converter
// @version      2.2.1
// @description  Converte XLSX, XLS, CSV ou TXT para CSV compatível com Google Contatos usando nome, sobrenome e telefone
// @author       Gilvan
// @match        https://app.chatpro.com.br/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (location.hostname !== 'app.chatpro.com.br') return;
    if (!location.pathname.startsWith('/chat')) return;

    const PANEL_ID = 'gc-conversor-universal-panel';

    const POSSIVEIS_NOMES = [
        'nome',
        'name',
        'lead_nome',
        'lead name',
        'cliente',
        'contato',
        'customer',
        'full name',
        'nome completo',
        'first name',
        'firstname',
        'nome_cliente',
        'lead'
    ];

    const POSSIVEIS_SOBRENOMES = [
        'sobrenome',
        'last name',
        'lastname',
        'surname',
        'apelido',
        'ultimo nome'
    ];

    const POSSIVEIS_TELEFONES = [
        'telefone',
        'phone',
        'number',
        'numero',
        'número',
        'celular',
        'whatsapp',
        'lead_number',
        'lead number',
        'telefone1',
        'telefone 1',
        'phone 1',
        'phone number',
        'mobile',
        'contato telefone',
        'fone'
    ];

    function limparTexto(txt) {
        return String(txt || '')
            .replace(/\u200e/g, '')
            .replace(/\u200f/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizarChave(chave) {
        return String(chave || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[_\-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizarTelefone(valor) {
        if (!valor) return '';

        let telefone = String(valor)
            .replace(/[^\d+]/g, '')
            .trim();

        if (!telefone) return '';

        if (telefone.startsWith('00')) {
            telefone = '+' + telefone.slice(2);
        }

        if (telefone.startsWith('+')) {
            return telefone;
        }

        const numeros = telefone.replace(/\D/g, '');

        if (numeros.length === 10 || numeros.length === 11) {
            return '+55' + numeros;
        }

        if (numeros.length === 12 || numeros.length === 13) {
            return '+' + numeros;
        }

        return '';
    }

    function telefoneValido(telefone) {
        const numeros = String(telefone || '').replace(/\D/g, '');
        return numeros.length >= 10 && numeros.length <= 15;
    }

    function extrairTelefoneDeTexto(txt) {
        txt = limparTexto(txt);

        const regexes = [
            /\+\d{1,3}\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g,
            /\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g,
            /\d{10,13}/g
        ];

        for (const regex of regexes) {
            const matches = txt.match(regex);
            if (!matches) continue;

            for (const match of matches) {
                const tel = normalizarTelefone(match);
                if (telefoneValido(tel)) {
                    return tel;
                }
            }
        }

        return '';
    }

    function gerarNomeGenerico(telefone) {
        const numeros = String(telefone || '').replace(/\D/g, '');
        return 'Cliente WhatsApp ' + numeros.slice(-4);
    }

    function limparNome(nome) {
        nome = limparTexto(nome);
        nome = nome.replace(/^~/, '').trim();
        nome = nome.replace(/^nome\s*[:\-]\s*/i, '').trim();
        return nome;
    }

    function dividirNomeCompleto(nomeCompleto) {
        nomeCompleto = limparNome(nomeCompleto);

        const partes = nomeCompleto.split(/\s+/).filter(Boolean);

        if (partes.length === 0) {
            return { firstName: '', lastName: '' };
        }

        if (partes.length === 1) {
            return { firstName: partes[0], lastName: '' };
        }

        return {
            firstName: partes[0],
            lastName: partes.slice(1).join(' ')
        };
    }

    function escaparCSV(valor) {
        valor = String(valor || '');
        valor = valor.replace(/"/g, '""');
        return `"${valor}"`;
    }

    function baixarArquivo(nomeArquivo, conteudo, tipo) {
        const blob = new Blob([conteudo], { type: tipo });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 500);
    }

    function encontrarColuna(obj, nomesPossiveis) {
        const chaves = Object.keys(obj || {});
        const nomesNormalizados = nomesPossiveis.map(normalizarChave);

        for (const chave of chaves) {
            const chaveNormalizada = normalizarChave(chave);
            if (nomesNormalizados.includes(chaveNormalizada)) {
                return chave;
            }
        }

        for (const chave of chaves) {
            const chaveNormalizada = normalizarChave(chave);
            if (nomesNormalizados.some(nome => chaveNormalizada.includes(nome))) {
                return chave;
            }
        }

        return null;
    }

    function linhaEhVazia(linha) {
        return Object.values(linha || {}).every(valor => !limparTexto(valor));
    }

    function converterLinhasParaGoogleCSV(linhas) {
        const contatos = [];
        const telefonesVistos = new Set();

        let total = 0;
        let convertidos = 0;
        let duplicados = 0;
        let invalidos = 0;

        for (const linha of linhas) {
            if (!linha || linhaEhVazia(linha)) continue;

            total++;

            const colunaNome = encontrarColuna(linha, POSSIVEIS_NOMES);
            const colunaSobrenome = encontrarColuna(linha, POSSIVEIS_SOBRENOMES);
            const colunaTelefone = encontrarColuna(linha, POSSIVEIS_TELEFONES);

            let telefone = '';

            if (colunaTelefone) {
                telefone = normalizarTelefone(linha[colunaTelefone]);
            }

            if (!telefoneValido(telefone)) {
                const textoLinha = Object.values(linha).join(' ');
                telefone = extrairTelefoneDeTexto(textoLinha);
            }

            if (!telefoneValido(telefone)) {
                invalidos++;
                continue;
            }

            const chaveTelefone = telefone.replace(/\D/g, '');

            if (telefonesVistos.has(chaveTelefone)) {
                duplicados++;
                continue;
            }

            telefonesVistos.add(chaveTelefone);

            let firstName = '';
            let lastName = '';

            if (colunaNome && colunaSobrenome) {
                firstName = limparNome(linha[colunaNome]);
                lastName = limparNome(linha[colunaSobrenome]);
            } else if (colunaNome) {
                const nomeCompleto = limparNome(linha[colunaNome]);
                const dividido = dividirNomeCompleto(nomeCompleto);
                firstName = dividido.firstName;
                lastName = dividido.lastName;
            }

            if (!firstName && !lastName) {
                const nomeGenerico = gerarNomeGenerico(telefone);
                const dividido = dividirNomeCompleto(nomeGenerico);
                firstName = dividido.firstName;
                lastName = dividido.lastName;
            }

            const fileAs = `${firstName} ${lastName}`.trim();

            contatos.push({
                firstName,
                lastName,
                fileAs,
                telefone
            });

            convertidos++;
        }

        const colunasGoogle = [
            'Name Prefix',
            'First Name',
            'Middle Name',
            'Last Name',
            'Name Suffix',
            'Phonetic First Name',
            'Phonetic Middle Name',
            'Phonetic Last Name',
            'Nickname',
            'File As',
            'E-mail 1 - Label',
            'E-mail 1 - Value',
            'Phone 1 - Label',
            'Phone 1 - Value',
            'Address 1 - Label',
            'Address 1 - Country',
            'Address 1 - Street',
            'Address 1 - Extended Address',
            'Address 1 - City',
            'Address 1 - Region',
            'Address 1 - Postal Code',
            'Address 1 - PO Box',
            'Organization Name',
            'Organization Title',
            'Organization Department',
            'Birthday',
            'Event 1 - Label',
            'Event 1 - Value',
            'Relation 1 - Label',
            'Relation 1 - Value',
            'Website 1 - Label',
            'Website 1 - Value',
            'Custom Field 1 - Label',
            'Custom Field 1 - Value',
            'Notes',
            'Labels'
        ];

        const linhasCSV = contatos.map(contato => {
            const linhaGoogle = [
                '',
                contato.firstName,
                '',
                contato.lastName,
                '',
                '',
                '',
                '',
                '',
                contato.fileAs,
                '',
                '',
                'Mobile',
                contato.telefone,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ];

            return linhaGoogle.map(escaparCSV).join(',');
        });

        const csv = '\uFEFF' + colunasGoogle.map(escaparCSV).join(',') + '\n' + linhasCSV.join('\n');

        return {
            csv,
            total,
            convertidos,
            duplicados,
            invalidos
        };
    }

    function detectarSeparadorCSV(texto) {
        const primeiraLinha = texto.split(/\r?\n/).find(l => l.trim()) || '';
        const separadores = [',', ';', '\t', '|'];

        let melhorSeparador = ',';
        let maiorQuantidade = 0;

        for (const sep of separadores) {
            const quantidade = primeiraLinha.split(sep).length;
            if (quantidade > maiorQuantidade) {
                maiorQuantidade = quantidade;
                melhorSeparador = sep;
            }
        }

        return melhorSeparador;
    }

    function lerArquivoTexto(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    const texto = e.target.result;
                    const separador = detectarSeparadorCSV(texto);

                    const workbook = XLSX.read(texto, {
                        type: 'string',
                        raw: false,
                        FS: separador
                    });

                    const primeiraAba = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[primeiraAba];

                    const linhas = XLSX.utils.sheet_to_json(sheet, {
                        defval: '',
                        raw: false
                    });

                    resolve(linhas);
                } catch (erro) {
                    reject(erro);
                }
            };

            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    }

    function lerArquivoPlanilha(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);

                    const workbook = XLSX.read(data, {
                        type: 'array',
                        raw: false
                    });

                    const primeiraAba = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[primeiraAba];

                    const linhas = XLSX.utils.sheet_to_json(sheet, {
                        defval: '',
                        raw: false
                    });

                    resolve(linhas);
                } catch (erro) {
                    reject(erro);
                }
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async function lerArquivoUniversal(file) {
        const nome = file.name.toLowerCase();

        if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.ods')) {
            return await lerArquivoPlanilha(file);
        }

        if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
            return await lerArquivoTexto(file);
        }

        throw new Error('Formato não suportado');
    }

    function mostrarStatus(msg, erro = false) {
        const status = document.getElementById('gc-conversor-universal-status');
        if (!status) return;

        status.textContent = msg;
        status.style.color = erro ? '#b91c1c' : '#166534';
        status.style.background = erro ? '#fef2f2' : '#f0fdf4';
        status.style.border = erro ? '1px solid #fecaca' : '1px solid #bbf7d0';
        status.style.display = 'block';
    }

    async function processarArquivo(file) {
        if (!file) {
            mostrarStatus('Selecione um arquivo.', true);
            return;
        }

        mostrarStatus('Lendo arquivo...', false);

        try {
            const linhas = await lerArquivoUniversal(file);

            if (!linhas.length) {
                mostrarStatus('Não encontrei linhas no arquivo.', true);
                return;
            }

            const resultado = converterLinhasParaGoogleCSV(linhas);

            if (!resultado.convertidos) {
                mostrarStatus('Nenhum contato válido encontrado. Verifique se existe nome e telefone.', true);
                return;
            }

            baixarArquivo(
                'contatos-google-chatpro.csv',
                resultado.csv,
                'text/csv;charset=utf-8'
            );

            mostrarStatus(
                `Convertido: ${resultado.convertidos} | Duplicados: ${resultado.duplicados} | Inválidos: ${resultado.invalidos}`,
                false
            );
        } catch (erro) {
            console.error(erro);
            mostrarStatus('Erro ao converter. Use XLSX, XLS, CSV ou TXT com nome e telefone.', true);
        }
    }

    function criarBotao(texto, cor, onClick) {
        const btn = document.createElement('button');

        btn.textContent = texto;
        btn.style.cssText = `
            width: 100%;
            padding: 11px 12px;
            border: none;
            border-radius: 10px;
            background: ${cor};
            color: white;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            margin-top: 8px;
            transition: .18s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-1px)';
            btn.style.filter = 'brightness(0.96)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
            btn.style.filter = 'brightness(1)';
        });

        btn.addEventListener('click', onClick);

        return btn;
    }

    function criarPainel() {
        if (document.getElementById(PANEL_ID)) return;
        if (!document.body) return;

        const painel = document.createElement('div');
        painel.id = PANEL_ID;

        painel.style.cssText = `
            position: fixed;
            right: 18px;
            bottom: 18px;
            width: 355px;
            background: #ffffff;
            color: #111827;
            z-index: 2147483647;
            border-radius: 16px;
            box-shadow: 0 18px 45px rgba(0,0,0,.22);
            padding: 16px;
            font-family: Arial, Helvetica, sans-serif;
            border: 1px solid rgba(0,0,0,.08);
        `;

        const topo = document.createElement('div');
        topo.style.cssText = `
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:10px;
            margin-bottom:12px;
        `;

        const titulo = document.createElement('div');
        titulo.textContent = 'Conversor Google Contatos';
        titulo.style.cssText = `
            font-weight: 800;
            font-size: 20px;
            line-height: 1.1;
            color:#111827;
        `;

        const btnFecharTopo = document.createElement('button');
        btnFecharTopo.textContent = '✕';
        btnFecharTopo.title = 'Fechar painel';
        btnFecharTopo.style.cssText = `
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 10px;
            background: #f3f4f6;
            color: #374151;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            flex-shrink:0;
            transition:.18s ease;
        `;
        btnFecharTopo.addEventListener('mouseenter', () => {
            btnFecharTopo.style.background = '#e5e7eb';
        });
        btnFecharTopo.addEventListener('mouseleave', () => {
            btnFecharTopo.style.background = '#f3f4f6';
        });
        btnFecharTopo.addEventListener('click', () => painel.remove());

        topo.appendChild(titulo);
        topo.appendChild(btnFecharTopo);

        const inputWrap = document.createElement('div');
        inputWrap.style.cssText = `
            background:#ffffff;
            border:1px dashed #cbd5e1;
            border-radius:12px;
            padding:12px;
            margin-bottom:10px;
        `;

        const inputLabel = document.createElement('div');
        inputLabel.textContent = 'Selecionar arquivo';
        inputLabel.style.cssText = `
            font-size:12px;
            font-weight:700;
            color:#374151;
            margin-bottom:8px;
        `;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.ods,.csv,.txt';
        input.style.cssText = `
            width:100%;
            font-size:12px;
            color:#374151;
        `;

        inputWrap.appendChild(inputLabel);
        inputWrap.appendChild(input);

        const btnConverter = criarBotao(
            '📥 Converter e baixar CSV Google',
            '#16a34a',
            () => processarArquivo(input.files[0])
        );

        const btnFechar = criarBotao(
            '✖ Fechar painel',
            '#4b5563',
            () => painel.remove()
        );

        const status = document.createElement('div');
        status.id = 'gc-conversor-universal-status';
        status.style.cssText = `
            min-height: 18px;
            display:none;
            margin-top:10px;
            padding:10px 12px;
            border-radius:10px;
            font-size:12px;
            font-weight:700;
            line-height:1.45;
        `;

        painel.appendChild(topo);
        painel.appendChild(inputWrap);
        painel.appendChild(btnConverter);
        painel.appendChild(btnFechar);
        painel.appendChild(status);

        document.body.appendChild(painel);
    }

    function iniciar() {
        criarPainel();

        const timer = setInterval(() => {
            if (!location.pathname.startsWith('/chat')) return;
            criarPainel();
        }, 1500);

        setTimeout(() => {
            clearInterval(timer);
        }, 30000);
    }

    iniciar();

})();
