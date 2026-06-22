# Krypton - Sistema Avançado de Tickets de Suporte

Krypton é um bot modular e moderno de tickets para o Discord (construído sob a biblioteca **discord.js v14**), acompanhado de um Dashboard Web de gerenciamento administrativo em tempo real.

## 🚀 Funcionalidades
* **Múltiplos Canais de Suporte**: Cria canais com permissões exclusivas para a equipe e o usuário do ticket.
* **Dashboard Web**: Edição rápida de mensagens do painel com simulação em tempo real, seleção de cargos e logs.
* **Blacklist de Usuários**: Banimento do sistema de criação de tickets com comandos simples.
* **Segurança**: Prevenção contra abusos via limites customizados de tickets ativos por usuário.
* **Auditoria de Histórico**: Armazena e envia arquivos `.html` estáticos formatados do bate-papo no canal de transcripts.

## ⚙️ Instalação Local

1. Instale o [Node.js](https://nodejs.org/) (recomendado v18.0.0+ ou superior) e o [MongoDB](https://www.mongodb.com/).
2. Clone este repositório para o seu ambiente local.
3. Copie o arquivo `.env` preenchendo todos os campos obrigatórios obtidos no [Discord Developer Portal](https://discord.com/developers/applications).
4. No diretório do projeto, rode os seguintes comandos para baixar dependências e executar:
   ```bash
   npm install
   npm start
