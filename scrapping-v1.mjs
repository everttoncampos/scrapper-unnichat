// scrape.js
// Requisitos: Node 18+
// Instale: npm i puppeteer dotenv

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

  // classes estáveis que caracterizam os cards
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
    headless: false, // true se não quiser ver o navegador
    defaultViewport: { width: 1366, height: 800 }
  });
  const page = await browser.newPage();

  try {
    // 1) Login
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector(USER_SELECTOR, { timeout: 15000 });
    await page.type(USER_SELECTOR, USERNAME, { delay: 20 });
    await page.waitForSelector(PASS_SELECTOR, { timeout: 15000 });
    await page.type(PASS_SELECTOR, PASSWORD, { delay: 20 });
    await Promise.all([
      page.click(SUBMIT_SELECTOR),
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null),
    ]);

    // 2) Abrir aba /meta/connections
    await page.waitForSelector(TAB_SELECTOR, { timeout: 15000 });
    await Promise.all([
      page.click(TAB_SELECTOR),
      page.waitForFunction(() => location.pathname.includes('/meta/connections'), { timeout: 15000 }).catch(() => null),
    ]);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => null);

    // --- Clicar no botão "Atualizar" ---
    await page.waitForSelector('button', { timeout: 15000 });

    const buttons = await page.$$('button');
    let btnAtualizar = null;

    // procura botão com o texto "Atualizar"
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
        page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => null),
      ]);

      // substitui waitForTimeout por Promise de atraso
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Página atualizada com sucesso.');
    } else {
      console.log('Botão "Atualizar" não encontrado.');
    }

    // 3) Extrair todos os cards
    const data = await page.$$eval('div.MuiPaper-root', (nodes, required) => {
      const hasAll = (el, classes) => classes.every(c => el.classList.contains(c));

      const limpa = (txt) =>
        (txt ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/^[:\s]+/, '');

      // util: pega valor após o <span> dentro de um <p>
      const valorAposSpan = (p, spanSel = 'span') => {
        if (!p) return null;
        const span = p.querySelector(spanSel);
        const spanText = span?.textContent ?? '';
        const full = p.textContent ?? '';
        const val = full.replace(spanText, '');
        return limpa(val);
      };

      // tenta achar o <p> cujo <span> contém "WABA"
      const achaPWaba = (root) => {
        const ps = root.querySelectorAll('p');
        for (const p of ps) {
          const sp = p.querySelector('span');
          const st = sp?.textContent?.toLowerCase() ?? '';
          if (st.includes('waba')) return p;
        }
        return null;
      };

      return nodes
        .filter(el => hasAll(el, required))
        .map((card, idx) => {
          // --- nomeConexao + whatsapp ---
          const pWaba = achaPWaba(card);
          let nomeConexao = null;
          let whatsapp = null;

          if (pWaba) {
            nomeConexao = valorAposSpan(pWaba); // valor após o <span> (ex.: "Lucio ...")
            const nextP = pWaba.nextElementSibling;
            if (nextP && nextP.tagName === 'P') {
              whatsapp = limpa(nextP.textContent);
            }
          }

          // --- Demais infos: p com <span class="font-bold">, ordem fixa ---
          // Usamos seletor com :has se disponível; fallback manual se não houver suporte.
          let infoPs = [];
          try {
            infoPs = Array.from(card.querySelectorAll('p:has(span.font-bold)'));
          } catch (e) {
            // fallback: todos os <p> que possuem span.font-bold
            infoPs = Array.from(card.querySelectorAll('p')).filter(p => p.querySelector('span.font-bold'));
          }

          const valores = infoPs.map(p => valorAposSpan(p, 'span.font-bold'));

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

    // 4) Saída JSON (stdout) e arquivo
    const json = JSON.stringify(data, null, 2);
    console.log(json);
    fs.writeFileSync('conexoes.json', json);

  } catch (err) {
    console.error('Erro no scraping:', err);
  } finally {
    await browser.close();
  }
}

run();
