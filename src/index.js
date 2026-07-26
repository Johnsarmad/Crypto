require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const cron = require('node-cron');

const { getUSDTSymbols, getKlines, runWithConcurrency } = require('./binance');
const { analyzeSymbol } = require('./signals');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TOP_SIGNALS_COUNT = parseInt(process.env.TOP_SIGNALS_COUNT || '3', 10);
const MIN_SCORE = parseInt(process.env.MIN_SCORE || '50', 10);
const TIMEFRAME = process.env.TIMEFRAME || '1h';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 * * * *';

if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error('DISCORD_TOKEN aur CHANNEL_ID zaroori hain. .env file check karein.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function scanMarket() {
  console.log(`[${new Date().toISOString()}] Market scan shuru...`);

  const symbols = await getUSDTSymbols();
  console.log(`Total symbols scan honge: ${symbols.length}`);

  const results = await runWithConcurrency(
    symbols,
    async (symbol) => {
      const candles = await getKlines(symbol, TIMEFRAME, 100);
      return analyzeSymbol(symbol, candles);
    },
    5,
    120
  );

  const validSignals = results
    .filter((r) => r !== null && r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_SIGNALS_COUNT);

  console.log(`Strong signals mile: ${validSignals.length}`);
  return validSignals;
}

function buildEmbed(signal) {
  const isBuy = signal.direction === 'BUY';
  return new EmbedBuilder()
    .setTitle(`${isBuy ? '🟢 BUY' : '🔴 SELL'} — ${signal.symbol}`)
    .setColor(isBuy ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Price', value: `$${signal.price}`, inline: true },
      { name: 'Strength Score', value: `${signal.score}/100`, inline: true },
      { name: 'Reasons', value: signal.reasons.map((r) => `• ${r}`).join('\n') || 'N/A' }
    )
    .setFooter({ text: `Timeframe: ${TIMEFRAME} • Educational purposes only, apna research zaroor karein` })
    .setTimestamp();
}

async function postSignals(channel, signals) {
  if (signals.length === 0) {
    await channel.send('⏳ Is ghante koi strong signal nahi mila. Market abhi neutral/choppy hai.');
    return;
  }
  for (const signal of signals) {
    await channel.send({ embeds: [buildEmbed(signal)] });
  }
}

async function runScheduledScan() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const signals = await scanMarket();
    await postSignals(channel, signals);
  } catch (err) {
    console.error('Scan error:', err.message);
  }
}

async function registerSlashCommand() {
  const command = new SlashCommandBuilder()
    .setName('signals')
    .setDescription('Abhi ke top crypto signals check karein');

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [command.toJSON()],
  });
  console.log('Slash command /signals register ho gaya.');
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'signals') {
    await interaction.deferReply();
    try {
      const signals = await scanMarket();
      if (signals.length === 0) {
        await interaction.editReply('⏳ Abhi koi strong signal nahi mila. Thodi der baad try karein.');
      } else {
        await interaction.editReply({ embeds: signals.map(buildEmbed) });
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply('Scan karte waqt error aaya, logs check karein.');
    }
  }
});

client.once('ready', async () => {
  console.log(`Bot login ho gaya: ${client.user.tag}`);
  await registerSlashCommand();

  cron.schedule(CRON_SCHEDULE, runScheduledScan);
  console.log(`Cron schedule set: "${CRON_SCHEDULE}" — bot har ghante signals bhejega.`);
});

client.login(DISCORD_TOKEN);
