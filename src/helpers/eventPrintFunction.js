const fetch = require('node-fetch');

const { getTotalText, getFirstCallText, getUpdateText, getTrendingText, getPreCallText } = require('../../methods/texts.js');
const pool = require('../../methods/database.js');
const { TELEGRAM, TOOLS, QUERIES } = require('../../constants.js');
const { getTokenData } = require('./utils.js');

async function eventPrint(event) {
    try {
        const message = event.message;
        const channelsInBase = (await pool.query(QUERIES.getChannelsInBaseByBotNumber, [TELEGRAM.BOT_NUMBER])).rows.map(row => parseInt(row.channel_id, 10));
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
                        'X-API-Key': TOOLS.DEXTOOLS_API_KEY
                    }
                }).then(res => res.json());

                // try to get ETH token
                const ethAddress = pairData.statusCode === 200 ? pairData?.data?.token?.address : iterator;
                const tokenData = await fetch(
                    `https://api.dextools.io/v1/token?chain=ether&address=${ethAddress}`,
                    {
                        headers: {
                            'X-API-Key': TOOLS.DEXTOOLS_API_KEY
                        }
                    }
                ).then(res => res.json());

                if (tokenData.statusCode === 200) return tokenData;


                // try to get BSC pair
                const bscPairData = await fetch(`https://api.dextools.io/v1/pair?chain=bsc&address=${iterator}`, {
                    headers: {
                        'X-API-Key': TOOLS.DEXTOOLS_API_KEY
                    }
                }).then(res => res.json());

                // try to get BSC token
                const bscAddress = bscPairData.statusCode === 200 ? bscPairData?.data?.token?.address : iterator;
                const bscTokenData = await fetch(`https://api.dextools.io/v1/token?chain=bsc&address=${bscAddress}`, {
                    headers: {
                        'X-API-Key': TOOLS.DEXTOOLS_API_KEY
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
                    key_name: '$' + (tokenDataDexView?.token0Symbol || tokenDataDexView?.baseTokenSymbol || ""),
                    address: (tokenDataDexView.token0 || tokenDataDexView.baseToken || "").toLowerCase(),
                    market_cap: parseInt(tokenDataDexView.fdv, 10) || 0,
                    chain: tokenDataDexView.chatId === "1" ? "ether" : "bsc",
                }

            if (!tokenInfo?.market_cap && tokenInfo?.market_cap !== 0) {
                delete tokenInfo.market_cap;
            }

            if (!tokenInfo?.address) continue;

            const pairInfo = await fetch(`https://api.dextools.io/v1/pair?chain=${tokenInfo.chain}&address=${tokenInfo?.pairs?.[0]?.address}`, {
                headers: {
                    'X-API-Key': TOOLS.DEXTOOLS_API_KEY
                }
            }).then(res => res.json());


            const hasReleasedCall = (await pool.query(QUERIES.hasReleasedCallByTokenAndPrelaunch, [tokenInfo.address, false])).rows[0] || false;

            const isPrelaunchInDextools = (pairInfo?.data?.metrics?.liquidity || 0) <= 0 || !tokenData?.data?.pairs?.[0];
            const isPrelaunchInDexview = (tokenDataDexView.liquidity || 0) <= 0;

            const isPrelaunch = (isPrelaunchInDextools && isPrelaunchInDexview) && !hasReleasedCall;

            // const isPrelaunch = true;

            const tokenDetailsForMessage = {
                holders: tokenData?.data?.metrics?.holders || 'no data',
                renounced: tokenData?.data?.audit?.is_contract_renounced !== undefined ? tokenData?.data?.audit?.is_contract_renounced : "no data",
                liquidity: pairInfo?.data?.metrics?.liquidity || tokenDataDexView?.liquidity || 0,
                volume24: pairInfo?.data?.price24h?.volume || tokenDataDexView?.newInformation?.volume24h || 0
            }


            console.log(tokenData);
            console.log(tokenDataDexView);

            console.log('is prelaunch:', isPrelaunch);
            console.log(((await pool.query(QUERIES.getTokenIdByAddress, [tokenInfo.address])).rows));

            const alreadyCalledFromThisChannel = (await pool.query(
                QUERIES.checkIfCalledFromChannelByTokenAndPrelaunch,
                [tokenInfo.address, channelID.toString(), isPrelaunch]
            )).rows[0];

            console.log('already called from this channel:', alreadyCalledFromThisChannel || false);
            if (alreadyCalledFromThisChannel) continue;


            const {
                channelInnerLink,
                channelTitle
            } = await (async () => {

                const savedData = (await pool.query(
                    QUERIES.getSavedDataByChannelId,
                    [channelID.toString()]
                )).rows[0];

                return {
                    channelInnerLink: savedData.link,
                    channelTitle: savedData.name
                }

            })();

            async function getTotal() {
                const allCalls =
                    (await pool.query(QUERIES.getTotalCallsByTokenAddress, [tokenInfo.address]))
                        .rows.sort((a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10));

                for (const call of allCalls) {
                    const dbData = (await pool.query(QUERIES.getSavedDataByChannelId, [call.channel_id])).rows[0];
                    call.channelInnerLink = dbData?.link;
                    call.channelTitle = dbData?.name;
                }


                const channelsDetails = [];

                for (let index = 0; index < allCalls.length; index++) {
                    const call = allCalls[index];
                    const maxMarketCup = allCalls.slice(index + 1, allCalls.length)
                        .reduce((acc, cur) => {
                            if (parseInt(cur.market_cap, 10) > acc) {
                                return parseInt(cur.market_cap, 10);
                            } else {
                                return acc;
                            }
                        }, 0);

                    call.ROI = maxMarketCup / (parseInt(call.market_cap, 10) || 0); // getting Infinity in case of 0
                    channelsDetails.push(call);
                }

                return channelsDetails.sort((a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10));
            }

            const tokenInBase = (await pool.query(QUERIES.getTokenDataByAddress, [tokenInfo?.address])).rows[0];
            if (!tokenInBase) {

                await pool.query(
                    QUERIES.insertToken,
                    [tokenInfo?.name, tokenInfo?.key_name, tokenInfo?.address, tokenInfo?.chain, parseInt(tokenInfo?.market_cap, 10) || null]
                );
                await pool.query(
                    QUERIES.insertCall,
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
                        TELEGRAM.CHANNEL,
                        getFirstCallText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        }
                    ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                } else {
                    await bot.telegram.sendMessage(
                        TELEGRAM.CHANNEL,
                        getPreCallText(tokenInfo, channelInnerLink, channelTitle, message),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        }
                    ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                }

                const channelsDetails = await getTotal();


                const totalMessage = await bot.telegram.sendMessage(
                    TELEGRAM.CHANNEL,
                    getTotalText(tokenInfo, channelsDetails),
                    {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    }
                ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });

                await pool.query(
                    QUERIES.updateTokenTotalMessageId,
                    [totalMessage.message_id, tokenInfo.address]
                );
            } else {
                await pool.query(
                    QUERIES.insertCall,
                    [
                        tokenInfo?.address,
                        channelID.toString(),
                        +new Date(),
                        parseInt(message.id, 10),
                        parseInt(tokenInfo.market_cap, 10) || null,
                        isPrelaunch
                    ]
                );

                const channelsDetails = await getTotal();

                const tokenDbData = (await pool.query(QUERIES.getTokenDataByAddress, [tokenInfo.address])).rows[0];

                if (!isPrelaunch) {
                    await bot.telegram.sendMessage(
                        TELEGRAM.CHANNEL,
                        getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_to_message_id: tokenDbData.total_message_id
                        }
                    ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                } else {
                    await bot.telegram.sendMessage(
                        TELEGRAM.CHANNEL,
                        getPreCallText(tokenInfo, channelInnerLink, channelTitle, message),
                        {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_to_message_id: tokenDbData.total_message_id
                        }
                    ).catch((err) => { console.log('----handled---'); console.log(err); console.log('----------'); });
                }

                await bot.telegram.editMessageText(
                    TELEGRAM.CHANNEL,
                    tokenDbData.total_message_id,
                    undefined,
                    getTotalText(tokenInfo, channelsDetails),
                    {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    }
                ).catch(() => { });
            }

            const currentMaxCap = (await pool.query(QUERIES.getCurrentMaxMarketCapByTokenAddress, [tokenInfo.address])).rows[0]?.max_market_cap;

            if (currentMaxCap < parseInt(tokenInfo.market_cap, 10) || !currentMaxCap) {
                await pool.query(
                    QUERIES.updateTokenMaxMarketCap,
                    [parseInt(tokenInfo.market_cap, 10) || null, tokenInfo.address]
                );
                console.log('updated max cap:', parseInt(tokenInfo.market_cap, 10));
            }
            console.log('getting tops...');
            const tops = await getTops();
            const ROITops = await getROITops();
            console.log('got tops');

            const topsMessage = (await pool.query(QUERIES.getGeneralInfo)).rows[0]?.tops_message_id;

            await bot.telegram.editMessageText(
                TELEGRAM.CHANNEL,
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
            ).catch(() => { });
        }
    } catch (error) {
        console.log('CATCH BLOCK - WARNING');
        console.log(error);
        console.log('----------------------');
    }
}

export default eventPrint;