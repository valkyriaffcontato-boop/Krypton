const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle, 
  PermissionFlagsBits, 
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const Ticket = require('../models/Ticket');
const Blacklist = require('../models/Blacklist');
const { createTranscript } = require('../utils/transcript');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    const { guild, member, user } = interaction;

    // --- EXECUÇÃO DE COMANDOS SLASH ---
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('[ERRO COMANDO]', error);
        const errMessage = 'Ocorreu um erro interno ao processar este comando. Verifique se o banco de dados está online.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errMessage }).catch(() => null);
        } else {
          await interaction.reply({ content: errMessage, ephemeral: true }).catch(() => null);
        }
      }
      return;
    }

    // --- SELETOR DE CATEGORIA (ABERTURA DO TICKET) ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
      try {
        await interaction.deferReply({ ephemeral: true });

        // Verificação de Blacklist
        const checkBlacklist = await Blacklist.findOne({ userId: user.id });
        if (checkBlacklist) {
          return interaction.editReply({ content: `Você está na lista negra e não pode abrir tickets de suporte.` });
        }

        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config) return interaction.editReply({ content: 'As configurações deste servidor não foram salvas.' });

        // VERIFICAÇÃO: Verifica se o sistema de tickets está ativado globalmente
        if (config.active === false) {
          return interaction.editReply({ content: 'O sistema de tickets está temporariamente desativado pela administração.' });
        }

        // Verificação de limite máximo de tickets ativos
        const activeTickets = await Ticket.countDocuments({ guildId: guild.id, userId: user.id, status: 'open' });
        if (activeTickets >= (config.maxTickets || 3)) {
          return interaction.editReply({ content: `Você já possui ${activeTickets} tickets abertos. Encerre um antes de abrir outro.` });
        }

        const categoryValue = interaction.values[0];
        const categoryObj = config.categories.find(c => c.value === categoryValue);
        const ticketName = `ticket-${user.username}-${categoryValue}`.slice(0, 100);

        // Permissões estruturadas do canal
        const overwrites = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] }
        ];

        // CORREÇÃO: Concede permissão de leitura a múltiplos cargos de Staff adicionados
        if (config.staffRoleIds && config.staffRoleIds.length > 0) {
          config.staffRoleIds.forEach(roleId => {
            overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
          });
        }

        const ticketChannel = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: config.ticketCategory || null,
          permissionOverwrites: overwrites
        });

        // Salva registro no Banco
        await Ticket.create({
          guildId: guild.id,
          channelId: ticketChannel.id,
          userId: user.id,
          category: categoryValue,
          status: 'open'
        });

        const ticketEmbed = new EmbedBuilder()
          .setTitle(`Ticket: ${categoryObj ? categoryObj.label : 'Suporte'}`)
          .setDescription(`Olá, ${user}. Seu ticket foi criado. Descreva seu problema ou solicitação enquanto a staff não chega.`)
          .setColor(config.panelEmbed.color || '#5865F2')
          .setTimestamp();

        const btnClaim = new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reivindicar').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️');
        const btnClose = new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
        const btnAdd = new ButtonBuilder().setCustomId('ticket_add_member').setLabel('+ Membro').setStyle(ButtonStyle.Primary);
        const btnRem = new ButtonBuilder().setCustomId('ticket_rem_member').setLabel('- Membro').setStyle(ButtonStyle.Secondary);
        const btnTranscript = new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Histórico').setStyle(ButtonStyle.Secondary).setEmoji('📜');

        const actionRow = new ActionRowBuilder().addComponents(btnClaim, btnClose, btnAdd, btnRem, btnTranscript);

        await ticketChannel.send({ embeds: [ticketEmbed], components: [actionRow] });

        // Logs
        if (config.logChannelId) {
          const logChannel = guild.channels.cache.get(config.logChannelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🎫 Ticket Aberto')
              .addFields(
                { name: 'Usuário', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Categoria', value: `${categoryValue}`, inline: true },
                { name: 'Canal', value: `<#${ticketChannel.id}>`, inline: true }
              )
              .setColor('#2ECC71')
              .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
          }
        }

        return interaction.editReply({ content: `Seu canal de atendimento foi criado com sucesso: <#${ticketChannel.id}>` });
      } catch (err) {
        console.error('[ERRO CRIAR TICKET]', err);
        return interaction.editReply({ content: 'Falha crítica ao abrir ticket de suporte. Verifique com a administração.' }).catch(() => null);
      }
    }

    // --- INTERAÇÃO DO BOTÃO "CONFIGURAR PAINEL" (STAFF NO DISCORD) ---
    if (interaction.isButton() && interaction.customId === 'discord_config_panel') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Apenas administradores do servidor podem usar esta configuração.', ephemeral: true });
      }

      const config = await GuildConfig.findOne({ guildId: guild.id });
      if (!config) return interaction.reply({ content: 'Configurações de servidor não encontradas.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId('modal_discord_config')
        .setTitle('⚙️ Configuração Rápida do Painel');

      const titleInput = new TextInputBuilder()
        .setCustomId('modal_panel_title')
        .setLabel('Título da Janela')
        .setValue(config.panelEmbed.title)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('modal_panel_desc')
        .setLabel('Mensagem / Descrição')
        .setValue(config.panelEmbed.description)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const thumbInput = new TextInputBuilder()
        .setCustomId('modal_panel_thumb')
        .setLabel('URL da Imagem de Miniatura (Opcional)')
        .setValue(config.panelEmbed.thumbnail || '')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const imgInput = new TextInputBuilder()
        .setCustomId('modal_panel_img')
        .setLabel('URL da Imagem de Banner (Opcional)')
        .setValue(config.panelEmbed.image || '')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(thumbInput),
        new ActionRowBuilder().addComponents(imgInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // --- ENVIO DO FORMULÁRIO DO MODAL DE CONFIGURAÇÃO (DISCORD) ---
    if (interaction.isModalSubmit() && interaction.customId === 'modal_discord_config') {
      await interaction.deferReply({ ephemeral: true });
      const title = interaction.fields.getTextInputValue('modal_panel_title');
      const description = interaction.fields.getTextInputValue('modal_panel_desc');
      const thumbnail = interaction.fields.getTextInputValue('modal_panel_thumb');
      const image = interaction.fields.getTextInputValue('modal_panel_img');

      try {
        await GuildConfig.findOneAndUpdate(
          { guildId: guild.id },
          {
            'panelEmbed.title': title,
            'panelEmbed.description': description,
            'panelEmbed.thumbnail': thumbnail,
            'panelEmbed.image': image
          }
        );
        return interaction.editReply({ content: 'Painel reconfigurado com sucesso! Envie novamente o painel com o comando `/painel` para carregar as alterações no canal público.' });
      } catch (err) {
        console.error(err);
        return interaction.editReply({ content: 'Erro ao gravar as novas configurações rápidas no banco de dados.' });
      }
    }

    // --- INTERAÇÕES DOS BOTÕES DENTRO DO TICKET ---
    if (interaction.isButton()) {
      try {
        const buttonId = interaction.customId;
        const channel = interaction.channel;

        const ticketData = await Ticket.findOne({ channelId: channel.id });
        const config = await GuildConfig.findOne({ guildId: guild.id });

        if (!ticketData || !config) return;

        // Validação se o usuário possui algum dos cargos de staff configurados
        const isStaff = config.staffRoleIds && config.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
        const isTicketOwner = ticketData.userId === user.id;

        if (!isStaff && !isTicketOwner) {
          return interaction.reply({ content: 'Você não possui permissão para utilizar estes controles.', ephemeral: true });
        }

        if (buttonId === 'ticket_claim') {
          if (!isStaff) return interaction.reply({ content: 'Apenas atendentes da staff podem reivindicar tickets.', ephemeral: true });
          if (ticketData.claimedBy) return interaction.reply({ content: `Este ticket já foi reivindicado por <@${ticketData.claimedBy}>`, ephemeral: true });

          ticketData.claimedBy = user.id;
          ticketData.status = 'claimed';
          await ticketData.save();

          // Bloqueia permissão de envio do cargo genérico e permite para quem reivindicou individualmente
          if (config.staffRoleIds) {
            config.staffRoleIds.forEach(async (roleId) => {
              await channel.permissionOverwrites.edit(roleId, { SendMessages: false }).catch(() => null);
            });
          }
          await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });

          await channel.send({ content: `Este ticket foi oficialmente reivindicado por ${user}.` });
          return interaction.deferUpdate();
        }

        if (buttonId === 'ticket_close') {
          ticketData.status = 'closed';
          ticketData.closedAt = new Date();
          await ticketData.save();

          await interaction.reply({ content: 'Encerramento de ticket iniciado. Gerando histórico de chat...' });

          const transcriptAttachment = await createTranscript(channel, guild);

          if (config.transcriptChannelId) {
            const transChannel = guild.channels.cache.get(config.transcriptChannelId);
            if (transChannel) {
              await transChannel.send({
                content: `Histórico finalizado do Ticket de <@${ticketData.userId}> (ID do Canal: ${channel.id})`,
                files: [transcriptAttachment]
              }).catch(() => null);
            }
          }

          try {
            const owner = await client.users.fetch(ticketData.userId);
            const feedbackEmbed = new EmbedBuilder()
              .setTitle('⭐ Avalie seu Atendimento!')
              .setDescription(`Seu ticket no servidor **${guild.name}** foi encerrado. Por favor, atribua uma nota de 1 a 5 no feedback.`)
              .setColor('#F1C40F');

            const selectFeedback = new StringSelectMenuBuilder()
              .setCustomId(`ticket_feedback_${ticketData.id}`)
              .setPlaceholder('Escolha uma nota de 1 a 5 estrelas...')
              .addOptions([
                { label: '⭐ (Ruim)', value: '1' },
                { label: '⭐⭐ (Regular)', value: '2' },
                { label: '⭐⭐⭐ (Bom)', value: '3' },
                { label: '⭐⭐⭐⭐ (Muito Bom)', value: '4' },
                { label: '⭐⭐⭐⭐⭐ (Excelente)', value: '5' }
              ]);

            const fbRow = new ActionRowBuilder().addComponents(selectFeedback);
            await owner.send({ embeds: [feedbackEmbed], components: [fbRow] }).catch(() => null);
          } catch {}

          await channel.send({ content: 'Este canal será destruído em 10 segundos.' });
          setTimeout(async () => {
            await channel.delete().catch(() => null);
          }, 10000);
        }

        if (buttonId === 'ticket_transcript') {
          const trAttachment = await createTranscript(channel, guild);
          return interaction.reply({ files: [trAttachment], ephemeral: true });
        }

        if (buttonId === 'ticket_add_member' || buttonId === 'ticket_rem_member') {
          const isAdd = buttonId === 'ticket_add_member';
          const modal = new ModalBuilder()
            .setCustomId(isAdd ? 'modal_add_user' : 'modal_rem_user')
            .setTitle(isAdd ? 'Adicionar Usuário ao Ticket' : 'Remover Usuário do Ticket');

          const inputUser = new TextInputBuilder()
            .setCustomId('target_user_id')
            .setLabel('ID do Usuário')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Exemplo: 382894572910472019')
            .setRequired(true);

          const row = new ActionRowBuilder().addComponents(inputUser);
          modal.addComponents(row);

          await interaction.showModal(modal);
        }
      } catch (err) {
        console.error('[ERRO BOTOES TICKET]', err);
      }
    }

    // --- ENVIO DOS MODAIS DE CONTROLE DE MEMBROS ---
    if (interaction.isModalSubmit()) {
      try {
        const targetUserId = interaction.fields.getTextInputValue('target_user_id');
        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

        if (!targetMember) {
          return interaction.reply({ content: 'Não foi possível encontrar nenhum membro no servidor com o ID fornecido.', ephemeral: true });
        }

        if (interaction.customId === 'modal_add_user') {
          await interaction.channel.permissionOverwrites.edit(targetUserId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          return interaction.reply({ content: `<@${targetUserId}> foi adicionado com sucesso ao ticket!` });
        }

        if (interaction.customId === 'modal_rem_user') {
          await interaction.channel.permissionOverwrites.delete(targetUserId);
          return interaction.reply({ content: `<@${targetUserId}> foi removido com sucesso do ticket.` });
        }
      } catch (err) {
        console.error('[ERRO PROCESSAR MODAL]', err);
      }
    }

    // --- SISTEMA DE AVALIAÇÃO (DMS DO USUÁRIO) ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_feedback_')) {
      try {
        const ticketDbId = interaction.customId.replace('ticket_feedback_', '');
        const rating = parseInt(interaction.values[0]);

        await Ticket.findByIdAndUpdate(ticketDbId, { rating });
        return interaction.reply({ content: `Obrigado! Sua avaliação de ${'⭐'.repeat(rating)} foi salva no banco de dados.`, ephemeral: true });
      } catch (err) {
        console.error('[ERRO AVALIACAO]', err);
      }
    }
  }
};
