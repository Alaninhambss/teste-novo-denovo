const express = require('express');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
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

module.exports = router;
