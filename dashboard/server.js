const express = require('express');
const session = require('express-session');
const path = require('path');
const DiscordOAuth2 = require('discord-oauth2');
const GuildConfig = require('../models/GuildConfig');

module.exports = (client) => {
  const app = express();

  // CORREÇÃO: Permite que o Express confie no proxy reverso do Railway para manter os cookies de sessão ativos
  app.set('trust proxy', 1);

  const oauth = new DiscordOAuth2({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: `${process.env.DASHBOARD_URL}/auth/callback`
  });

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Configuração aprimorada de Sessão para ambientes de produção (Railway)
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false, // Definido como false para evitar bloqueios de cookies em testes locais e HTTP simples
      maxAge: 24 * 60 * 60 * 1000 // Mantém a sessão ativa por 24 horas
    }
  }));

  // Middleware para verificar autenticação
  function checkAuth(req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    res.redirect('/');
  }

  // Página Inicial - Passa o CLIENT_ID para a geração dinâmica do convite
  app.get('/', (req, res) => {
    res.render('index', { 
      user: req.session.user || null, 
      clientId: process.env.CLIENT_ID 
    });
  });

  // Login via OAuth2 Discord
  app.get('/auth/login', (req, res) => {
    const url = oauth.generateAuthUrl({
      scope: ['identify', 'guilds'],
      state: 'krypton_secret_state'
    });
    res.redirect(url);
  });

  // Callback de autenticação do Discord
  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');

    try {
      const tokenData = await oauth.tokenRequest({
        code,
        scope: ['identify', 'guilds'],
        grantType: 'authorization_code'
      });

      const user = await oauth.getUser(tokenData.access_token);
      const guilds = await oauth.getUserGuilds(tokenData.access_token);

      req.session.user = user;
      
      // Filtra os servidores onde você possui permissão de Administrador ou é o Dono (owner)
      req.session.guilds = guilds.filter(g => g.owner || (BigInt(g.permissions) & 8n) === 8n);
      
      // CORREÇÃO: Força a gravação física da sessão antes de redirecionar para evitar o loop de login
      req.session.save((err) => {
        if (err) console.error('[ERRO SESSÃO] Erro ao gravar dados de login:', err);
        res.redirect('/dashboard');
      });

    } catch (err) {
      console.error('[ERRO OAUTH] Erro na autenticação com o Discord:', err);
      res.redirect('/');
    }
  });

  // Rota de Logout
  app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error('[ERRO LOGOUT] Falha ao destruir sessão:', err);
      res.redirect('/');
    });
  });

  // Painel de Controle - Lista de servidores administrados
  app.get('/dashboard', checkAuth, (req, res) => {
    res.render('dashboard', { 
      user: req.session.user, 
      guilds: req.session.guilds 
    });
  });

  // Configuração específica de servidor
  app.get('/dashboard/:guildId', checkAuth, async (req, res) => {
    const { guildId } = req.params;
    const userGuild = req.session.guilds.find(g => g.id === guildId);
    
    if (!userGuild) return res.redirect('/dashboard');

    let config = await GuildConfig.findOne({ guildId });
    if (!config) {
      config = await GuildConfig.create({ guildId });
    }

    const discordGuild = client.guilds.cache.get(guildId);
    const channels = discordGuild 
      ? discordGuild.channels.cache.filter(c => c.type === 0 || c.type === 4).map(c => ({ id: c.id, name: c.name, type: c.type })) 
      : [];
    const roles = discordGuild 
      ? discordGuild.roles.cache.map(r => ({ id: r.id, name: r.name })) 
      : [];

    res.render('guild', { 
      user: req.session.user, 
      guild: userGuild, 
      config,
      channels,
      roles,
      query: req.query
    });
  });

  // Salvar alterações enviadas do painel administrativo
  app.post('/dashboard/:guildId/save', checkAuth, async (req, res) => {
    const { guildId } = req.params;
    const userGuild = req.session.guilds.find(g => g.id === guildId);
    if (!userGuild) return res.sendStatus(403);

    const { staffRoleId, logChannelId, transcriptChannelId, ticketCategory, title, description, color } = req.body;

    await GuildConfig.findOneAndUpdate(
      { guildId },
      {
        staffRoleId,
        logChannelId,
        transcriptChannelId,
        ticketCategory,
        'panelEmbed.title': title,
        'panelEmbed.description': description,
        'panelEmbed.color': color
      },
      { upsert: true }
    );

    res.redirect(`/dashboard/${guildId}?success=true`);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`[WEBSITE] Rodando em http://localhost:${PORT}`));
};
