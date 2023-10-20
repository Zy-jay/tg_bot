const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Telegraf } = require("telegraf");
const { Markup } = require("telegraf");
const express = require("express");

const pool = require("../methods/database.js");
const { TELEGRAM, QUERIES } = require("../constants.js");
const callJoin = require("./helpers/callJoinFunction.js");
const pythonHandler = require("./helpers/pythonUtils.js");
const eventPrint = require("./helpers/eventPrintFunction.js");

const { getTrendingText } = require("../methods/texts_ru.js");
const {
  add_account,
  list_accounts,
  remove_account,
  swap_account,
  uninit_tops,
  list,
  remove_channels,
  getROITops,
  getTops,
} = require("./helpers/botOnFunctions.js");
const { sleep } = require("./helpers/utils.js");

const app = express();

const Main = async () => {
  let botWorking = false;
  let updateTopsInterval = undefined;
  const topsInterval = 3 * 60 * 1000;
  const bot = new Telegraf(TELEGRAM.BOT_TOKEN, {
    handlerTimeout: Infinity,
  });

  const currentBotData = (
    await pool.query(QUERIES.getBackupBotsByIsCurrentAndBotNumber, [
      true,
      TELEGRAM.BOT_NUMBER,
    ])
  ).rows[0];
  const stringSession = new StringSession(currentBotData.session);

  const client = new TelegramClient(
    stringSession,
    currentBotData.api_id,
    currentBotData.api_hash,
    {
      connectionRetries: 10,
      autoReconnect: true,
    }
  );

  let handlerBusy = false;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.post("/", async (req, res) => {
    res.send("ok");
    console.log(req.body);

    const data = req.body;

    try {
      const event = data;

      while (handlerBusy) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      handlerBusy = true;
      console.log("set handler busy");
      try {
        await eventPrint(
          {
            message: event,
          },
          bot
        );
      } catch (error) {
        console.log(error);
      }

      handlerBusy = false;
      console.log("release handler");
    } catch (error) {
      console.log(error);
    }
  });

  app.listen(3010);

  let python = pythonHandler(currentBotData);

  async function killPython() {
    python.kill();
    await client.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async function reloadPython() {
    await client.destroy();
    python = pythonHandler(currentBotData);
  }

  async function updateTops() {
    console.log("getting tops...");
    const tops = await getTops();
    const ROITops = await getROITops();
    console.log("got tops", ROITops);
    await sleep(5000, "updateTops sleep");
    const topsMessage = (await pool.query(QUERIES.getGeneralInfo)).rows[0]
      ?.tops_message_id;
    console.log("tops messages:", topsMessage);
    if (topsMessage) {
      await bot.telegram
        .editMessageText(
          TELEGRAM.CHANNEL,
          topsMessage,
          undefined,
          getTrendingText(tops, await ROITops),
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
              Markup.button.callback("🟢Live Trending🟢", "_blank"),
            ]),
          }
        )
        .catch((err) => console.log(err));
    } else {
      try {
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
      } catch (error) {
        console.log(error);
      }
    }
  }


  bot.on("message", async (ctx) => {
    console.log(botWorking);
    if (
      !JSON.parse(TELEGRAM.ADMINS).includes(ctx.message.from.id) ||
      !botWorking
    )
      return;

    if (ctx?.message?.text?.includes("/add_account\n")) {
      await add_account(ctx);
    }

    if (ctx?.message?.text === "/parse_account") {
      await killPython();
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
      reloadPython();
    }

    if (ctx?.message?.text === "/list_accounts") {
      await list_accounts(ctx);
    }

    if (ctx?.message?.text?.includes("/remove_account ")) {
      await remove_account(ctx);
    }

    if (ctx?.message?.text?.includes("/swap_account ")) {
      await swap_account(ctx);
    }

    if (ctx?.message?.text === "/init_tops") {
      if (updateTopsInterval) {
        clearInterval(updateTopsInterval);
      }
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
        setTimeout(() => {
          updateTopsInterval = setInterval(updateTops, topsInterval);
        }, topsInterval);
      } catch (error) {
        console.log(error);
      }
    }

    if (ctx?.message?.text === "/uninit_tops") {
      if (updateTopsInterval) {
        clearInterval(updateTopsInterval);
      }
      await uninit_tops(ctx, bot);
    }

    if (ctx?.message?.text === "/list") {
      await list(ctx);
    }

    if (ctx?.message?.text?.includes("/remove_channels\n")) {
      await remove_channels(ctx);
    }

    if (ctx?.message?.text?.includes("/add_channels_for_one ")) {
      const botId = parseInt(
        ctx.message.text.split("/add_channels_for_one ")[1].split("\n")[0],
        10
      );
      const channels = ctx.message.text
        .replace(`/add_channels_for_one ${botId}\n`, "")
        .split("\n");
      await callJoin(ctx, botId, channels, client);
    }
  });
  bot.launch();
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  await new Promise((r) => setTimeout(r, 2000));
  botWorking = true;
};

module.exports = Main;
