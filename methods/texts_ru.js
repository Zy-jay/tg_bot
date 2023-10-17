const { TELEGRAM, getROI, social_network } = require("../constants");
const { sleep } = require("../src/helpers/utils");

function formatDateToUTC(timestamp) {
    const date = new Date(parseInt(timestamp, 10));
    const options = {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
    };

    return date.toLocaleDateString("ru-RU", options);
}

function escapeHtmlEntities(userText) {
    return userText
        ? userText.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : undefined;
}

function addNumberSeparators(num) {
    // const formatted = parseInt(num).toLocaleString('en-US');
    // return formatted.replace(/,/g, '.');

    const target = parseInt(num);
    const amountSign = (() => {
        switch (true) {
            case target >= 1000000000:
                return "B";
            case target >= 1000000:
                return "M";
            case target >= 1000:
                return "K";
            default:
                return "";
        }
    })();

    if (target >= 1000000000) {
        const formatted = (target / 1000000000).toFixed(1);
        return formatted.replace(/\.0$/, "") + amountSign;
    } else if (target >= 1000000) {
        const formatted = (target / 1000000).toFixed(1);
        return formatted.replace(/\.0$/, "") + amountSign;
    } else if (target >= 100000) {
        const formatted = (target / 1000).toFixed(0);
        return formatted.replace(/\.0$/, "") + amountSign;
    } else if (target >= 1000) {
        const formatted = (target / 1000).toFixed(1);
        return formatted.replace(/\.0$/, "") + amountSign;
    }

    return target ? target.toString() : undefined;
}
function formatTotal(data) {
    const prelaunchCalls = data.filter((e) => e.prelaunch === true);

    data = data.filter((e) => e.prelaunch === false);

    function getFormattedDate(timestamp) {
        const date = new Date(parseInt(timestamp));
        const month = date
            .toLocaleString("ru-RU", { month: "short" })
            .toUpperCase();
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
        result,
    };
}

async function getTotalText(tokenInfo, channelsDetails, tgUrl, twitterUrl) {
    const formated = formatTotal(channelsDetails);

    const prelaunchText = `${formated.prelaunchCalls[0] ? "\n<b>ПРЕДСТАРТОВЫЕ ВЫЗОВЫ</b>" : ""
        }
${formated.prelaunchCalls
            .map((item, i) => {
                const result = [];
                for (let index = 0; index < item.length; index++) {
                    const e = item[index];
                    result.push(
                        `${index + 1}. <a href="https://t.me/${escapeHtmlEntities(
                            e.channelInnerLink
                        )}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(
                            e.channelTitle
                        )}</a>: ${new Date(parseInt(e.timestamp, 10)).toUTCString().split(" ")[4]
                        } \n`
                    );
                }
                return result;
            })
            .flat(Infinity)
            .join("")}`;

    const launched = await Promise.all(
        formated.result.map(async (item, i) => {
            const result = [];
            result.push(`<b>${item[0].date}</b> \n`);
            console.log(item);
            for (let index = 0; index < item.length; index++) {
                const elementNumber = formated.result
                    .flat(Infinity)
                    .findIndex(
                        (e) =>
                            e.channel_id + e.message_id ===
                            item[index].channel_id + item[index].message_id
                    );

                const e = item[index];
                console.log("e.timestamp: ", channelsDetails[0].timestamp);
                const currentROI = await getROI(
                    tokenInfo.address,
                    tokenInfo?.chain == "ether" ? 1 : 56,
                    e.timestamp
                );
                await sleep(2000);
                console.log("currentROI: ", currentROI);
                result.push(
                    `${elementNumber + 1}. <a href="https://t.me/${escapeHtmlEntities(
                        e.channelInnerLink
                    )}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(
                        e.channelTitle
                    )}</a>: ${new Date(parseInt(e.timestamp, 10)).toUTCString().split(" ")[4]
                    } | <b>ROI</b> ${currentROI == 0 || isNaN(currentROI) ? "🍀" : currentROI + "x"
                    }🔹\n`
                );
            }
            console.log(result);
            return result;
        })
    );

    const networks = await social_network(tokenInfo.address, tokenInfo.chain == 'ether' ? 1 : 56);
    console.log('networks: ', networks)
    let website = '';
    let tg = '';
    let twitter = '';
    let git = '';
    let schat = '';
    let youtube = '';
    if (networks) {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">💠Twitter</a>`;
        } else {
            twitter = networks?.twitter ? ` | <a href="${networks?.twitter}">💠Twitter</a>` : '';
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">💠Telegram</a>`;
        } else {
            tg = networks?.telegram ? ` | <a href="${networks?.telegram}">💠Telegram</a>` : '';
        }
        website = networks?.website ? `<a href="${networks?.website}">💠Сайт</a>` : '';
        git = networks?.github ? ` | <a href="${networks?.github}">💠Github</a>` : '';
        schat = networks?.sourceChat ? ` | <a href="${networks?.sourceChat}">💠SourceChat</a>` : '';
        youtube = networks?.youtube ? ` | <a href="${networks?.youtube}">💠Youtube</a>` : '';
    } else {
        twitter = ` | <a href="${twitterUrl ? twitterUrl : ''}">💠Twitter</a>`;
        tg = ` | <a href="${tgUrl ? tgUrl : ''}">💠Telegram</a>`;
    }
    const socialLinks = `${website}${tg}${twitter}${git}${schat}${youtube}`.trim();
    console.log('networks text ', socialLinks)

    return `<b>🟩ВСЕГО ЗАПРОСОВ </b> ${escapeHtmlEntities(
        tokenInfo.key_name
    )} - ${channelsDetails.length}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)} \n ${formated.prelaunchCalls[0] ? prelaunchText : ""
        } 
${formated.result[0] ? launched : "\n"}
CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> 
${socialLinks}
<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>
`;
}
async function getFirstCallText(
    tokenInfo,
    tokenDetailsForMessage,
    channelInnerLink,
    channelTitle,
    message, tgUrl, twitterUrl
) {
    const networks = await social_network(tokenInfo.address, tokenInfo.chain == 'ether' ? 1 : 56);
    console.log('networks: ', networks)
    let website = '';
    let tg = '';
    let twitter = '';
    let git = '';
    let schat = '';
    let youtube = '';
    if (networks) {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">💠Twitter</a>`;
        } else {
            twitter = networks?.twitter ? ` | <a href="${networks?.twitter}">💠Twitter</a>` : '';
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">💠Telegram</a>`;
        } else {
            tg = networks?.telegram ? ` | <a href="${networks?.telegram}">💠Telegram</a>` : '';
        }
        website = networks?.website ? `<a href="${networks?.website}">💠Сайт</a>` : '';
        git = networks?.github ? ` | <a href="${networks?.github}">💠Github</a>` : '';
        schat = networks?.sourceChat ? ` | <a href="${networks?.sourceChat}">💠SourceChat</a>` : '';
        youtube = networks?.youtube ? ` | <a href="${networks?.youtube}">💠Youtube</a>` : '';
    } else {
        twitter = ` | <a href="${twitterUrl ? twitterUrl : ''}">💠Twitter</a>`;
        tg = ` | <a href="${tgUrl ? tgUrl : ''}">💠Telegram</a>`;
    }
    const socialLinks = `${website}${tg}${twitter}${git}${schat}${youtube}`.trim();
    console.log('networks text ', socialLinks)
    return `<b>🟩ПЕРВЫЙ ЗАПРОС - </b> <a href="https://t.me/${escapeHtmlEntities(
        channelInnerLink
    )}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(
        channelTitle
    )}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || "нет данных"
        } | <b>объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || "нет данных"
        } | <b>Ликвидность:</b> ${addNumberSeparators(
            tokenDetailsForMessage?.liquidity
        )}
<b>Держатели:</b> ${tokenDetailsForMessage.holders
        } | <b>Отказ от владения:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> 
${socialLinks}
<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`;
}

async function getPreCallText(tokenInfo, channelInnerLink, channelTitle, message, tgUrl, twitterUrl) {
    const networks = await social_network(tokenInfo.address, tokenInfo.chain == 'ether' ? 1 : 56);
    console.log('networks: ', networks)
    let website = '';
    let tg = '';
    let twitter = '';
    let git = '';
    let schat = '';
    let youtube = '';
    if (networks) {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">💠Twitter</a>`;
        } else {
            twitter = networks?.twitter ? ` | <a href="${networks?.twitter}">💠Twitter</a>` : '';
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">💠Telegram</a>`;
        } else {
            tg = networks?.telegram ? ` | <a href="${networks?.telegram}">💠Telegram</a>` : '';
        }
        website = networks?.website ? `<a href="${networks?.website}">💠Сайт</a>` : '';
        git = networks?.github ? ` | <a href="${networks?.github}">💠Github</a>` : '';
        schat = networks?.sourceChat ? ` | <a href="${networks?.sourceChat}">💠SourceChat</a>` : '';
        youtube = networks?.youtube ? ` | <a href="${networks?.youtube}">💠Youtube</a>` : '';
    } else {
        twitter = ` | <a href="${twitterUrl ? twitterUrl : ''}">💠Twitter</a>`;
        tg = ` | <a href="${tgUrl ? tgUrl : ''}">💠Telegram</a>`;
    }
    const socialLinks = `${website}${tg}${twitter}${git}${schat}${youtube}`.trim();
    console.log('networks text ', socialLinks)
    return `<b>🟩ЗАПРОС ПЕРЕД ЗАПУСКОМ - </b> <a href="https://t.me/${escapeHtmlEntities(
        channelInnerLink
    )}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(
        channelTitle
    )}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}
ECA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> 
${socialLinks}
<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`;
}

async function getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails, tgUrl, twitterUrl) {
    const networks = await social_network(tokenInfo.address, tokenInfo.chain == 'ether' ? 1 : 56);
    console.log('networks: ', networks);
    let website = '';
    let tg = '';
    let twitter = '';
    let git = '';
    let schat = '';
    let youtube = '';
    if (networks) {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">💠Twitter</a>`;
        } else {
            twitter = networks?.twitter ? ` | <a href="${networks?.twitter}">💠Twitter</a>` : '';
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">💠Telegram</a>`;
        } else {
            tg = networks?.telegram ? ` | <a href="${networks?.telegram}">💠Telegram</a>` : '';
        }
        website = networks?.website ? `<a href="${networks?.website}">💠Сайт</a>` : '';
        git = networks?.github ? ` | <a href="${networks?.github}">💠Github</a>` : '';
        schat = networks?.sourceChat ? ` | <a href="${networks?.sourceChat}">💠SourceChat</a>` : '';
        youtube = networks?.youtube ? ` | <a href="${networks?.youtube}">💠Youtube</a>` : '';
    } else {
        twitter = ` | <a href="${twitterUrl ? twitterUrl : ''}">💠Twitter</a>`;
        tg = ` | <a href="${tgUrl ? tgUrl : ''}">💠Telegram</a>`;
    }
    const socialLinks = `${website}${tg}${twitter}${git}${schat}${youtube}`.trim();
    console.log('networks text: ', socialLinks)
    return (
        `<b>🟩НОВЫЙ ЗАПРОС -</b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> запрошено ${escapeHtmlEntities(tokenInfo.key_name)}

<b>ВСЕГО ЗАПРОСОВ -</b> ${channelsDetails.length} ${"♻️".repeat(
            channelsDetails.length
        )}

<b>Имя токена:</b> ${escapeHtmlEntities(tokenInfo.name)}

<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || "нет данных"
        } | <b>объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || "нет данных"
        } | <b>Ликвидность:</b> ${addNumberSeparators(
            tokenDetailsForMessage?.liquidity || 0
        )}
<b>Держатели:</b> ${tokenDetailsForMessage.holders
        } | <b>Отказ от владения:</b> ${tokenDetailsForMessage.renounced}

CA: <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a>
${socialLinks}

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>`)
}

function getTrendingText(tops, ROITops) {
    return `<b>🟢ВЫЗОВЫ В ТРЕНДЕ (LIVE)</b> 

${tops[0]
            ? tops
                .map(
                    (e, i) =>
                        `${i + 1}. <a href="https://dexscreener.com/${e.tokenData.chain === "ether" ? "ethereum" : "bsc"
                        }/${e.tokenData.address}">${escapeHtmlEntities(
                            e.tokenData.key_name
                        )}</a>♻️ <a href="https://t.me/${TELEGRAM.CHANNEL.split("@")[1]}/${e.tokenData.total_message_id
                        }">${e.count} Вызовы</a> \n`
                )
                .join("")
            : "[ там пока ничего нет ]"
        }

<b>🟢Top Calls Channels (Max ROI Daily)</b> 

${ROITops[0]
            ? ROITops.slice(0, 10)
                .map(
                    (e, i) =>
                        `${i + 1}. <a href="https://t.me/${escapeHtmlEntities(
                            e.link
                        )}">${escapeHtmlEntities(e.name)}</a>: <a href="https://t.me/${process.env.TELEGRAM_CHANNEL.split("@")[1]
                        }/${e.total_message_id}">Total Calls (${escapeHtmlEntities(
                            e.key_name
                        )})</a> <b>X${parseFloat(e.ROI.toFixed(2))}</b> 🔹\n`
                )
                .join("")
            : "[ тут пока ничего нет ]"
        }

<b>(За последние 24 часа)</b>

<b>Заходи в ${TELEGRAM.CHANNEL} чтобы узнавать о новых токенах первым</b>
`;
}

module.exports = {
    getTotalText,
    getFirstCallText,
    getUpdateText,
    getTrendingText,
    getPreCallText,
};
