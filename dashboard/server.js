const express = require('express');
const session = require('express-session');
const path = require('path');
const DiscordOAuth2 = require('discord-oauth2');
const GuildConfig = require('../models/GuildConfig');

module.exports = (client) => {
  const app = express();
  const oauth = new DiscordOAuth2({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: `${process.env.DASHBOARD_URL}/auth/callback`
  });

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));

  // Middleware para verificar autenticação
  function checkAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/');
  }

  // Página Inicial
  app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
  });

  // Login via OAuth2 Discord
  app.get('/auth/login', (req, res) => {
    const url = oauth.tokenRequestUrl({
      scope: ['identify', 'guilds'],
      state: 'krypton_secret_state'
    });
    res.redirect(url);
  });

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
      req.session.guilds = guilds.filter(g => (g.permissions & 0x8) === 0x8); // Apenas servidores com permissão de Administrador
      res.redirect('/dashboard');
    } catch (err) {
      console.error(err);
      res.redirect('/');
    }
  });

  app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

  // Lista de servidores administrados
  app.get('/dashboard', checkAuth, (req, res) => {
    res.render('dashboard', { user: req.session.user, guilds: req.session.guilds });
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
    const channels = discordGuild ? discordGuild.channels.cache.filter(c => c.type === 0 || c.type === 4).map(c => ({ id: c.id, name: c.name, type: c.type })) : [];
    const roles = discordGuild ? discordGuild.roles.cache.map(r => ({ id: r.id, name: r.name })) : [];

    res.render('guild', { 
      user: req.session.user, 
      guild: userGuild, 
      config,
      channels,
      roles
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
