// -------------------------------
// Import des modules nécessaires
// -------------------------------
const { Client, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');

// -------------------------------
// Création du client Discord
// -------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// -------------------------------
// Ton token Discord (au bon endroit)
// -------------------------------
const TOKEN = 'MTQ0NjM1MzcxNjIzMDg4MTQyMA.GSVkol.yaxeZCKhipgMZf6Kva8kPd70PeoMsPb-gNg5S8';

// -------------------------------
// IDs des rôles et salons
// -------------------------------
const ROLES = {
    BCSO: '1446311724012670986',
    Rookie: '1446309742258421760',
    Avert1: '1446324443960967180'
};
const CATEGORY_ROOKIE = '1446324811168088218';
const LOG_CHANNEL = '1446325661227810848';

// -------------------------------
// Données des services
// -------------------------------
let serviceData = {};
if (fs.existsSync('./serviceData.json')) {
    serviceData = JSON.parse(fs.readFileSync('./serviceData.json'));
}

function saveData() {
    fs.writeFileSync('./serviceData.json', JSON.stringify(serviceData, null, 4));
}

// -------------------------------
// Commandes Slash
// -------------------------------
client.once('ready', async () => {
    console.log(`${client.user.tag} est en ligne !`);


    const guilds = client.guilds.cache.map(g => g.id);
    for (const guildId of guilds) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set([
            new SlashCommandBuilder().setName('prise').setDescription('Prendre son service'),
            new SlashCommandBuilder().setName('pause').setDescription('Mettre en pause son service'),
            new SlashCommandBuilder().setName('reprise').setDescription('Reprendre son service'),
            new SlashCommandBuilder().setName('fin').setDescription('Terminer son service'),
            new SlashCommandBuilder().setName('infos').setDescription('Voir le temps de service par agent'),
            new SlashCommandBuilder().setName('logs').setDescription('Voir les derniers logs'),
            new SlashCommandBuilder().setName('recruter')
                .setDescription('Recruter un agent')
                .addUserOption(option => option.setName('user').setDescription('Utilisateur à recruter').setRequired(true)),
            new SlashCommandBuilder().setName('licencier')
                .setDescription('Licencier un agent')
                .addUserOption(option => option.setName('user').setDescription('Utilisateur à licencier').setRequired(true)),
            new SlashCommandBuilder().setName('refuser')
                .setDescription('Refuser une candidature')
                .addUserOption(option => option.setName('user').setDescription('Utilisateur à refuser').setRequired(true)),
            new SlashCommandBuilder().setName('avert')
                .setDescription('Donner un avertissement')
                .addUserOption(option => option.setName('user').setDescription('Utilisateur à avertir').setRequired(true))
        ].map(cmd => cmd.toJSON()));
    }
});

// -------------------------------
// Gestion des commandes
// -------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const userId = interaction.user.id;
    if (!serviceData[userId]) serviceData[userId] = { totalSeconds: 0, currentSession: null };

    const now = Date.now();

    // --- /prise ---
    if (interaction.commandName === 'prise') {
        if (serviceData[userId].currentSession)
            return interaction.reply({ content: '❌ Vous êtes déjà en service !', ephemeral: true });

        serviceData[userId].currentSession = { start: now, pauseStart: null, pausedSeconds: 0 };
        saveData();

        const channel = await client.channels.fetch(LOG_CHANNEL);
        channel.send(`👮 **${interaction.user.tag}** a pris son service.`);
        return interaction.reply({ content: '✅ Service pris !', ephemeral: true });
    }

    // --- /pause ---
    if (interaction.commandName === 'pause') {
        const session = serviceData[userId].currentSession;
        if (!session || session.pauseStart !== null)
            return interaction.reply({ content: '❌ Vous n’êtes pas en service ou déjà en pause !', ephemeral: true });

        session.pauseStart = now;
        saveData();

        const channel = await client.channels.fetch(LOG_CHANNEL);
        channel.send(`⏸ **${interaction.user.tag}** est en pause.`);
        return interaction.reply({ content: '✅ Pause enregistrée !', ephemeral: true });
    }

    // --- /reprise ---
    if (interaction.commandName === 'reprise') {
        const session = serviceData[userId].currentSession;
        if (!session || session.pauseStart === null)
            return interaction.reply({ content: '❌ Vous n’êtes pas en pause !', ephemeral: true });

        session.pausedSeconds += now - session.pauseStart;
        session.pauseStart = null;
        saveData();

        const channel = await client.channels.fetch(LOG_CHANNEL);
        channel.send(`▶ **${interaction.user.tag}** reprend son service.`);
        return interaction.reply({ content: '✅ Reprise enregistrée !', ephemeral: true });
    }

    // --- /fin ---
    if (interaction.commandName === 'fin') {
        const session = serviceData[userId].currentSession;
        if (!session) return interaction.reply({ content: '❌ Vous n’êtes pas en service !', ephemeral: true });

        let sessionTime = now - session.start - session.pausedSeconds;
        serviceData[userId].totalSeconds += sessionTime;
        serviceData[userId].currentSession = null;
        saveData();

        const hours = Math.floor(sessionTime / 3600000);
        const minutes = Math.floor((sessionTime % 3600000) / 60000);

        const channel = await client.channels.fetch(LOG_CHANNEL);
        channel.send(`🔚 **${interaction.user.tag}** a terminé son service. Durée : ${hours}h ${minutes}min`);
        return interaction.reply({ content: `✅ Service terminé ! Durée de cette session : ${hours}h ${minutes}min`, ephemeral: true });
    }

    // --- /infos ---
    if (interaction.commandName === 'infos') {
        const stats = Object.entries(serviceData).map(([id, data]) => {
            const member = interaction.guild.members.cache.get(id);
            if (!member) return null;

            let total = data.totalSeconds;
            if (data.currentSession) {
                let current = now - data.currentSession.start - (data.currentSession.pauseStart ? now - data.currentSession.pauseStart : data.currentSession.pausedSeconds);
                total += current;
            }
            const hours = Math.floor(total / 3600000);
            const minutes = Math.floor((total % 3600000) / 60000);

            return `👮 **${member.user.tag}** → ${hours}h ${minutes}min en service`;
        }).filter(Boolean).join('\n');

        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Temps de service des agents').setDescription(stats || 'Aucun agent').setColor('Blue')] });
    }

    // --- /logs ---
    if (interaction.commandName === 'logs') {
        const channel = await client.channels.fetch(LOG_CHANNEL);
        const messages = await channel.messages.fetch({ limit: 20 });
        const logsText = messages.map(m => m.content).reverse().join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Logs récents').setDescription(logsText || 'Aucun log')], ephemeral: true });
    }

    // --- /recruter ---
    if (interaction.commandName === 'recruter') {
        const target = interaction.options.getUser('user');
        const guildMember = await interaction.guild.members.fetch(target.id);
        await guildMember.roles.add([ROLES.BCSO, ROLES.Rookie]);

        const ticket = await interaction.guild.channels.create({
            name: `ticket-${target.username}`,
            type: 0, // text channel
            parent: CATEGORY_ROOKIE,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: guildMember.id, allow: [PermissionsBitField.Flags.ViewChannel] }
            ]
        });

        return interaction.reply({ content: `✅ ${target.tag} a été recruté et un ticket a été créé !`, ephemeral: true });
    }

    // --- /licencier ---
    if (interaction.commandName === 'licencier') {
        const target = interaction.options.getUser('user');
        const guildMember = await interaction.guild.members.fetch(target.id);
        await guildMember.roles.remove([ROLES.BCSO, ROLES.Rookie]);

        const ticket = interaction.guild.channels.cache.find(ch => ch.name === `ticket-${target.username}`);
        if (ticket) await ticket.delete();

        return interaction.reply({ content: `✅ ${target.tag} a été licencié !`, ephemeral: true });
    }

    // --- /refuser ---
    if (interaction.commandName === 'refuser') {
        const target = interaction.options.getUser('user');
        return interaction.reply({ content: `❌ Candidature de ${target.tag} refusée !`, ephemeral: true });
    }

    // --- /avert ---
    if (interaction.commandName === 'avert') {
        const target = interaction.options.getUser('user');
        const guildMember = await interaction.guild.members.fetch(target.id);
        await guildMember.roles.add(ROLES.Avert1);
        return interaction.reply({ content: `⚠️ ${target.tag} a reçu un avertissement !`, ephemeral: true });
    }
});

// -------------------------------
// Connexion du bot
// -------------------------------
client.login(TOKEN);
