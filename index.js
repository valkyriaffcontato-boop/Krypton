require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const mongoose = require('mongoose');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// Inicialização do Banco de Dados MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('[BANCO DE DADOS] Conectado ao MongoDB com sucesso.'))
  .catch((err) => console.error('[ERRO] Conexão ao MongoDB falhou:', err));

// Inicializando Gerenciadores (Handlers)
require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

// Inicialização do Dashboard Web
require('./dashboard/server')(client);

client.login(process.env.DISCORD_TOKEN);
