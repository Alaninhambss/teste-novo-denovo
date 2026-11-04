const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
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

router.post('/register', async (req, res) => {
  const { nome, email, matricula, password} = req.body || {};
  const nomeNormalizado = typeof nome === 'string' ? nome.trim() : '';
  const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const matriculaNormalizada = typeof matricula === 'string' ? matricula.trim() : '';

  if (!nomeNormalizado || !emailNormalizado || !matriculaNormalizada ||
      typeof password !== 'string' || password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({
      erro: 'Informe nome, e-mail, matrícula e senha (mínimo 8 caracteres; máximo 72 bytes).',
    });
  }

  const configuredRegistrationSecret = process.env.REGISTRATION_SECRET;
  if (!configuredRegistrationSecret || configuredRegistrationSecret.length < 32) {
    return res.status(503).json({ erro: 'Cadastro indisponível: chave de convite não configurada.' });
  }

  if (typeof registrationSecret !== 'string') {
    return res.status(403).json({ erro: 'Chave de convite inválida.' });
  }

  const expectedDigest = crypto.createHash('sha256').update(configuredRegistrationSecret).digest();
  const suppliedDigest = crypto.createHash('sha256').update(registrationSecret).digest();
  if (!crypto.timingSafeEqual(expectedDigest, suppliedDigest)) {
    return res.status(403).json({ erro: 'Chave de convite inválida.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('Configuração JWT inválida para cadastro.');
    return res.status(503).json({ erro: 'Cadastro indisponível.' });
  }

  try {
    const senhaHash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(`
      INSERT INTO dynamis.estoquista (nome, email, matricula, senha)
      VALUES ($1, $2, $3, $4)
      RETURNING id_estoquista, nome, email, matricula
    `, [nomeNormalizado, emailNormalizado, matriculaNormalizada, senhaHash]);
    const estoquista = rows[0];
    const token = jwt.sign(
      { sub: String(estoquista.id_estoquista), email: estoquista.email },
      jwtSecret,
      { expiresIn: '1h' },
    );

    return res.status(201).json({ sucesso: true, token, usuario: estoquista });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'E-mail ou matrícula já cadastrado.' });
    }
    console.error('Erro ao registrar estoquista:', err.message);
    return res.status(500).json({ erro: 'Não foi possível registrar o estoquista.' });
  }
});

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

router.put('/usuarios/:id', requireLogin, async (req, res) => {
  if (req.params.id !== req.estoquistaId) {
    return res.status(403).json({ erro: 'Você só pode atualizar seus próprios dados.' });
  }

  const { email, novaSenha } = req.body || {};
  const atualizaEmail = Object.prototype.hasOwnProperty.call(req.body || {}, 'email');
  const atualizaSenha = typeof novaSenha === 'string' && novaSenha.length > 0;
  const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!atualizaEmail && !atualizaSenha) {
    return res.status(400).json({ erro: 'Informe um novo e-mail e/ou uma nova senha.' });
  }
  if (atualizaEmail &&
      (!emailNormalizado || emailNormalizado.length > 254 ||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado))) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (atualizaSenha &&
      (novaSenha.length < 8 || Buffer.byteLength(novaSenha, 'utf8') > 72)) {
    return res.status(400).json({
      erro: 'A nova senha deve ter ao menos 8 caracteres e no máximo 72 bytes.',
    });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('Configuração JWT inválida para atualização de conta.');
    return res.status(503).json({ erro: 'Atualização de conta indisponível.' });
  }

  try {
    const campos = [];
    const valores = [];

    if (atualizaEmail) {
      valores.push(emailNormalizado);
      campos.push(`email = $${valores.length}`);
    }
    if (atualizaSenha) {
      valores.push(await bcrypt.hash(novaSenha, 12));
      campos.push(`senha = $${valores.length}`);
    }

    valores.push(req.estoquistaId);
    const { rows } = await db.query(`
      UPDATE dynamis.estoquista
      SET ${campos.join(', ')}
      WHERE id_estoquista = $${valores.length}
      RETURNING id_estoquista, nome, email, matricula
    `, valores);

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Estoquista não encontrado.' });
    }

    const estoquista = rows[0];
    const token = jwt.sign(
      { sub: String(estoquista.id_estoquista), email: estoquista.email },
      jwtSecret,
      { expiresIn: '1h' },
    );
    return res.json({ mensagem: 'Dados atualizados com sucesso.', token, usuario: estoquista });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'E-mail já cadastrado.' });
    }
    console.error('Erro ao atualizar dados do estoquista:', err.message);
    return res.status(500).json({ erro: 'Erro ao atualizar dados.' });
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
