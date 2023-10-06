require('dotenv').config();

const { spawn } = require('child_process');
const { TelegramClient, Api } = require('telegram');
const { NewMessage } = require('telegram/events');
const { StringSession } = require('telegram/sessions');
const SQLiteSession = require('gramjs-sqlitesession');
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const app = express();

const pool = require('./methods/database.js');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const { getTotalText, getFirstCallText, getUpdateText, getTrendingText, getPreCallText } = require('./methods/texts.js');

const botNumber = parseInt(process.env.BOT_NUMBER, 10);

async function getTokenData(poolAddress) { 

    // chaniID doesn't matter in this request
    const pair = await fetch(`https://dex-api-production.up.railway.app/v1/dex/pair/search/${poolAddress}?chainId=1`)
    .then(r => r.json())
    .then(r => r?.pairs?.data[0] || r?.pairs?.data)
    .catch((error) => {
        console.log(error);
        return null;
    });

    console.log(pair);

    if (!pair) {
        console.log('no pairs found');
        return null;
    }

    const tokenData = await fetch(
        `https://dex-api-production.up.railway.app/v1/dex/pair/poolAddress/${pair?.address}?chainId=${pair?.chainId}`
    )
    .then(r => r.json())
    .then(r => r?.pairs?.data[0] || r?.pairs?.data)
    .catch((error) => {
        console.log(error);
        return null;
    });


    return tokenData || pair;
}

function reloadScript() {
    exec(`pm2 restart ${process.env.PM2_NAME}`, (error, stdout, stderr) => {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
}

(async () => {

    let botWorking = false;

    const bot = new Telegraf(process.env.BOT_TOKEN, {
        handlerTimeout: Infinity,
        
    });

    const currentBotData = (await pool.query(`SELECT * FROM backup_bots WHERE is_current = $1 AND bot_number = $2`, [true, botNumber])).rows[0];
    const stringSession = new StringSession(currentBotData.session);

    const client = new TelegramClient(stringSession, currentBotData.api_id, currentBotData.api_hash, {
        connectionRetries: 10,
        autoReconnect: true
    });

    // try {
    //     await client.start();
    // } catch (error) {
    //     console.log(error);   
    // }
    
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
                });
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

    function pythonHandler() {
        const python = spawn('python', ['receiver.py', currentBotData.api_id, currentBotData.api_hash, currentBotData.session]);

        // python.stdout.on('data', async function (data) {
        //     console.log(data.toString());
        //     try {
        //         const event = JSON.parse(data.toString());
    
        //         while (handlerBusy) {
        //             await new Promise(resolve => setTimeout(resolve, 30));
        //         }
    
        //         handlerBusy = true;
        //         console.log('set handler busy');
        //         try {
        //             await eventPrint({
        //                 message: event
        //             });
        //         } catch (error) {
        //             console.log(error);
        //         }
    
        //         handlerBusy = false;
        //         console.log('release handler');
    
        //     } catch (error) {
        //         console.log(error);
        //     }
        // });
        
        return python;
    }

    let python = pythonHandler();

    async function killPython() {
        python.kill();
        await client.start();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async function reloadPython() {
        await client.destroy();
        python = pythonHandler();
    }


    async function getROITops() {  
        const calls24 = (await pool.query(`SELECT c.*, t.*, ci.* FROM calls c JOIN tokens t ON c.token_id = t.id JOIN channels_info ci ON c.channel_id = ci.channel_id WHERE c.timestamp > $1`, [+new Date() - 1000 * 60 * 60 * 24])).rows;
      
        const sortedByTokens = calls24.reduce((acc, cur) => {
            const existingArrayIndex = acc.findIndex(subarray => subarray[0]?.address === cur.address);

            if (existingArrayIndex === -1) {
                acc.push([
                    cur
                ]);
            } else {
                acc[existingArrayIndex].push(cur);
            }

            return acc;
        }, []);

        for (const tokens of sortedByTokens) {
            tokens.sort((a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10));
        }

        const ROIs = sortedByTokens.map(calls => {

            const result = [];

            for (let index = 0; index < calls.length; index++) {
                const call = calls[index];
                
                const maxMarketCup = calls.slice(index+1, calls.length)
                .reduce((acc, cur) => {
                    if (parseInt(cur.market_cap, 10) > acc) {
                        return parseInt(cur.market_cap, 10);
                    } else {
                        return acc;
                    }
                }, 0);
                
                call.maxMarketCupTest = maxMarketCup;
                call.ROI = maxMarketCup / (parseInt(call.market_cap, 10) || 0);
                if (call.ROI > 1) {
                    result.push(call);   
                }
            }

            return result;
        });

        const flatRois = ROIs.flat(Infinity).filter(e => e.ROI !== Infinity);

        const topROI = flatRois.sort((a, b) => b.ROI - a.ROI).slice(0, 5);
        
        return topROI;
    }

    async function getTops() {
        const calls24 = (await pool.query(`SELECT c.*, t.* FROM calls c JOIN tokens t ON c.token_id = t.id WHERE c.timestamp > $1;`, [+new Date() - 1000 * 60 * 60 * 24])).rows;
        
        for (const iterator of calls24) {
            iterator.tokenData = {
                ...iterator
            }
        }

        const counted = calls24.reduce((acc, cur) => {
            if (acc.every(e => e.tokenData.address !== cur.tokenData.address)) {
                acc.push({
                    ...cur,
                    count: 1
                });
            } else {
                acc.find(e => e.tokenData.address === cur.tokenData.address).count++;
            }

            return acc;
        }, []).sort((a, b) => b.count - a.count).slice(0, 10);

        console.log('last call', calls24[calls24.length - 1]);
        
        return counted;
    }

    async function eventPrint(event) {
        try {
            const message = event.message;
            const channelsInBase = (await pool.query(`SELECT channel_id FROM channels WHERE bot_number = $1`, [botNumber])).rows.map(row => parseInt(row.channel_id, 10));
            const channelID = parseInt(message?.peer_id?.channel_id || message?.peer_id?.chat_id, 10);

            console.log(`[${new Date()}] got message from channel:`, channelID);

            if (!channelsInBase.includes(channelID)) {
                return console.log('channel is not in base');
            }

            const messageText = message?.message || "";
            const entitiesURLs = (message?.entities?.map(e => e?.url) || []).filter(e => e);

            const mixedText = messageText + " " + entitiesURLs.join(" ");

            const regex = /0x[a-fA-F0-9]{40}/g;
            const matches = [...new Set(mixedText.match(regex) || [])].filter(e => e !== '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
            console.log('matches:', matches);

            for (const iterator of matches) {

                const tokenData = await (async () => {

                    // try to get ETH pair
                    const pairData = await fetch(`https://api.dextools.io/v1/pair?chain=ether&address=${iterator}`, {
                        headers: {
                            'X-API-Key': process.env.DEXTOOLS_API_KEY
                        }
                    }).then(res => res.json());

                    // try to get ETH token
                    const ethAddress = pairData.statusCode === 200 ? pairData?.data?.token?.address : iterator;
                    const tokenData = await fetch(
                        `https://api.dextools.io/v1/token?chain=ether&address=${ethAddress}`,
                        {
                            headers: {
                                'X-API-Key': process.env.DEXTOOLS_API_KEY
                            }
                        }
                    ).then(res => res.json());

                    if (tokenData.statusCode === 200) return tokenData;


                    // try to get BSC pair
                    const bscPairData = await fetch(`https://api.dextools.io/v1/pair?chain=bsc&address=${iterator}`, {
                        headers: {
                            'X-API-Key': process.env.DEXTOOLS_API_KEY
                        }
                    }).then(res => res.json());

                    // try to get BSC token
                    const bscAddress = bscPairData.statusCode === 200 ? bscPairData?.data?.token?.address : iterator;
                    const bscTokenData = await fetch(`https://api.dextools.io/v1/token?chain=bsc&address=${bscAddress}`, {
                        headers: {
                            'X-API-Key': process.env.DEXTOOLS_API_KEY
                        }
                    }).then(res => res.json());

                    if (bscTokenData.statusCode === 200) return bscTokenData;

                    console.log('no token data found');

                    console.log(tokenData);
                    console.log(bscTokenData);

                })();

                const tokenDataDexView = tokenData?.data?.address ? {} : await getTokenData(iterator);

                console.log(tokenData);

                console.log(tokenDataDexView);

                if (!tokenData && !tokenDataDexView) continue;

                const tokenInfo = tokenData?.data?.address ? {
                    name: tokenData?.data?.name || "",
                    key_name: '$' + tokenData?.data?.symbol || "",
                    address: tokenData?.data?.address || "",
                    market_cap: tokenData?.data?.reprPair?.price * tokenData?.data?.metrics?.totalSupply,
                    chain: tokenData?.data?.chain || "ether",
                    pairs: tokenData?.data?.pairs || []
                } 
                :
                {
                    name: tokenDataDexView.token0Name || tokenDataDexView.baseTokenName || "",
                    key_name: '$' + (tokenDataDexView?.token0Symbol || tokenDataDexView?.baseTokenSymbol  ||  ""),  
                    address: (tokenDataDexView.token0 || tokenDataDexView.baseToken  || "").toLowerCase(),
                    market_cap: parseInt(tokenDataDexView.fdv, 10) || 0,
                    chain: tokenDataDexView.chatId === "1" ? "ether" : "bsc",
                }

                if (!tokenInfo?.market_cap && tokenInfo?.market_cap !== 0) {
                    delete tokenInfo.market_cap;
                }

                if (!tokenInfo?.address) continue;
                
                const pairInfo = await fetch(`https://api.dextools.io/v1/pair?chain=${tokenInfo.chain}&address=${tokenInfo?.pairs?.[0]?.address}`, {
                    headers: {
                        'X-API-Key': process.env.DEXTOOLS_API_KEY
                    }
                }).then(res => res.json());


                const hasReleasedCall = (await pool.query('SELECT * FROM calls WHERE token_id = (SELECT id FROM tokens WHERE address = $1) AND prelaunch = $2 LIMIT 1', [tokenInfo.address, false])).rows[0] || false;
                
                const isPrelaunchInDextools = (pairInfo?.data?.metrics?.liquidity || 0) <= 0 || !tokenData?.data?.pairs?.[0];
                const isPrelaunchInDexview = (tokenDataDexView.liquidity || 0) <= 0;

                const isPrelaunch = (isPrelaunchInDextools && isPrelaunchInDexview) && !hasReleasedCall;

                // const isPrelaunch = true;

                const tokenDetailsForMessage = {
                    holders: tokenData?.data?.metrics?.holders || 'no data',
                    renounced: tokenData?.data?.audit?.is_contract_renounced !==  undefined ? tokenData?.data?.audit?.is_contract_renounced : "no data",
                    liquidity: pairInfo?.data?.metrics?.liquidity || tokenDataDexView?.liquidity || 0,
                    volume24: pairInfo?.data?.price24h?.volume || tokenDataDexView?.newInformation?.volume24h || 0
                }


                console.log(tokenData);
                console.log(tokenDataDexView);

                console.log('is prelaunch:', isPrelaunch);
                console.log(((await pool.query('SELECT id FROM tokens WHERE address = $1', [tokenInfo.address])).rows));

                const alreadyCalledFroThisChannel = (await pool.query(
                    'SELECT * FROM calls WHERE token_id = (SELECT id FROM tokens WHERE address = $1) AND channel_id = $2 AND prelaunch = $3 LIMIT 1',
                    [tokenInfo.address, channelID.toString(), isPrelaunch]
                )).rows[0];

                console.log('already called from this channel:', alreadyCalledFroThisChannel || false);
                if (alreadyCalledFroThisChannel) continue;


                const {
                    channelInnerLink,
                    channelTitle
                } = await (async () => {

                    const savedData = (await pool.query(
                        `SELECT * FROM channels_info WHERE channel_id = $1`,
                        [channelID.toString()]
                    )).rows[0];

                    return {
                        channelInnerLink: savedData.link,
                        channelTitle: savedData.name
                    }

                })();

                async function getTotal() {
                    const allCalls = 
                        (await pool.query(`SELECT c.*, t.* FROM calls c JOIN tokens t ON c.token_id = t.id WHERE c.token_id = (SELECT id FROM tokens WHERE address = $1);`, [tokenInfo.address]))
                        .rows.sort((a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10));

                    for (const call of allCalls) {
                        const dbData = (await pool.query(`SELECT * FROM channels_info WHERE channel_id = $1`, [call.channel_id])).rows[0];
                        call.channelInnerLink = dbData?.link;
                        call.channelTitle = dbData?.name;
                    }


                    const channelsDetails = [];

                    for (let index = 0; index < allCalls.length; index++) {
                        const call = allCalls[index];
                        const maxMarketCup = allCalls.slice(index+1, allCalls.length)
                        .reduce((acc, cur) => {
                            if (parseInt(cur.market_cap, 10) > acc) {
                                return parseInt(cur.market_cap, 10);
                            } else {
                                return acc;
                            }
                        }, 0);

                        call.ROI = maxMarketCup / (parseInt(call.market_cap , 10)|| 0); // getting Infinity in case of 0
                        channelsDetails.push(call);
                    }

                    return channelsDetails.sort((a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10));
                }

                const tokenInBase = (await pool.query(`SELECT * FROM tokens WHERE address = $1`, [tokenInfo?.address])).rows[0];
                if (!tokenInBase) {

                    await pool.query(
                        'INSERT INTO tokens (name, key_name, address, chain, max_market_cap) VALUES ($1, $2, $3, $4, $5)  ON CONFLICT (address) DO NOTHING;',
                        [tokenInfo?.name, tokenInfo?.key_name, tokenInfo?.address, tokenInfo?.chain, parseInt(tokenInfo?.market_cap, 10) || null]
                    );
                    await pool.query(
                        'INSERT INTO calls (token_id, channel_id, timestamp, message_id, market_cap, prelaunch) VALUES ((SELECT id FROM tokens WHERE address = $1), $2, $3, $4, $5, $6)',
                        [
                            tokenInfo?.address,
                            channelID.toString(),
                            +new Date(),
                            parseInt(message.id, 10),
                            parseInt(tokenInfo.market_cap, 10) || null,
                            isPrelaunch
                        ]
                    );
                    if (!isPrelaunch) {
                        await bot.telegram.sendMessage(
                            process.env.TELEGRAM_CHANNEL,
                            getFirstCallText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message),
                            {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            }
                        ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                    } else {
                        await bot.telegram.sendMessage(
                            process.env.TELEGRAM_CHANNEL,
                            getPreCallText(tokenInfo, channelInnerLink, channelTitle, message),
                            {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            }
                        ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                    }

                    const channelsDetails = await getTotal();


                    const totalMessage = await bot.telegram.sendMessage(
                        process.env.TELEGRAM_CHANNEL,
                        getTotalText(tokenInfo, channelsDetails),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        }
                    ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });

                    await pool.query(
                        'UPDATE tokens SET total_message_id = $1 WHERE address = $2',
                        [totalMessage.message_id, tokenInfo.address]
                    );
                } else {
                    await pool.query(
                        'INSERT INTO calls (token_id, channel_id, timestamp, message_id, market_cap, prelaunch) VALUES ((SELECT id FROM tokens WHERE address = $1), $2, $3, $4, $5, $6)',
                        [
                            tokenInfo?.address,
                            channelID.toString(),
                            +new Date(),
                            parseInt(message.id, 10),
                            parseInt(tokenInfo.market_cap, 10)|| null,
                            isPrelaunch
                        ]
                    );

                    const channelsDetails = await getTotal();

                    const tokenDbData = (await pool.query(`SELECT * FROM tokens WHERE address = $1`, [tokenInfo.address])).rows[0];

                    if (!isPrelaunch) {
                        await bot.telegram.sendMessage(
                            process.env.TELEGRAM_CHANNEL,
                            getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails),
                            {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                reply_to_message_id: tokenDbData.total_message_id
                            }
                        ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                    } else {
                        await bot.telegram.sendMessage(
                            process.env.TELEGRAM_CHANNEL,
                            getPreCallText(tokenInfo, channelInnerLink, channelTitle, message),
                            {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                reply_to_message_id: tokenDbData.total_message_id
                            }
                        ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                    }

                    await bot.telegram.editMessageText(
                        process.env.TELEGRAM_CHANNEL,
                        tokenDbData.total_message_id,
                        undefined,
                        getTotalText(tokenInfo, channelsDetails),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        }
                    ).catch(() => {});
                }

                const currentMaxCap = (await pool.query('SELECT max_market_cap FROM tokens WHERE address = $1', [tokenInfo.address])).rows[0]?.max_market_cap;

                if (currentMaxCap < parseInt(tokenInfo.market_cap, 10) || !currentMaxCap) {
                    await pool.query(
                        `UPDATE tokens SET max_market_cap = $1 WHERE address = $2`, 
                        [parseInt(tokenInfo.market_cap, 10) || null, tokenInfo.address]
                    );
                    console.log('updated max cap:', parseInt(tokenInfo.market_cap, 10));
                }
                console.log('getting tops...');
                const tops = await getTops();
                const ROITops = await getROITops();
                console.log('got tops');

                const topsMessage = (await pool.query(`SELECT * FROM general`)).rows[0]?.tops_message_id;

                await bot.telegram.editMessageText(
                    process.env.TELEGRAM_CHANNEL,
                    topsMessage,
                    undefined,
                    getTrendingText(tops, ROITops),
                    {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('🟢Live Trending🟢', '_blank')
                        ])
                    }
                ).catch(() => {});
            }
        } catch (error) {
            console.log('CATCH BLOCK - WARNING');
            console.log(error);
            console.log('----------------------');
        }
    }

    async function swapAccount(idToSet, ctx) {
        await pool.query(`UPDATE backup_bots SET is_current = false WHERE bot_number = $1`, [botNumber]);
        await pool.query(`UPDATE backup_bots SET is_current = true WHERE id = $1 AND bot_number = $2`, [idToSet, botNumber]);

        if (ctx) {
            ctx.reply('Done! Bot will be restarted in 2 seconds');
        }

        reloadScript();
    }

    async function swapToNextAccount() {
        const currentAccount = (await pool.query('SELECT * FROM backup_bots WHERE is_current = $1 AND bot_number = $2', [true, botNumber])).rows[0];
        const nextAccounts = (await pool.query('SELECT * FROM backup_bots WHERE id > $1 AND bot_number = $2', [currentAccount.id, botNumber])).rows;
        for (const admin of JSON.parse(process.env.TELEGRAM_ADMINS)) {
            try {
                if (nextAccounts[0]) {
                    await bot.telegram.sendMessage(admin, `Bot #${currentAccount.id} banned, switching to bot #${nextAccounts[0].id}`);
                } else {
                    await bot.telegram.sendMessage(admin, `Bot #${currentAccount.id} banned, AND IT WAS LAST BOT !!!`);
                }
            } catch (error) {
                console.log(error);
            }
        }

        if (nextAccounts[0]) {
            return swapAccount(nextAccounts[0].id);
        }
    }

    bot.on('message', async (ctx) => {
        console.log(botWorking);
        if (!JSON.parse(process.env.TELEGRAM_ADMINS).includes(ctx.message.from.id) || !botWorking) return;


        if (ctx?.message?.text?.includes('/add_account\n')) {
            try {
                const inputData = ctx.message.text.replace('/add_account\n', '').split('\n');
                await pool.query(
                    `INSERT INTO backup_bots (API_ID, API_HASH, SESSION, proxy, is_current, bot_number) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [inputData[1], inputData[2], inputData[3], inputData[0], false, botNumber]
                );
                ctx.reply('Done!');
            } catch (error) {
                console.log(error);
            }
        }

        if (ctx?.message?.text === '/parse_account') {
            await killPython();
            const allDialogs = await client.getDialogs();
            const allChannels = allDialogs.map(e => ({
                title: e?.entity?.title || 'Channel',
                id: parseInt(e?.entity?.id, 10),
                username: e?.entity?.username || parseInt(e?.entity?.id, 10),
            }));

            // select all channels from all bots to prevent duplicates
            const allChannelsInBase = (await pool.query(`SELECT * FROM channels`)).rows.map(row => parseInt(row.channel_id, 10));

            const filteredChannels = allChannels.filter(e => !allChannelsInBase.includes(e.id));
            console.log(filteredChannels);

            await ctx.reply('wait...');
            for (const channel of filteredChannels) {
                console.log('added', channel);
                await pool.query(`DELETE FROM channels WHERE channel_id = $1 AND bot_number = $2`, [channel?.id?.toString(), botNumber]);

                await pool.query(`INSERT INTO channels (channel_id, link, bot_number) VALUES ($1, $2, $3)`, [channel?.id?.toString(), `https://t.me/${channel?.username}`, botNumber]);


                await pool.query(
                    `DELETE FROM channels_info WHERE channel_id = $1`,
                    [channel?.id?.toString()]
                );

                await pool.query(
                    `INSERT INTO channels_info (channel_id, link, name, expiration) VALUES ($1, $2, $3, $4)`,
                    [
                        channel?.id?.toString(),
                        channel?.username,
                        channel?.title,
                        +new Date() + 1000 * 60 * 60 * 24 * 7
                    ]
                );
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // await ctx.reply('Found:\n' + allChannels.map(e => `https://t.me/${e.username}`).join('\n'));
            await ctx.reply('Done!');
            reloadPython();
        }

        if (ctx?.message?.text === '/list_accounts') {
            try {
                const accounts = (await pool.query(`SELECT * FROM backup_bots WHERE bot_number = $1`, [botNumber])).rows;
                await ctx.reply(accounts.map(e =>
                    `
                    --------------------
                    
                    <b>ID:</b> <code>${e.id}</code>
                    <b>Proxy:</b> <code>${e.proxy}</code>
                    <b>API_ID:</b> <code>${e.api_id}</code>
                    <b>API_HASH:</b> <code>${e.api_hash}</code>
                    <b>SESSION:</b> <code>${e.session}</code>
                    <b>IS_CURRENT:</b> <code>${e.is_current || false}</code>

                    --------------------
                    `.replace(/                    /g, '')
                ).join('\n\n'),
                    {
                        parse_mode: 'HTML'
                    });
            } catch (error) {
                console.log(error);
            }
        }

        if (ctx?.message?.text?.includes('/remove_account ')) {
            try {
                const idToRemove = parseInt(ctx.message.text.replace('/remove_account ', ''), 10);
                const isCurrent = (await pool.query(`SELECT * FROM backup_bots WHERE id = $1 AND bot_number = $2`, [idToRemove, botNumber])).rows[0]?.is_current;

                if (isCurrent) {
                    return ctx.reply('You can\'t remove current account');
                }

                await pool.query(`DELETE FROM backup_bots WHERE id = $1 AND bot_number = $2`, [idToRemove, botNumber]);
                ctx.reply('Done!');
            } catch (error) {
                console.log(error);
            }
        }


        if (ctx?.message?.text?.includes('/swap_account ')) {
            try {
                const idToSet = parseInt(ctx.message.text.replace('/swap_account ', ''), 10);
                await swapAccount(idToSet, ctx);
            } catch (error) {
                console.log(error);
            }
        }


        if (ctx?.message?.text === '/init_tops') {
            try {
                await ctx.reply('wait...');
                const currentTopsMessage = (await pool.query(`SELECT * FROM general`)).rows[0]?.tops_message_id;
                console.log('tops_message:', currentTopsMessage);
                if (currentTopsMessage) {
                    try {
                        await bot.telegram.deleteMessage(process.env.TELEGRAM_CHANNEL, currentTopsMessage)
                        .catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                    } catch (error) {
                        console.log('----------HANDLED ERROR----------');
                        console.log(error);
                        console.log('----------HANDLED ERROR----------');
                    }
                }
                console.log('getting tops...');
                const tops = await getTops();
                const ROITops = await getROITops();
                console.log('got tops');
                const messageData = await bot.telegram.sendMessage(
                    process.env.TELEGRAM_CHANNEL,
                    getTrendingText(tops, ROITops),
                    {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('🟢Live Trending🟢', '_blank')
                        ])
                    }
                ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });

                await bot.telegram.pinChatMessage(process.env.TELEGRAM_CHANNEL, messageData.message_id).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });

                await pool.query(`UPDATE general SET tops_message_id = $1 WHERE id = 1`, [messageData.message_id]);

                await ctx.reply('Done!');
            } catch (error) {
                console.log(error);
            }
        }

        if (ctx?.message?.text === '/uninit_tops') {

            const currentTopsMessage = (await pool.query(`SELECT * FROM general`)).rows[0]?.tops_message_id;
            if (currentTopsMessage) {
                try {
                    bot.telegram.deleteMessage(process.env.TELEGRAM_CHANNEL, currentTopsMessage).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                } catch (error) {
                    console.log('----------HANDLED ERROR----------');
                    console.log(error);
                    console.log('----------HANDLED ERROR----------');
                }
            }

            await ctx.reply('Done!');
        }

        if (ctx?.message?.text === '/list') {
            try {
                const allChannels = (await pool.query(`SELECT * FROM channels WHERE bot_number = $1`, [botNumber])).rows;
                const messageString = allChannels.map(e => e.link).filter(e => e).join('\n') || 'No channels';
                let max_size = 4000;
                let amountSliced = messageString.length/max_size;
                let start = 0;
                let end = max_size;
                for (let i = 0; i < amountSliced; i++) {
                    message = messageString.slice(start, end) 
                    start = start + max_size
                    end = end + max_size
                    await ctx.reply(message);
                }
            } catch (error) {
                console.log(error);
            }
        }

        if (ctx?.message?.text?.includes('/remove_channels\n')) {
            try {
                const channels = ctx.message.text.replace('/remove_channels\n', '').split('\n');
                console.log('call');
                for (const channel of channels) {
                    await pool.query(`DELETE FROM channels WHERE link = $1 AND bot_number = $2`, [channel, botNumber]);
                }

                await ctx.reply('Done!');
            } catch (error) {
                console.log(error);
            }
        }

        async function callJoin(ctx, botID, customChannels) {
            try {
                let channels = customChannels || ctx.message.text.replace('/add_channels\n', '').split('\n');
                const allChannelsInBase = (await pool.query(`SELECT * FROM channels`)).rows.map(row => parseInt(row.link, 10));
                
                const existingChannels = [];

                channels = channels.filter(e => {
                    const newChannel = !allChannelsInBase.includes(e);
                    if (!newChannel) {
                        existingChannels.push(e);                
                    }
                    return newChannel;
                });

                if (existingChannels[0]) {
                    await ctx.reply('This channels are already in list of some other bot (ignored them):');
                    await ctx.reply(existingChannels.join('\n'));
                }

                let backupAccounts = (await pool.query('SELECT * FROM backup_bots WHERE is_current = $1 AND bot_number = $2', [false, botNumber])).rows;
                backupAccounts = botID ? backupAccounts.filter(e => e.id === botID) : backupAccounts;
                const backupSessions = [];



                for (const iterator of backupAccounts) {
                    try {
                        const stringSession = new StringSession(iterator.session);

                        const proxySettings = {
                            useWSS: false,
                            proxy: {
                                ip: iterator.proxy.split(':')[0],
                                port: parseInt(iterator.proxy.split(':')[1], 10),
                                MTProxy: false,
                                secret: "00000000000000000000000000000000",
                                socksType: 5,
                                timeout: 10,
                                username: iterator.proxy.split(':')[2],
                                password: iterator.proxy.split(':')[3],
                            },
                        };

                        const newClient = new TelegramClient(stringSession, iterator.api_id, iterator.api_hash, {
                            connectionRetries: 5,
                            autoReconnect: true,
                            ...proxySettings
                        });

                        await newClient.start();

                        backupSessions.push({
                            client: newClient,
                            id: iterator.id
                        })
                    } catch (error) {
                        console.log(error);
                    }

                }

                for (let index = 0; index < channels.length; index++) {
                    const channel = channels[index];

                    if (index !== 0) {
                        await ctx.reply(`Waiting 10 mins...`);
                        await new Promise(resolve => setTimeout(resolve, 10*60*1000));
                    }

                    async function joinAction(customClient, customID) {
                        try {
                            console.log('checking channel');

                            async function banHandler(error) {
                                if (error.toString().includes('USER_DEACTIVATED_BAN')) {
                                    await swapToNextAccount();
                                }
                            }

                            const result = channel.includes('t.me/+') ?
                                await joinPrivate()
                                :
                                await (customClient || client).invoke(new Api.channels.JoinChannel({
                                    channel: channel
                                })).catch(banHandler);

                            async function joinPrivate() {
                                try {
                                    return await (customClient || client).invoke(
                                        new Api.messages.ImportChatInvite({
                                            hash: channel.split('t.me/+')[1]
                                        })
                                    ).catch(banHandler);
                                } catch (error) {
                                    if (error.toString().includes('USER_ALREADY_PARTICIPANT')) {
                                        return {
                                            chats: [
                                                await (customClient || client).invoke(
                                                    new Api.messages.CheckChatInvite({
                                                        hash: channel.split('t.me/+')[1]
                                                    })
                                                )
                                                    .then(res => res.chat)
                                                    .catch(banHandler)
                                            ]
                                        };
                                    } else {
                                        throw error;
                                    }
                                }
                            }

                            const chatID = parseInt(result?.chats?.[0]?.id, 10);
                            if (chatID) {
                                await pool.query(`DELETE FROM channels WHERE channel_id = $1 AND bot_number = $2`, [chatID.toString(), botNumber]);

                                await pool.query(`INSERT INTO channels (channel_id, link, bot_number) VALUES ($1, $2, $3)`, [chatID.toString(), channel, botNumber]);



                                const targetChannelData = await client.invoke(new Api.channels.GetFullChannel({
                                    channel: chatID
                                }));
            
                                const channelInnerLink = targetChannelData.chats?.[0]?.username ||
                                    parseInt(targetChannelData.chats?.[0]?.id, 10).toString();
            
                                const channelTitle = targetChannelData.chats?.[0]?.title || 'Channel';
            
                                await pool.query(
                                    `DELETE FROM channels_info WHERE channel_id = $1`,
                                    [chatID.toString()]
                                );
            
                                console.log(channelInnerLink, channelTitle);
                                await pool.query(
                                    `INSERT INTO channels_info (channel_id, link, name, expiration) VALUES ($1, $2, $3, $4)`,
                                    [
                                        chatID.toString(),
                                        channelInnerLink,
                                        channelTitle,
                                        +new Date() + 1000 * 60 * 60 * 24 * 7
                                    ]
                                );


                                
                                await ctx.reply(`Joined ${channel} ${customID ? `with bot #${customID}` : ''}`);
                            }
                        } catch (error) {
                            console.log(error);
                            await ctx.reply(`Error while joining ${channel}: ${error.toString()}`);
                        }
                    }


                    if (!botID) {
                        await joinAction();
                    }

                    for (const iterator of backupSessions) {
                        await joinAction(iterator.client, iterator.id);
                    }

                }

                for (const iterator of backupSessions) {
                    await iterator.client.disconnect();
                }

                await ctx.reply('Done!');
            } catch (error) {
                console.log(error);
            }
        }

        // if (ctx?.message?.text?.includes('/add_channels\n')) {
        //     await killPython();
        //     console.log('call');
        //     await callJoin(ctx);
        //     reloadPython();
        // }

        if (ctx?.message?.text?.includes('/add_channels_for_one ')) {
            const botId = parseInt(ctx.message.text.split('/add_channels_for_one ')[1].split('\n')[0], 10);
            const channels = ctx.message.text.replace(`/add_channels_for_one ${botId}\n`, '').split('\n');
            await callJoin(ctx, botId, channels);
        }
    });
    bot.launch();
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
    await new Promise(r => setTimeout(r, 2000));
    botWorking = true;

})();