if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const productsRouter = require('./src/routes/product');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);
app.use('/api/products', productsRouter);
app.use('/api', productsRouter);

app.get('/', (req, res) => {
  res.send('API a funcionar com sucesso!');
});

app.get('/api/hello', (req, res) => {
  res.json({ msg: 'Olá Vercel!' });
});

app.get('/api/enderecos', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT id_endereco, codigo_endereco, corredor, prateleira, nivel, nicho
      FROM dynamis.endereco_fisico
      ORDER BY corredor, prateleira, nivel, nicho
    `);
    res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao buscar endereços:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar endereços.' });
  }
});

app.post('/api/movimentacoes', async (req, res) => {
  const {
    tipo,
    id_estoquista,
    id_produto,
    id_origem,
    id_destino,
    quantidade,
  } = req.body || {};
  const quantidadeNumerica = Number(quantidade);

  if (!tipo || !id_produto || !Number.isInteger(quantidadeNumerica) || quantidadeNumerica <= 0) {
    return res.status(400).json({ erro: 'Tipo, produto e quantidade inteira positiva são obrigatórios.' });
  }

  try {
    const resultado = await pool.query(
      'SELECT dynamis.registrar_movimentacao($1, $2, $3, $4, $5, $6) AS id_movimentacao',
      [
        tipo,
        id_estoquista || 1,
        id_produto,
        id_origem || null,
        id_destino || null,
        quantidadeNumerica,
      ],
    );
    res.status(201).json({
      mensagem: 'Movimentação realizada com sucesso!',
      id_movimentacao: resultado.rows[0].id_movimentacao,
    });
  } catch (err) {
    console.error('Erro na movimentação:', err.message);
    res.status(400).json({ erro: 'Não foi possível registrar a movimentação.' });
  }
});

app.get('/api/historico', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT * FROM dynamis.vw_historico_movimentacao
      LIMIT 50
    `);
    res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar histórico.' });
  }
});

app.get('/api/picking', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM dynamis.vw_rota_picking');
    res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao buscar rota de picking:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar rota de picking.' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;
