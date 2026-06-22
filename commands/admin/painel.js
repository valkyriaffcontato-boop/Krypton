const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Envia o painel de suporte no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const { guild, channel } = interaction;

    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config || !config.ticketCategory) {
      return interaction.editReply({ content: 'Por favor, configure o bot antes usando `/config` ou no dashboard!' });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.panelEmbed.title)
      .setDescription(config.panelEmbed.description)
      .setColor(config.panelEmbed.color || '#5865F2');

    if (config.panelEmbed.thumbnail) embed.setThumbnail(config.panelEmbed.thumbnail);
    if (config.panelEmbed.image) embed.setImage(config.panelEmbed.image);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Escolha uma categoria para receber atendimento...')
      .addOptions(
        config.categories.slice(0, 25).map(cat => ({
          label: cat.label,
          description: cat.description || '',
          value: cat.value,
          emoji: cat.emoji || undefined
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await channel.send({ embeds: [embed], components: [row] });
    return interaction.editReply({ content: 'Painel de suporte enviado com sucesso no canal!' });
  }
};
