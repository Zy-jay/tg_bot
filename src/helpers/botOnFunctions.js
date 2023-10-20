const { Markup } = require("telegraf");

const { getTrendingText } = require("../../methods/texts_ru");
const pool = require("../../methods/database.js");
const { TELEGRAM, QUERIES, getROI } = require("../../constants.js");
const { swapAccount, sleep } = require("./utils.js");

const add_account = async (ctx) => {
  try {
    const inputData = ctx.message.text
      .replace("/add_account\n", "")
      .split("\n");
    await pool.query(QUERIES.insertBackupBot, [
      inputData[1],
      inputData[2],
      inputData[3],
      inputData[0],
      false,
      TELEGRAM.BOT_NUMBER,
    ]);
    ctx.reply("Done!");
  } catch (error) {
    console.log(error);
  }
};

const parse_account = async (ctx, client) => {
  const allDialogs = await client.getDialogs();
  const allChannels = allDialogs.map((e) => ({
    title: e?.entity?.title || "Channel",
    id: parseInt(e?.entity?.id, 10),
    username: e?.entity?.username || parseInt(e?.entity?.id, 10),
  }));

  // select all channels from all bots to prevent duplicates
  const allChannelsInBase = (
    await pool.query(QUERIES.getChannelsInfo)
  ).rows.map((row) => parseInt(row.channel_id, 10));

  const filteredChannels = allChannels.filter(
    (e) => !allChannelsInBase.includes(e.id)
  );
  console.log(filteredChannels);

  await ctx.reply("wait...");
  for (const channel of filteredChannels) {
    console.log("added", channel);
    await pool.query(QUERIES.deleteChannelByChannelIdAndBotNumber, [
      channel?.id?.toString(),
      TELEGRAM.BOT_NUMBER,
    ]);

    await pool.query(QUERIES.insertChannel, [
      channel?.id?.toString(),
      `https://t.me/${channel?.username}`,
      TELEGRAM.BOT_NUMBER,
    ]);

    await pool.query(QUERIES.deleteChannelInfoByChannelId, [
      channel?.id?.toString(),
    ]);

    await pool.query(QUERIES.insertChannelInfo, [
      channel?.id?.toString(),
      channel?.username,
      channel?.title,
      +new Date() + 1000 * 60 * 60 * 24 * 7,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await ctx.reply("Done!");
};

const list_accounts = async (ctx) => {
  try {
    const accounts = (
      await pool.query(QUERIES.getBackupBotsByBotNumber, [TELEGRAM.BOT_NUMBER])
    ).rows;
    await ctx.reply(
      accounts
        .map((e) =>
          `
            --------------------
            
            <b>ID:</b> <code>${e.id}</code>
            <b>Proxy:</b> <code>${e.proxy}</code>
            <b>API_ID:</b> <code>${e.api_id}</code>
            <b>API_HASH:</b> <code>${e.api_hash}</code>
            <b>SESSION:</b> <code>${e.session}</code>
            <b>IS_CURRENT:</b> <code>${e.is_current || false}</code>

            --------------------
            `.replace(/                    /g, "")
        )
        .join("\n\n"),
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.log(error);
  }
};

const remove_account = async (ctx) => {
  try {
    const idToRemove = parseInt(
      ctx.message.text.replace("/remove_account ", ""),
      10
    );
    const isCurrent = (
      await pool.query(QUERIES.getBackupBotByIdAndBotNumber, [
        idToRemove,
        TELEGRAM.BOT_NUMBER,
      ])
    ).rows[0]?.is_current;

    if (isCurrent) {
      return ctx.reply("You can't remove current account");
    }

    await pool.query(QUERIES.deleteBackupBotByIdAndBotNumber, [
      idToRemove,
      TELEGRAM.BOT_NUMBER,
    ]);
    ctx.reply("Done!");
  } catch (error) {
    console.log(error);
  }
};

const swap_account = async (ctx) => {
  try {
    const idToSet = parseInt(
      ctx.message.text.replace("/swap_account ", ""),
      10
    );
    await swapAccount(idToSet, ctx);
  } catch (error) {
    console.log(error);
  }
};

const init_tops = async (ctx, bot) => {
  try {
    await ctx.reply("wait...");
    const currentTopsMessage = (await pool.query(QUERIES.getGeneralInfo))
      .rows[0]?.tops_message_id;
    console.log("tops_message:", currentTopsMessage);
    if (currentTopsMessage) {
      try {
        await bot.telegram
          .deleteMessage(TELEGRAM.CHANNEL, currentTopsMessage)
          .catch((err) => {
            console.log("----handled---");
            console.log(err);
            console.log("----------");
          });
      } catch (error) {
        console.log("----------HANDLED ERROR----------");
        console.log(error);
        console.log("----------HANDLED ERROR----------");
      }
    }
    console.log("getting tops...");
    const tops = await getTops();
    const ROITops = await getROITops();
    console.log("got tops");
    const messageData = await bot.telegram
      .sendMessage(TELEGRAM.CHANNEL, getTrendingText(tops, ROITops), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
          Markup.button.callback("🟢Live Trending🟢", "_blank"),
        ]),
      })
      .catch((err) => {
        console.log("----handled---");
        console.log(err);
        console.log("----------");
      });

    await bot.telegram
      .pinChatMessage(TELEGRAM.CHANNEL, messageData.message_id)
      .catch((err) => {
        console.log("----handled---");
        console.log(err);
        console.log("----------");
      });

    await pool.query(QUERIES.updateGeneralTopsMessageId, [
      messageData.message_id,
    ]);

    await ctx.reply("Done!");
  } catch (error) {
    console.log(error);
  }
};

const uninit_tops = async (ctx, bot) => {
  const currentTopsMessage = (await pool.query(QUERIES.getGeneralInfo)).rows[0]
    ?.tops_message_id;
  if (currentTopsMessage) {
    try {
      bot.telegram
        .deleteMessage(TELEGRAM.CHANNEL, currentTopsMessage)
        .catch((err) => {
          console.log("----handled---");
          console.log(err);
          console.log("----------");
        });
    } catch (error) {
      console.log("----------HANDLED ERROR----------");
      console.log(error);
      console.log("----------HANDLED ERROR----------");
    }
  }

  await ctx.reply("Done!");
};

const list = async (ctx) => {
  try {
    const allChannels = (
      await pool.query(QUERIES.getChannelsByBotNumber, [TELEGRAM.BOT_NUMBER])
    ).rows;
    const messageString =
      allChannels
        .map((e, i) => `${i + 1}. ` + e.link)
        .filter((e) => e)
        .join("\n") || "No channels";
    let max_size = 4000;
    let amountSliced = messageString.length / max_size;
    let start = 0;
    let end = max_size;
    for (let i = 0; i < amountSliced; i++) {
      message = messageString.slice(start, end);
      start = start + max_size;
      end = end + max_size;
      await ctx.reply(message);
    }
  } catch (error) {
    console.log(error);
  }
};

const remove_channels = async (ctx) => {
  try {
    const channels = ctx.message.text
      .replace("/remove_channels\n", "")
      .split("\n");
    console.log("call");
    for (const channel of channels) {
      await pool.query(QUERIES.deleteChannelsByLinkAndBotNumber, [
        channel,
        TELEGRAM.BOT_NUMBER,
      ]);
    }

    await ctx.reply("Done!");
  } catch (error) {
    console.log(error);
  }
};

// return 10 calls with best ROI for last 24 hours
async function getTops() {
  const calls24 = (
    await pool.query(QUERIES.getCallDetailsSinceTimestamp, [
      +new Date() - 1000 * 60 * 60 * 24,
    ])
  ).rows;

  for (const iterator of calls24) {
    iterator.tokenData = {
      ...iterator,
    };
  }

  const counted = calls24
    .reduce((acc, cur) => {
      if (acc.every((e) => e.tokenData.address !== cur.tokenData.address)) {
        acc.push({
          ...cur,
          count: 1,
        });
      } else {
        acc.find((e) => e.tokenData.address === cur.tokenData.address).count++;
      }

      return acc;
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  console.log("last call", calls24[calls24.length - 1]);

  return counted;
}

async function getROITops() {
  const calls24 = (
    await pool.query(QUERIES.getCallDetailsByTimestamp, [
      +new Date() - 1000 * 60 * 60 * 24,
    ])
  ).rows;
  console.log("calls24: ", calls24);

  const sortedByTokens = calls24.reduce((acc, cur) => {
    const existingArrayIndex = acc.findIndex(
      (subarray) => subarray[0]?.address === cur.address
    );

    if (existingArrayIndex === -1) {
      acc.push([cur]);
    } else {
      acc[existingArrayIndex].push(cur);
    }

    return acc;
  }, []);

  console.log("sorted by tokens: ", sortedByTokens);

  for (const tokens of sortedByTokens) {
    tokens.sort(
      (a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10)
    );
  }

  const tokensInfo = (await pool.query(`SELECT * FROM tokens`)).rows;
  console.log("tokensInfo: ", tokensInfo);
  const result = [];
  await sortedByTokens.map(async (calls) => {
    for (let index = 0; index < calls.length - 1; index++) {
      const call = calls[index];

      const maxMarketCup = calls
        .slice(index + 1, calls.length)
        .reduce((acc, cur) => {
          if (parseInt(cur.market_cap, 10) > acc) {
            return parseInt(cur.market_cap, 10);
          } else {
            return acc;
          }
        }, 0);

      call.maxMarketCupTest = maxMarketCup;

      const token = tokensInfo.find((token) => token.id == call.token_id);
      //   console.log(token);
      if (!token) {
        console.log("Токен не найден в БД, token_id= " + call.token_id);
        continue;
      }
      const roi = await getROI(
        token?.address,
        call?.chain === "bsc" ? 56 : 1,
        call?.timestamp
      );
      console.log(roi);
      if (roi || roi !== NaN) {
        call.ROI = roi;
        await sleep(500, call.ROI + " : " + roi);
      } else {
        continue;
      }
      //   console.log(call.ROI);

      result.push(call);
    }
    // console.log("result: ", result);

    // return call;
  });

  const flatRois = result
    .flat(Infinity)
    .filter((e) => e.ROI !== Infinity || e.ROI !== NaN || e.ROI !== undefined);
  console.log("flatRois: ", flatRois);

  const topROI = flatRois.sort((a, b) => b.ROI - a.ROI).slice(0, 10);
  console.log("top ROI: ", topROI);

  return topROI;
}

module.exports = {
  add_account,
  parse_account,
  list_accounts,
  remove_account,
  swap_account,
  init_tops,
  uninit_tops,
  list,
  remove_channels,
  getTops,
  getROITops,
};
