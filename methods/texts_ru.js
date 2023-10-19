const { TELEGRAM, getROI, social_network } = require("../constants");
const { sleep } = require("../src/helpers/utils");
const pool = require('./database');

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
    const prelaunchText = `${formated.prelaunchCalls[0] ? "\n<b>PRELAUNCH CALL</b>" : ""
        }
${formated.prelaunchCalls
            .map((item, i) => {
                const result = [];
                for (let index = 0; index < item.length; index++) {
                    const e = item[index];
                    let res = `${index + 1}. <a href="https://t.me/${escapeHtmlEntities(
                        e.channelInnerLink
                    )}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(
                        e.channelTitle
                    )}</a>: ${new Date(parseInt(e.timestamp, 10)).toUTCString().split(" ")[4]
                        } \n`
                    if (res[0] == ',') {
                        res = res.slice(1)
                    }
                    result.push(res);
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
                const res = `${elementNumber + 1}. <a href="https://t.me/${escapeHtmlEntities(
                    e.channelInnerLink
                )}/${escapeHtmlEntities(e.message_id)}">${escapeHtmlEntities(
                    e.channelTitle
                )}</a>: ${new Date(parseInt(e.timestamp, 10)).toUTCString().split(" ")[4]
                    } | <b>Профит</b> ${currentROI == 0 || isNaN(currentROI) ? "🍀" : parseFloat(currentROI) >= 1 ? currentROI + 'x' : '-' + (1 - parseFloat(currentROI) * 100) + '%' 
                    }🔹\n`
                if (res[0] == ',') {
                    res = res.slice(1);
                }
                result.push(res);
            }
            console.log(result);
            return result.join('');
        })
    );

    const networks = await social_network(tokenInfo.address, tokenInfo.chain == 'ether' ? 1 : 56);
    let website = '';
    let tg = '';
    let twitter = '';
    let git = '';
    let schat = '';
    let youtube = '';
    if (networks) {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">Twitter</a>`;
        } else {
            twitter = networks?.twitter ? ` | <a href="${networks?.twitter}">Twitter</a>` : '';
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">Telegram</a>`;
        } else {
            tg = networks?.telegram ? ` | <a href="${networks?.telegram}">Telegram</a>` : '';
        }
        website = networks?.website ? `<a href="${networks?.website}">Сайт</a>` : '';
        git = networks?.github ? ` | <a href="${networks?.github}">💠Github</a>` : '';
        schat = networks?.sourceChat ? ` | <a href="${networks?.sourceChat}">SourceChat</a>` : '';
        youtube = networks?.youtube ? ` | <a href="${networks?.youtube}">Youtube</a>` : '';
    } else {
        if (twitterUrl) {
            twitter = ` | <a href="${twitterUrl}">Twitter</a>`;
        }
        if (tgUrl) {
            tg = ` | <a href="${tgUrl}">Telegram</a>`;
        }
    }

    console.log('-----------------formated result', formated.result[0]);
    console.log('-----------------launched', launched)
    const db_networks = await pool.query(`SELECT * FROM networks WHERE token_address = $1`, [tokenInfo.address])?.rows;
    if (!db_networks?.token_address) {
        try {
            await pool.query(`INSERT INTO networks (token_address, twitter, telegram) VALUES ($1, $2, $3)`, [tokenInfo.address, twitterUrl, tgUrl]);
        } catch (e) {
            if (db_networks?.twitter) {
                twitter = ` | <a href="${db_networks?.twitter}">Twitter</a>`;
            } else {
                if (twitterUrl) {
                    await pool.query(`UPDATE networks SET twitter = $2 WHERE token_address = $1`, [tokenInfo.address, twitterUrl]);
                }
            }
            if (db_networks?.telegram) {
                tg = ` | <a href="${db_networks?.telegram}">Telegram</a>`;
            } else {
                if (tgUrl) {
                    await pool.query(`UPDATE networks SET telegram = $2 WHERE token_address = $1`, [tokenInfo.address, tgUrl]);
                }
            }
        }
    } else {
        if (db_networks?.twitter) {
            twitter = ` | <a href="${db_networks?.twitter}">Twitter</a>`;
        } else {
            if (twitterUrl) {
                await pool.query(`UPDATE networks SET twitter = $2 WHERE token_address = $1`, [tokenInfo.address, twitterUrl]);
            }
        }
        if (db_networks?.telegram) {
            tg = ` | <a href="${db_networks?.telegram}">Telegram</a>`;
        } else {
            if (tgUrl) {
                await pool.query(`UPDATE networks SET telegram = $2 WHERE token_address = $1`, [tokenInfo.address, tgUrl]);
            }
        }
    }

    let socialLinks = `${website}${tg}${twitter}${git}${schat}${youtube}`.trim();
    if (socialLinks[0] == '|') {
        socialLinks = socialLinks.slice(1);
    }
    console.log('networks text ', socialLinks)

    return `<b>🟩TOTAL CALLS </b> ${escapeHtmlEntities(tokenInfo.key_name)} - ${channelsDetails.length}

<b>◽Название Токена:</b> ${escapeHtmlEntities(tokenInfo.name)} \n ${formated.prelaunchCalls[0] ? prelaunchText : "" 
        }
${formated.result[0] ? launched : "\n"}
<b>Адрес Токена:</b> <code href="#">${tokenInfo.address}</code>

${socialLinks ? '<b>📱Соц.сети проекта: </b>' + socialLinks : ''}

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> \n
<b>Подпишись на ${TELEGRAM.CHANNEL} чтобы первым найти перспективные токены</b>
`;
}
async function getFirstCallText(
    tokenInfo,
    tokenDetailsForMessage,
    channelInnerLink,
    channelTitle,
    message
) {
    return `<b>🟩FIRST CALL - </b> <a href="https://t.me/${escapeHtmlEntities(
        channelInnerLink
    )}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(
        channelTitle
    )}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>◽Название токена:</b> ${escapeHtmlEntities(tokenInfo.name)} \n
<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || "нет данных"
        } | <b>Объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || "нет данных"
        } | <b>Ликвидность:</b> ${addNumberSeparators(
            tokenDetailsForMessage?.liquidity
        )}
<b>Держатели:</b> ${tokenDetailsForMessage.holders
        } | <b>Отказ от контракта:</b> ${tokenDetailsForMessage.renounced ? 'да' : 'нет'}

<b>Адрес Токена:</b> <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> \n
<b>Подпишись на ${TELEGRAM.CHANNEL} чтобы первым найти перспективные токены</b>`;
}

async function getPreCallText(tokenInfo, channelInnerLink, channelTitle, message) {
    return `<b>🟩PRELAUNCH CALL - </b> <a href="https://t.me/${escapeHtmlEntities(
        channelInnerLink
    )}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(
        channelTitle
    )}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>◽Название Токена: </b> ${escapeHtmlEntities(tokenInfo.name)} \n
<b>Адрес Токена:</b> <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> \n
<b>Подпишись на ${TELEGRAM.CHANNEL} чтобы первым найти перспективные токены</b>`;
}

async function getUpdateText(tokenInfo, tokenDetailsForMessage, channelInnerLink, channelTitle, message, channelsDetails) {
    return (
        `<b>🟩NEW CALL -</b> <a href="https://t.me/${escapeHtmlEntities(channelInnerLink)}/${escapeHtmlEntities(message.id)}">${escapeHtmlEntities(channelTitle)}</a> called ${escapeHtmlEntities(tokenInfo.key_name)}

<b>TOTAL CALLS -</b> ${channelsDetails.length} ${"♻️".repeat(
            channelsDetails.length
        )}

<b>◽Название Токена:</b> ${escapeHtmlEntities(tokenInfo.name)} \n

<b>Капитализация:</b> ${addNumberSeparators(tokenInfo?.market_cap || 0) || "нет данных"
        } | <b>Объем за 24 часа:</b> ${addNumberSeparators(tokenDetailsForMessage.volume24) || "нет данных"
        } | <b>Ликвидность:</b> ${addNumberSeparators(
            tokenDetailsForMessage?.liquidity || 0
        )}
<b>Держатели:</b> ${tokenDetailsForMessage.holders
        } | <b>Отказ от контракта:</b> ${tokenDetailsForMessage.renounced ? 'да' : 'нет'}

<b>Адрес Токена:</b> <code href="#">${tokenInfo.address}</code>

<a href="https://www.dextools.io/app/en/${tokenInfo.chain === "ether" ? "ether" : "bnb"
        }/pair-explorer/${tokenInfo.address
        }">💠Dextools</a> | <a href="https://www.dexview.com/${tokenInfo.chain === "ether" ? "eth" : "bsc"
        }/${tokenInfo.address}">💠Dexview</a> | <a href="https://dexscreener.com/${tokenInfo.chain === "ether" ? "ethereum" : "bsc"
        }/${tokenInfo.address}">💠Dexscreener</a> | <a href="https://ave.ai/token/${tokenInfo.address
        }-${tokenInfo.chain === "ether" ? "eth" : "bsc"}">💠Ave</a> \n

<b>Подпишись на ${TELEGRAM.CHANNEL} чтобы первым найти перспективные токены</b>`)
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
