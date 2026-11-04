const express = require('express');
const db = require('../../db');

const router = express.Router();

async function listarProdutos(req, res) {
  try {
    const { rows } = await db.query(`
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
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    res.status(500).json({ erro: 'Erro ao buscar produtos.' });
  }
}

async function criarProduto(req, res) {
  const { sku, codigo_barras, descricao, categoria, marca_modelo } = req.body || {};
  if (!sku || !codigo_barras || !descricao || !categoria) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando!' });
  }

  try {
    const { rows } = await db.query(`
      INSERT INTO dynamis.produto
        (sku, codigo_barras, descricao, categoria, marca_modelo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [sku, codigo_barras, descricao, categoria, marca_modelo || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ erro: 'Erro ao criar produto.' });
  }
}

router.get('/', listarProdutos);
router.get('/produtos', listarProdutos);
router.get('/dados', listarProdutos);
router.post('/', criarProduto);
router.post('/produtos', criarProduto);

module.exports = router;