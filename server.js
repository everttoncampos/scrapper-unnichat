import express from 'express';
import { runScrapping } from './scrapping.js';

const app = express();
const PORT = 3210;

app.get('/', (req, res) => {
  res.send('🚀 API do Scrapping Unnichat está online!');
});

app.get('/scrap', async (req, res) => {
  try {
    console.log('Executando scraping...');
    const data = await runScrapping();
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error('Erro ao executar scraping:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));
