const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Telegraf } = require('telegraf');
const express = require('express');

const pool = require('../methods/database.js');
const { TELEGRAM, QUERIES } = require('../constants.js');
const callJoin = require('./helpers/callJoinFunction.js');
const pythonHandler = require('./helpers/pythonUtils.js');
const eventPrint = require('./helpers/eventPrintFunction.js');

const { add_account, parse_account, list_accounts, remove_account, swap_account, init_tops, uninit_tops, list, remove_channels } = require('./helpers/botOnFunctions.js');

const app = express();

const Main = async () => {
    let botWorking = false;

    const bot = new Telegraf(TELEGRAM.BOT_TOKEN, {
        handlerTimeout: Infinity,

    });

    const currentBotData = (await pool.query(QUERIES.getBackupBotsByIsCurrentAndBotNumber, [true, TELEGRAM.BOT_NUMBER])).rows[0];
    const stringSession = new StringSession(currentBotData.session);

    const client = new TelegramClient(stringSession, currentBotData.api_id, currentBotData.api_hash, {
        connectionRetries: 10,
        autoReconnect: true
    });

    let handlerBusy = false;

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.post('/', async (req, res) => {
        res.send('ok');
        console.log(req.body);

        const data = req.body;

        try {
            const event = data;

            while (handlerBusy) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }

            handlerBusy = true;
            console.log('set handler busy');
            try {
                await eventPrint({
                    message: event
                }, bot);
            } catch (error) {
                console.log(error);
            }

            handlerBusy = false;
            console.log('release handler');

        } catch (error) {
            console.log(error);
        }
    })

    app.listen(3010);

    let python = pythonHandler(currentBotData);

    async function killPython() {
        python.kill();
        await client.start();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async function reloadPython() {
        await client.destroy();
        python = pythonHandler(currentBotData);
    }

    bot.on('message', async (ctx) => {
        console.log(botWorking);
        if (!JSON.parse(TELEGRAM.ADMINS).includes(ctx.message.from.id) || !botWorking) return;


        if (ctx?.message?.text?.includes('/add_account\n')) {
            await add_account(ctx);
        }

        if (ctx?.message?.text === '/parse_account') {
            await killPython();
            await parse_account(ctx, client);
            reloadPython();
        }

        if (ctx?.message?.text === '/list_accounts') {
            await list_accounts(ctx);
        }

        if (ctx?.message?.text?.includes('/remove_account ')) {
            await remove_account(ctx);
        }


        if (ctx?.message?.text?.includes('/swap_account ')) {
            await swap_account(ctx);
        }


        if (ctx?.message?.text === '/init_tops') {
            await init_tops(ctx, bot);
        }

        if (ctx?.message?.text === '/uninit_tops') {
            await uninit_tops(ctx, bot);
        }

        if (ctx?.message?.text === '/list') {
            await list(ctx);
        }

        if (ctx?.message?.text?.includes('/remove_channels\n')) {
            await remove_channels(ctx);
        }

        if (ctx?.message?.text?.includes('/add_channels_for_one ')) {
            const botId = parseInt(ctx.message.text.split('/add_channels_for_one ')[1].split('\n')[0], 10);
            const channels = ctx.message.text.replace(`/add_channels_for_one ${botId}\n`, '').split('\n');
            await callJoin(ctx, botId, channels, client);
        }
    });
    bot.launch();
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await new Promise(r => setTimeout(r, 2000));
    botWorking = true;
}

module.exports = Main;