const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

function requireLogin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ erro: 'Não autenticado.' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    console.error('Configuração JWT inválida:', err.message);
    return res.status(500).json({ erro: 'Autenticação indisponível.' });
  }

  try {
    const payload = jwt.verify(match[1], secret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      return res.status(401).json({ erro: 'Token inválido.' });
    }
    req.estoquistaId = payload.sub;
    req.estoquistaEmail = typeof payload.email === 'string' ? payload.email : null;
    return next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

module.exports = requireLogin;
