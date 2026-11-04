const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireLogin = require('../middleware/require-login');

const router = express.Router();
const BCRYPT_HASH = /^\$2[aby]\$\d\d\$/;

async function verificarSenha(senha, hashOuSenha) {
  if (typeof hashOuSenha !== 'string') return false;
  if (BCRYPT_HASH.test(hashOuSenha)) {
    return bcrypt.compare(senha, hashOuSenha);
  }
  return senha === hashOuSenha;
}

router.post('/login', async (req, res) => {
  const { login, email, senha, password } = req.body || {};
  const valorLogin = typeof login === 'string' ? login : email;
  const valorSenha = typeof senha === 'string' ? senha : password;
  const identificador = typeof valorLogin === 'string' ? valorLogin.trim() : '';

  if (!identificador || typeof valorSenha !== 'string' || !valorSenha) {
    return res.status(400).json({ erro: 'Informe o e-mail/matrícula e a senha!' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be configured with at least 32 characters.');
    }
    const { rows } = await db.query(`
      SELECT id_estoquista, nome, email, matricula, senha
      FROM dynamis.estoquista
      WHERE (LOWER(email) = LOWER($1) OR matricula = $1)
      LIMIT 1
    `, [identificador]);
    const estoquista = rows[0];

    if (!estoquista || !(await verificarSenha(valorSenha, estoquista.senha))) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    if (!BCRYPT_HASH.test(estoquista.senha)) {
      const hash = await bcrypt.hash(valorSenha, 12);
      await db.query(
        'UPDATE dynamis.estoquista SET senha = $1 WHERE id_estoquista = $2',
        [hash, estoquista.id_estoquista],
      );
    }

    const token = jwt.sign(
      {
        sub: String(estoquista.id_estoquista),
        email: estoquista.email,
      },
      secret,
      { expiresIn: '1h' },
    );

    res.json({
      sucesso: true,
      token,
      usuario: {
        id_estoquista: estoquista.id_estoquista,
        nome: estoquista.nome,
        email: estoquista.email,
        matricula: estoquista.matricula,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ erro: 'Não foi possível realizar o login.' });
  }
});

router.post('/change-password', requireLogin, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== 'string' || !oldPassword ||
      typeof newPassword !== 'string' || !newPassword) {
    return res.status(400).json({ erro: 'oldPassword e newPassword são obrigatórios.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT senha FROM dynamis.estoquista WHERE id_estoquista = $1',
      [req.estoquistaId],
    );
    if (rows.length === 0) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    if (!(await verificarSenha(oldPassword, rows[0].senha))) {
      return res.status(403).json({ erro: 'Senha atual incorreta.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query(
      'UPDATE dynamis.estoquista SET senha = $1 WHERE id_estoquista = $2',
      [hash, req.estoquistaId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao trocar senha:', err.message);
    res.status(500).json({ erro: 'Erro interno ao trocar senha.' });
  }
});

module.exports = router;
