// scrapping-unni.js
// Requisitos: Node 18+
// Instale antes: npm i puppeteer dotenv fs

import 'dotenv/config';
import fs from 'fs';
import puppeteer from 'puppeteer';

async function run() {
  const {
    LOGIN_URL = 'https://unnichat.com.br/login',
    USERNAME = '',
    PASSWORD = '',
    USER_SELECTOR = 'input[type="email"]',
    PASS_SELECTOR = 'input[type="password"]',
    SUBMIT_SELECTOR = 'button[type="submit"]',
    TAB_SELECTOR = 'a[href="/meta/connections"]',
  } = process.env;

  const CARD_REQUIRED_CLASSES = [
    'MuiPaper-root',
    'MuiPaper-background',
    'MuiPaper-rounded',
    'flex',
    'flex-col',
    'justify-between',
    'items-start',
    'gap-10',
  ];

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1366, height: 800 },
  });

  const page = await browser.newPage();

  try {
    console.log('Acessando página de login...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });

    // Preenche o login
    await page.waitForSelector(USER_SELECTOR, { timeout: 15000 });
    await page.type(USER_SELECTOR, USERNAME, { delay: 20 });

    await page.waitForSelector(PASS_SELECTOR, { timeout: 15000 });
    await page.type(PASS_SELECTOR, PASSWORD, { delay: 20 });

    // Clica e aguarda navegação
    await Promise.all([
      page.click(SUBMIT_SELECTOR),
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null),
    ]);
    console.log('Login realizado.');

    // Acessa a aba conexões
    await page.waitForSelector(TAB_SELECTOR, { timeout: 15000 });
    await Promise.all([
      page.click(TAB_SELECTOR),
      page.waitForFunction(() => location.pathname.includes('/meta/connections'), { timeout: 15000 }).catch(() => null),
    ]);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 5000 }).catch(() => null);

    // --- Clicar no botão "Atualizar" ---
    await page.waitForSelector('button', { timeout: 15000 });
    const buttons = await page.$$('button');
    let btnAtualizar = null;

    for (const btn of buttons) {
      const text = await page.evaluate(el => el.innerText.trim(), btn);
      if (text.toLowerCase().includes('atualizar')) {
        btnAtualizar = btn;
        break;
      }
    }

    if (btnAtualizar) {
      console.log('Clicando no botão "Atualizar"...');
      await Promise.all([
        btnAtualizar.click(),
        page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 }).catch(() => null),
      ]);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Página atualizada com sucesso.');
    } else {
      console.log('Botão "Atualizar" não encontrado.');
    }

    // --- Coletar apenas cards com botão "Desconectar" no <footer> ---
    const cards = await page.$$eval('div.MuiPaper-root', (nodes, required) => {
    const hasAll = (el, classes) => classes.every(c => el.classList.contains(c));

    const getText = (el) => (el?.innerText || el?.textContent || '').trim().toLowerCase();

    return nodes
        .filter(el => hasAll(el, required))
        .filter(el => {
        // procura botões dentro do footer do card
        const footer = el.querySelector('footer');
        if (!footer) return false;
        const btns = Array.from(footer.querySelectorAll('button'));
        return btns.some(b => getText(b).includes('desconectar'));
        })
        .map((el, idx) => {
        // === Nome da conexão e WhatsApp ===
        let nomeConexao = null;
        let whatsapp = null;

        // procura o <p> que contém um <span> com texto "WABA:"
        const pWaba = Array.from(el.querySelectorAll('p')).find(p => {
        const span = p.querySelector('span');
        return span && span.textContent.trim().toLowerCase().includes('waba');
        });

        if (pWaba) {
        // texto após o span é o nome da conexão
        const spanText = pWaba.querySelector('span')?.textContent || '';
        nomeConexao = pWaba.textContent
            .replace(spanText, '')
            .trim()
            .replace(/^[:\s]+/, '');

        // próximo <p> irmão (sibling) contém o número do WhatsApp
        const nextP = pWaba.nextElementSibling;
        if (nextP && nextP.tagName === 'P') {
            whatsapp = nextP.textContent.trim() || null;
        }
        }

        // === Infos detalhadas ===
        let infoElements = [];
        try {
            infoElements = el.querySelectorAll('p:has(span.font-bold)');
        } catch {
            infoElements = Array.from(el.querySelectorAll('p')).filter(p => p.querySelector('span.font-bold'));
        }

        const valores = Array.from(infoElements).map(p => {
            const spanText = p.querySelector('span.font-bold')?.textContent || '';
            const fullText = p.textContent || '';
            return fullText.replace(spanText, '').trim().replace(/^[:\s]+/, '') || null;
        });

        const [
            limite_de_mensagem,
            verificacao_empresarial,
            status_da_conta,
            qualidade,
            criado_em,
            modificado_em
        ] = valores;

        return {
            index: idx,
            nomeConexao,
            whatsapp,
            limite_de_mensagem,
            verificacao_empresarial,
            status_da_conta,
            qualidade,
            criado_em,
            modificado_em
        };
        });
    }, CARD_REQUIRED_CLASSES);

    console.log(`Cards com botão "Desconectar" no footer: ${cards.length}`);
    console.log(JSON.stringify(cards, null, 2));

    // Salva em JSON
    fs.writeFileSync('conexoes.json', JSON.stringify(cards, null, 2));
    console.log('Arquivo conexoes.json salvo com sucesso.');

  } catch (err) {
    console.error('Erro no scraping:', err);
  } finally {
    await browser.close();
  }
}

run();
