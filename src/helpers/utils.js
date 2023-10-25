const { TELEGRAM, TOOLS, QUERIES } = require("../../constants.js");

const fetch = require("node-fetch");
const pool = require("../../methods/database.js");
const { exec } = require("child_process");
const { EXCEPTION_TOKENS } = require("../../constants.js");

async function getTokenData(poolAddress) {
  // chaniID doesn't matter in this request
  let pair = await fetch(
    `https://dex-api-production.up.railway.app/v1/dex/pair/search/${poolAddress}?chainId=1`
  )
    .then((r) => r.json())
    .then((r) => r?.pairs?.data[0] || r?.pairs?.data)
    .catch((error) => {
      console.log(error);
      return null;
    });

  console.log(pair);

  if (!pair) {
    pair = await fetch(
      `https://dex-api-production.up.railway.app/v1/dex/pair/search/${poolAddress}?chainId=56`
    )
      .then((r) => r.json())
      .then((r) => r?.pairs?.data[0] || r?.pairs?.data)
      .catch((error) => {
        console.log(error);
        return null;
      });
    if (!pair) {
      console.log("no pairs found");
      return null;
    }
  }

  const tokenData = await fetch(
    `https://dex-api-production.up.railway.app/v1/dex/pair/poolAddress/${pair?.address}?chainId=${pair?.chainId}`
  )
    .then((r) => r.json())
    .then((r) => r?.pairs?.data[0] || r?.pairs?.data)
    .catch((error) => {
      console.log(error);
      return null;
    });

  return tokenData || pair;
}

function reloadScript() {
  exec(`pm2 restart ${TOOLS.PM2_NAME}`, (error, stdout, stderr) => {
    console.log("stdout: " + stdout);
    console.log("stderr: " + stderr);
    if (error !== null) {
      console.log("exec error: " + error);
    }
  });
}

async function swapAccount(idToSet, ctx) {
  await pool.query(QUERIES.updateBackupBotCurrentStatusToFalse, [
    TELEGRAM.BOT_NUMBER,
  ]);
  await pool.query(QUERIES.updateBackupBotCurrentStatusToTrue, [
    idToSet,
    TELEGRAM.BOT_NUMBER,
  ]);

  if (ctx) {
    ctx.reply("Done! Bot will be restarted in 2 seconds");
  }

  reloadScript();
}

async function swapToNextAccount(bot) {
  const currentAccount = (
    await pool.query(QUERIES.getBackupBotsByIsCurrentAndBotNumber, [
      true,
      TELEGRAM.BOT_NUMBER,
    ])
  ).rows[0];
  const nextAccounts = (
    await pool.query(QUERIES.getBackupBotsByIdAndBotNumber, [
      currentAccount.id,
      TELEGRAM.BOT_NUMBER,
    ])
  ).rows;
  for (const admin of JSON.parse(TELEGRAM.ADMINS)) {
    try {
      if (nextAccounts[0]) {
        await bot.telegram.sendMessage(
          admin,
          `Bot #${currentAccount.id} banned, switching to bot #${nextAccounts[0].id}`
        );
      } else {
        await bot.telegram.sendMessage(
          admin,
          `Bot #${currentAccount.id} banned, AND IT WAS LAST BOT !!!`
        );
      }
    } catch (error) {
      console.log(error);
    }
  }

  if (nextAccounts[0]) {
    return swapAccount(nextAccounts[0].id);
  }
}

const sleep = async (ms, msg) => {
  if (msg) {
    console.log(msg !== true ? msg : `Timout ${ms / 1000} sec...`);
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
function checkAddress(address) {
  if (!address || address.length !== 42 || address.substring(0, 2) !== "0x") {
    return false;
  } else {
    return true;
  }
}
function checkAddrIsBlackList(address) {
  if (!checkAddress(address)) {
    return true;
  }
  return EXCEPTION_TOKENS.find(
    (address) => address.toLowerCase() === iterator.toLowerCase()
  )
    ? true
    : false;
}

module.exports = {
  getTokenData,
  reloadScript,
  swapAccount,
  swapToNextAccount,
  checkAddrIsBlackList,
  sleep,
};
