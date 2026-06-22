const mongoose = require('mongoose');

const GuildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  staffRoleIds: { type: [String], default: [] }, // Suporta múltiplos cargos simultaneamente
  logChannelId: { type: String, default: null },
  transcriptChannelId: { type: String, default: null },
  ticketCategory: { type: String, default: null },
  maxTickets: { type: Number, default: 3 },
  active: { type: Boolean, default: true }, // Permite desativar temporariamente o sistema
  panelEmbed: {
    title: { type: String, default: '📩 Central de Suporte' },
    description: { type: String, default: 'Clique no menu de seleção abaixo para abrir um ticket de suporte.' },
    color: { type: String, default: '#5865F2' },
    thumbnail: { type: String, default: '' }, // URL da imagem pequena
    image: { type: String, default: '' } // URL do banner principal
  },
  categories: {
    type: Array,
    default: [
      { value: 'suporte', label: 'Suporte Geral', description: 'Dúvidas e assistência básica', emoji: '💬' },
      { value: 'financeiro', label: 'Financeiro', description: 'Questões relacionadas a pagamentos', emoji: '💳' },
      { value: 'denuncia', label: 'Denúncias', description: 'Reportar infrações ou abusos', emoji: '⚠️' }
    ]
  }
});

module.exports = mongoose.model('GuildConfig', GuildConfigSchema);
