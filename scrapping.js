import 'dotenv/config';
import fs from 'fs';
import puppeteer from 'puppeteer';

export async function runScrapping() {
  const {
    LOGIN_URL,
    USERNAME,
    PASSWORD,
    USER_SELECTOR,
    PASS_SELECTOR,
    SUBMIT_SELECTOR,
    TAB_SELECTOR
  } = process.env;

  const CARD_REQUIRED_CLASSES = [
    'MuiPaper-root',
    'MuiPaper-background',
    'MuiPaper-rounded',
    'flex',
    'flex-col',
    'justify-between',
    'items-start',
    'gap-10'
  ];

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1366, height: 800 },
  });

  const page = await browser.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });

    // Login
    await page.waitForSelector(USER_SELECTOR);
    await page.type(USER_SELECTOR, USERNAME, { delay: 30 });
    await page.waitForSelector(PASS_SELECTOR);
    await page.type(PASS_SELECTOR, PASSWORD, { delay: 30 });

    await Promise.all([
      page.click(SUBMIT_SELECTOR),
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null),
    ]);

    // Aba conexões
    await page.waitForSelector(TAB_SELECTOR, { timeout: 15000 });
    await Promise.all([
      page.click(TAB_SELECTOR),
      page.waitForFunction(() => location.pathname.includes('/meta/connections'), { timeout: 15000 }).catch(() => null),
    ]);

    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => null);

    // Botão Atualizar
    await page.waitForSelector('button');
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
      await Promise.all([
        btnAtualizar.click(),
        page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => null),
      ]);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Coleta dos cards com botão "Desconectar"
    const cards = await page.$$eval('div.MuiPaper-root', (nodes, required) => {
      const hasAll = (el, classes) => classes.every(c => el.classList.contains(c));
      const getText = el => (el?.innerText || el?.textContent || '').trim().toLowerCase();

      return nodes
        .filter(el => hasAll(el, required))
        .filter(el => {
          const footer = el.querySelector('footer');
          if (!footer) return false;
          const btns = Array.from(footer.querySelectorAll('button'));
          return btns.some(b => getText(b).includes('desconectar'));
        })
        .map((el, idx) => {
          // nome e WhatsApp
          let nomeConexao = null;
          let whatsapp = null;

          const pWaba = Array.from(el.querySelectorAll('p')).find(p => {
            const span = p.querySelector('span');
            return span && span.textContent.trim().toLowerCase().includes('waba');
          });

          if (pWaba) {
            const spanText = pWaba.querySelector('span')?.textContent || '';
            nomeConexao = pWaba.textContent
              .replace(spanText, '')
              .trim()
              .replace(/^[:\s]+/, '');
            const nextP = pWaba.nextElementSibling;
            if (nextP && nextP.tagName === 'P') {
              whatsapp = nextP.textContent.trim() || null;
            }
          }

          const infoElements = Array.from(el.querySelectorAll('p')).filter(p => p.querySelector('span.font-bold'));
          const valores = infoElements.map(p => {
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

    fs.writeFileSync('conexoes.json', JSON.stringify(cards, null, 2));
    await browser.close();

    return cards;
  } catch (err) {
    await browser.close();
    throw err;
  }
}
