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

    return date.toLocaleDateString('en-US', options);
}

function escapeHtmlEntities(userText) {
    return userText.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addNumberSeparators(num) {
    const formatted = parseInt(num).toLocaleString('en-US');
    return formatted.replace(/,/g, '.');
}
function formatTotal(data) {

    const prelaunchCalls = data.filter(e => e.prelaunch === true);

    data = data.filter(e => e.prelaunch === false);

    function getFormattedDate(timestamp) {
        const date = new Date(parseInt(timestamp));
        const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
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
`${formated.prelaunchCalls[0] ? '\n<b>PRELAUNCH CALLS</b>' : ''}
${formated.prelaunchCalls.map((item, i) => {
const result = [];
for (let index = 0; index < item.length; index++) {
    const e = item[index];
    const currentROI = e.ROI > 1 && e.ROI !== Infinity ? ('X' + parseFloat(e.ROI.toFixed(2))) : (e.ROI && e.ROI !== Infinity ? ('-' + parseFloat(((1-e.ROI)*100).toFixed(2)) + '%') : 'no data');
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
        const currentROI = e.ROI > 1 && e.ROI !== Infinity ? ('X' + parseFloat(e.ROI.toFixed(2))) : (e.ROI && e.ROI !== Infinity ? ('-' + parseFloat(((1-e.ROI)*100).toFixed(2)) + '%') : 'no data');

        result.push(`${elementNumber+1}. <a href="https://t.me/${escapeHtmlEntities(e.channelInnerLink)}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(e.channelTitle)}</a>: ${(new Date(parseInt(e.timestamp, 10))).toUTCString().split(' ')[4]} | <b>ROI</b> ${currentROI} 🔹\n`);
  
    }
    return result;
}).flat(Infinity).join('');

    return (
`<b>🟩TOTAL CALLS </b> ${escapeHtmlEntities(tokenInfo.key_name)} - ${channelsDetails.length}

<b>Token Name:</b> ${escapeHtmlEntities(tokenInfo.name)} \n ${formated.prelaunchCalls[0] ? prelaunchText : ''} 
${formated.result[0] ? launched : '\n'}
CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Join ${process.env.TELEGRAM_CHANNEL} to be an early bird in every gem</b>
`
    );
}
function getFirstCallText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message) {
    return (
`<b>🟩FIRST CALL - </b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Token Name:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>MCap:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || 'no data'} | <b>Vol 24h:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24)  || 'no data'} | <b>Liq:</b> ${addNumberSeparators(tokenDetailsForMessage?.liquidity)}
<b>Holders:</b> ${tokenDetailsForMessage.holders} | <b>Renaunced:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Join ${process.env.TELEGRAM_CHANNEL} to be an early bird in every gem</b>`
    );
}

function getPreCallText(tokenInfo, channelInnerLink, channelTitle, message) {
    return (
`<b>🟩PRELAUNCH CALL - </b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Token Name:</b> ${escapeHtmlEntities(tokenInfo.name)}
ECA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Join ${process.env.TELEGRAM_CHANNEL} to be an early bird in every gem</b>`
    );
}

function getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails) {
    return (
`<b>🟩NEW CALL -</b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>TOTAL CALLS -</b> ${channelsDetails.length} ${'♻️'.repeat(channelsDetails.length)}

<b>Token Name:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>MCap:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || 'no data'} | <b>Vol 24h:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24)  || 'no data'} | <b>Liq:</b> ${addNumberSeparators(tokenDetailsForMessage?.liquidity || 0)}
<b>Holders:</b> ${tokenDetailsForMessage.holders} | <b>Renaunced:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === 'ether' ? 'ether' : 'bnb'}/pair-explorer/${tokenInfo.address}">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === 'ether' ? 'ethereum' : 'bsc'}/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address}-${tokenInfo.chain === 'ether' ? 'eth' : 'bsc'}">💠Ave</a> 

<b>Join ${process.env.TELEGRAM_CHANNEL} to be an early bird in every gem</b>`
    );
}

function getTrendingText(tops, ROITops) {
    return (
`<b>🟢CALL TRENDING (LIVE)</b> 

${tops[0] ? tops.map((e, i) => (
    `${i + 1}. <a href="https://dexscreener.com/${e.tokenData.chain === 'ether' ? 'ethereum' : 'bsc'}/${e.tokenData.address}">${escapeHtmlEntities(e.tokenData.key_name)}</a>♻️ <a href="https://t.me/${process.env.TELEGRAM_CHANNEL.split('@')[1]}/${e.tokenData.total_message_id}">${e.count} Calls</a> \n`
)).join('') : '[ nothing there yet ]'}

<b>🟢Top Calls Channels (Max ROI Daily)</b> 

${ROITops[0] ? ROITops.slice(0, 5).map((e, i) => (
    `${i + 1}. <a href="https://t.me/${escapeHtmlEntities(e.link)}">${escapeHtmlEntities(e.name)}</a>: <a href="https://t.me/${process.env.TELEGRAM_CHANNEL.split('@')[1]}/${e.total_message_id}">Total Calls (${escapeHtmlEntities(e.key_name)})</a> <b>X${parseFloat(e.ROI.toFixed(2))}</b> 🔹\n`
)).join('') : '[ nothing there yet ]'}

<b>(Last 24 hours)</b>

<b>Join ${process.env.TELEGRAM_CHANNEL} to be an early bird in every gem</b>
`);
}


module.exports = {
    getTotalText,
    getFirstCallText,
    getUpdateText,
    getTrendingText,
    getPreCallText
};