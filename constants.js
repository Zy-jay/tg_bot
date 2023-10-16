require('dotenv').config();
const fetch = require('node-fetch');

const TELEGRAM = {
    BOT_NUMBER: parseInt(process.env.BOT_NUMBER, 10),
    BOT_TOKEN: process.env.BOT_TOKEN,
    CHANNEL: process.env.TELEGRAM_CHANNEL,
    ADMINS: process.env.TELEGRAM_ADMINS
}

const TOOLS = {
    PM2_NAME: process.env.PM2_NAME,
    DEXTOOLS_API_KEY: process.env.DEXTOOLS_API_KEY
}

const QUERIES = {
    // Requests for information about calls
    getCallDetailsByTimestamp: `SELECT c.*, t.*, ci.* FROM calls c JOIN tokens t ON c.token_id = t.id JOIN channels_info ci ON c.channel_id = ci.channel_id WHERE c.timestamp > $1`,
    getCallDetailsSinceTimestamp: `SELECT c.*, t.* FROM calls c JOIN tokens t ON c.token_id = t.id WHERE c.timestamp > $1;`,
    getChannelsInBaseByBotNumber: `SELECT channel_id FROM channels WHERE bot_number = $1`,
    hasReleasedCallByTokenAndPrelaunch: `SELECT * FROM calls WHERE token_id = (SELECT id FROM tokens WHERE address = $1) AND prelaunch = $2 LIMIT 1`,
    getTokenIdByAddress: `SELECT id FROM tokens WHERE address = $1`,
    getTokenDataByAddress: `SELECT * FROM tokens WHERE address = $1`,
    checkIfCalledFromChannelByTokenAndPrelaunch: 'SELECT * FROM calls WHERE token_id = (SELECT id FROM tokens WHERE address = $1) AND channel_id = $2 AND prelaunch = $3 LIMIT 1',

    // Requests for working with saved data
    getSavedDataByChannelId: `SELECT * FROM channels_info WHERE channel_id = $1`,

    // Requests for general information
    getTotalCallsByTokenAddress: `SELECT c.*, t.* FROM calls c JOIN tokens t ON c.token_id = t.id WHERE c.token_id = (SELECT id FROM tokens WHERE address = $1);`,
    getCurrentMaxMarketCapByTokenAddress: `SELECT max_market_cap FROM tokens WHERE address = $1`,

    // Requests for working with backup bots
    getBackupBotsByIsCurrentAndBotNumber: `SELECT * FROM backup_bots WHERE is_current = $1 AND bot_number = $2`,
    getBackupBotsByIdAndBotNumber: `SELECT * FROM backup_bots WHERE id > $1 AND bot_number = $2`,
    getBackupBotsByBotNumber: `SELECT * FROM backup_bots WHERE bot_number = $1`,
    getBackupBotByIdAndBotNumber: `SELECT * FROM backup_bots WHERE id = $1 AND bot_number = $2`,

    // Requests for general information
    getGeneralInfo: `SELECT * FROM general`,
    getChannelsInfo: `SELECT * FROM channels`,
    getChannelsByBotNumber: `SELECT * FROM channels WHERE bot_number = $1`,

    // Requests for data insertion
    insertToken: `INSERT INTO tokens (name, key_name, address, chain, max_market_cap) VALUES ($1, $2, $3, $4, $5)  ON CONFLICT (address) DO NOTHING;`,
    insertCall: `INSERT INTO calls (token_id, channel_id, timestamp, message_id, market_cap, prelaunch) VALUES ((SELECT id FROM tokens WHERE address = $1), $2, $3, $4, $5, $6)`,
    insertBackupBot: `INSERT INTO backup_bots (API_ID, API_HASH, SESSION, proxy, is_current, bot_number) VALUES ($1, $2, $3, $4, $5, $6)`,
    insertChannel: `INSERT INTO channels (channel_id, link, bot_number) VALUES ($1, $2, $3)`,
    insertChannelInfo: `INSERT INTO channels_info (channel_id, link, name, expiration) VALUES ($1, $2, $3, $4)`,

    // Requests for data updates
    updateTokenTotalMessageId: `UPDATE tokens SET total_message_id = $1 WHERE address = $2`,
    updateTokenMaxMarketCap: `UPDATE tokens SET max_market_cap = $1 WHERE address = $2`,
    updateBackupBotCurrentStatusToFalse: `UPDATE backup_bots SET is_current = false WHERE bot_number = $1`,
    updateBackupBotCurrentStatusToTrue: `UPDATE backup_bots SET is_current = true WHERE id = $1 AND bot_number = $2`,
    updateGeneralTopsMessageId: `INSERT INTO general(id, tops_message_id) VALUES(1, $1) ON CONFLICT (id) DO UPDATE SET tops_message_id = $1`,

    // Requests to delete data
    deleteChannelByChannelIdAndBotNumber: `DELETE FROM channels WHERE channel_id = $1 AND bot_number = $2`,
    deleteChannelInfoByChannelId: `DELETE FROM channels_info WHERE channel_id = $1`,
    deleteBackupBotByIdAndBotNumber: `DELETE FROM backup_bots WHERE id = $1 AND bot_number = $2`,
    deleteChannelsByLinkAndBotNumber: `DELETE FROM channels WHERE link = $1 AND bot_number = $2`,
}

const getROI = async (pair, chainId, time) => {
    time = (time / 1000).toFixed(0);
    const now = Math.floor(new Date().getTime() / 1000);
    console.log('data params: ', pair, chainId, time)
    const pairs = await fetch(`https://api.dextools.io/v1/token?chain=${chainId == 1 ? 'ether' : 'bsc'}&address=${pair}&page=0&pageSize=20`, {
        headers: {
            'X-API-Key': TOOLS.DEXTOOLS_API_KEY
        }
    }).then(res => res.json());
    if (pairs.errorCode) {
        console.log(pairs)
        let data = await fetch(`https://dex-api-production.up.railway.app/v1/dex/candles/history/${pair}?from=${time}&to=${now}&interval=1S&chainId=${chainId}`).then((res) => res.json());
        console.log('data: ', data);
        if (data.error) return 'нет данных';

        data = data.history;
        let firstPrice = 1;
        let highPrice = 0;
        for (const i in data) {
            if (data[i].time >= time) {
                if (firstPrice == 1) firstPrice = data[i].open;
                if (data[i].open > highPrice) highPrice = data[i].open
            }
        }
        console.log('high price:', highPrice);
        console.log('open price:', firstPrice);
        const ROI = (highPrice / firstPrice).toFixed(2);
        console.log("ROI IN FUNC: ", ROI);
        return ROI;
    };
    let data = await fetch(`https://dex-api-production.up.railway.app/v1/dex/candles/history/${pairs?.data?.pairs[0]?.address}?from=${time}&to=${now}&interval=1S&chainId=${chainId}`).then((res) => res.json());
    console.log('data: ', data);
    if (data.error) return 'нет данных';

    data = data.history;
    let highPrice = 0;
    let firstPrice = 1;
    for (const i in data) {
        if (data[i].time >= time) {
            if (firstPrice == 1) firstPrice = data[i].open;
            if (data[i].open > highPrice) highPrice = data[i].open
        }
    }

    console.log('high price:', highPrice);
    console.log('open price:', firstPrice);

    const ROI = (highPrice / firstPrice).toFixed(2);
    console.log("ROI IN FUNC: ", ROI);
    return ROI;
}

const social_network = async (tokenAddress, chainId) => {
    const data = await fetch(`https://api.pinksale.finance/api/v1/pool/detail?chainId=${chainId}&tokenAddress=${tokenAddress}`).then(res => res.json());
    if (data.error || !data.poolDetails) {
        const pairs = await fetch(`https://api.dextools.io/v1/token?chain=${chainId == 1 ? 'ether' : 'bsc'}&address=${tokenAddress}&page=0&pageSize=20`, {
            headers: {
                'X-API-Key': TOOLS.DEXTOOLS_API_KEY
            }
        }).then(res => res.json());
        if (pairs.errorCode) {
            const data = await fetch(`https://dex-api-production.up.railway.app/v1/dex/pair/poolAddress/${tokenAddress}?chainId=${chainId}`).then(res => res.json());
            if (data?.error || !data?.pairs?.data?.baseTokenInfo) return null;
            const res = data?.pairs?.data?.baseTokenInfo;
            const resObj = { telegram: res?.telegram, twitter: res?.twitter, website: res?.website };
            console.log(resObj);
            return resObj;
        };
        const data = await fetch(`https://dex-api-production.up.railway.app/v1/dex/pair/poolAddress/${pairs?.data?.pairs[0]?.address}?chainId=${chainId}`).then(res => res.json());
        if (data?.error || !data?.pairs?.data?.baseTokenInfo) return null;
        const res = data?.pairs?.data?.baseTokenInfo;
        const resObj = { telegram: res?.telegram, twitter: res?.twitter, website: res?.website };
        console.log(resObj);
        return resObj;
    }
    const res = JSON.parse(data.poolDetails);
    delete res.a;
    delete res.h;
    const resObj = { website: res?.b, twitter: res?.d, github: res?.e, telegram: res?.f, sourceChat: res?.g, youtube: res?.s };
    console.log(resObj);
    return resObj;
}


module.exports = {
    TELEGRAM,
    TOOLS,
    QUERIES,
    getROI,
    social_network
}
