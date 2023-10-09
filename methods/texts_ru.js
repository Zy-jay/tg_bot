const { TELEGRAM } = require('../constants');

function formatDateToUTC(timestamp) {
    const date = new Date(parseInt(timestamp, 10));
    const options = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC'
    };

    return date.toLocaleDateString('ru-RU', options);
}

function escapeHtmlEntities(userText) {
    return userText.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addNumberSeparators(num) {
    const formatted = parseInt(num).toLocaleString('ru-RU');
    return formatted.replace(/,/g, '.');
}
function formatTotal(data) {

    const prelaunchCalls = data.filter(e => e.prelaunch === true);

    data = data.filter(e => e.prelaunch === false);

    function getFormattedDate(timestamp) {
        const date = new Date(parseInt(timestamp));
        const month = date.toLocaleString('ru-RU', { month: 'short' }).toUpperCase();
        const day = date.getDate();
        return `${day} ${month}`;
    }

    // Group the data by date
    const groupedData = data.reduce((acc, item) => {
        const dateKey = getFormattedDate(item.timestamp);

        if (!acc[dateKey]) {
            acc[dateKey] = [];
        }

        // Add the date to the item
        item.date = dateKey;
        acc[dateKey].push(item);

        return acc;
    }, {});

    // Convert the grouped data to an array
    const result = Object.values(groupedData);

    return {
        prelaunchCalls: prelaunchCalls.length ? [prelaunchCalls] : [],
        result
    };
}

function getTotalText(tokenInfo, channelsDetails) {
    const formated = formatTotal(channelsDetails);

    const prelaunchText =
        `${formated.prelaunchCalls[0] ? '\n<b>ПРЕДСТАРТОВЫЕ ВЫЗОВЫ</b>' : ''}
${formated.prelaunchCalls.map((item, i) => {
            const result = [];
            for (let index = 0; index < item.length; index++) {
                const e = item[index];
                const currentROI = e.ROI > 1 && e.ROI !== Infinity ? ('X' + parseFloat(e.ROI.toFixed(2))) : (e.ROI && e.ROI !== Infinity ? ('-' + parseFloat(((1 - e.ROI) * 100).toFixed(2)) + '%') : 'нет данных');
                result.push(`${index + 1}. <a href="https://t.me/${escapeHtmlEntities(e.channelInnerLink)}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(e.channelTitle)}</a>: ${(new Date(parseInt(e.timestamp, 10))).toUTCString().split(' ')[4]} \n`);

            }
            return result;
        }).flat(Infinity).join('')}`;

    const launched = formated.result.map((item, i) => {
        const result = [];
        result.push(`<b>${item[0].date}</b> \n`);
        for (let index = 0; index < item.length; index++) {
            const elementNumber = formated.result.flat(Infinity).findIndex(e => e.channel_id + e.message_id === item[index].channel_id + item[index].message_id);

            const e = item[index];
            const currentROI = e.ROI > 1 && e.ROI !== Infinity ? ('X' + parseFloat(e.ROI.toFixed(2))) : (e.ROI && e.ROI !== Infinity ? ('-' + parseFloat(((1 - e.ROI) * 100).toFixed(2)) + '%') : 'нет данных');

            result.push(`${elementNumber + 1}. <a href="https://t.me/${escapeHtmlEntities(e.channelInnerLink)}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(e.channelTitle)}</a>: ${(new Date(parseInt(e.timestamp, 10))).toUTCString().split(' ')[4]} | <b>ROI</b> ${currentROI} 🔹\n`);

        }
        return result;
    }).flat(Infinity).join('');

    return (
        `<b>🟩ВСЕГО ЗАПРОСОВ </b> ${escapeHtmlEntities(tokenInfo.key_name)} - ${channelsDetails.length}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)} \n ${formated.prelaunchCalls[0] ? prelaunchText : ''} 
${formated.result[0] ? launched : '\n'}
CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>
`
    );
}
function getFirstCallText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message) {
    return (
        `<b>🟩ПЕРВЫЙ ЗАПРОС - </b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || 'нет данных'} | <b>объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || 'нет данных'} | <b>Ликвидность:</b> ${addNumberSeparators(tokenDetailsForMessage?.liquidity)}
<b>Держатели:</b> ${tokenDetailsForMessage.holders} | <b>Отказ от владения:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`
    );
}

function getPreCallText(tokenInfo, channelInnerLink, channelTitle, message) {
    return (
        `<b>🟩ЗАПРОС ПЕРЕД ЗАПУСКОМ - </b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}
ECA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`
    );
}

function getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails) {
    return (
        `<b>🟩НОВЫЙ ЗАПРОС -</b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>ВСЕГО ЗАПРОСОВ -</b> ${channelsDetails.length} ${'♻️'.repeat(channelsDetails.length)}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || 'нет данных'} | <b>объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || 'нет данных'} | <b>Ликвидность:</b> ${addNumberSeparators(tokenDetailsForMessage?.liquidity || 0)}
<b>Держатели:</b> ${tokenDetailsForMessage.holders} | <b>Отказ от владения:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`
    );
}

function getTrendingText(tops, ROITops) {
    return (
        `<b>🟢ВЫЗОВЫ В ТРЕНДЕ (LIVE)</b> 

${tops[0] ? tops.map((e, i) => (
            `${i + 1}. <a href="https://dexscreener.com/${e.tokenData.chain === 'ether' ? 'ethereum' : 'bsc'}/${e.tokenData.address}">${escapeHtmlEntities(e.tokenData.key_name)}</a>♻️ <a href="https://t.me/${TELEGRAM.CHANNEL.split('@')[1]}/${e.tokenData.total_message_id}">${e.count} Вызовы</a> \n`
        )).join('') : '[ там пока ничего нет ]'}

<b>🟢Top Calls Channels (Max ROI Daily)</b> 

${ROITops[0] ? ROITops.slice(0, 5).map((e, i) => (
            `${i + 1}. <a href="https://t.me/${escapeHtmlEntities(e.link)}">${escapeHtmlEntities(e.name)}</a>: <a href="https://t.me/${TELEGRAM.CHANNEL.split('@')[1]}/${e.total_message_id}">Всего запросов (${escapeHtmlEntities(e.key_name)})</a> <b>X${parseFloat(e.ROI.toFixed(2))}</b> 🔹\n`
        )).join('') : '[ там пока ничего нет ]'}

<b>(За последние 24 часа)</b>

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>
`);
}


module.exports = {
    getTotalText,
    getFirstCallText,
    getUpdateText,
    getTrendingText,
    getPreCallText
};