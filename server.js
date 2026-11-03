require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', async (req, res) => {
  const { login, senha } = req.body || {};
  const identificador = typeof login === 'string' ? login.trim() : '';

  if (!identificador || typeof senha !== 'string' || !senha) {
    return res.status(400).json({ erro: 'Informe o e-mail/matrícula e a senha!' });
  }

  try {
    const resultado = await pool.query(`
      SELECT id_estoquista, nome, email, matricula
      FROM dynamis.estoquista
      WHERE (LOWER(email) = LOWER($1) OR matricula = $1)
        AND senha = $2
    `, [identificador, senha]);

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    res.json({
      sucesso: true,
      usuario: resultado.rows[0],
    });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ erro: 'Não foi possível realizar o login.' });
  }
});

async function listarProdutos(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        p.id_produto,
        p.sku,
        p.codigo_barras,
        p.descricao,
        p.categoria,
        p.marca_modelo,
        COALESCE(s.saldo_total, 0) AS saldo_total
      FROM dynamis.produto p
      LEFT JOIN dynamis.vw_saldo_produto s ON s.id_produto = p.id_produto
      ORDER BY p.descricao ASC
    `);
    res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar produtos.' });
  }
}

app.get('/api/produtos', listarProdutos);
app.get('/api/dados', listarProdutos);

app.post('/api/produtos', async (req, res) => {
  const { sku, codigo_barras, descricao, categoria, marca_modelo } = req.body || {};
  if (!sku || !codigo_barras || !descricao || !categoria) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando!' });
  }

  try {
    const resultado = await pool.query(`
      INSERT INTO dynamis.produto
        (sku, codigo_barras, descricao, categoria, marca_modelo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [sku, codigo_barras, descricao, categoria, marca_modelo || null]);
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao criar produto:', err.message);
    res.status(500).json({ erro: 'Erro ao criar produto.' });
  }
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

app.listen(PORT, () => {
  console.log(`Servidor WMS rodando em http://localhost:${PORT}`);
});
