const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');

const pool = require('../../methods/database.js');
const { TELEGRAM, QUERIES } = require('../../constants.js');
const { swapToNextAccount } = require('./utils.js');

async function callJoin(ctx, botID, customChannels, client) {
    try {
        let channels = customChannels || ctx.message.text.replace('/add_channels\n', '').split('\n');
        const allChannelsInBase = (await pool.query(QUERIES.getChannelsInfo)).rows.map(row => parseInt(row.link, 10));

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

        let backupAccounts = (await pool.query(QUERIES.getBackupBotsByIsCurrentAndBotNumber, [false, TELEGRAM.BOT_NUMBER])).rows;
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
                await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
            }

            async function joinAction(customClient, customID) {
                try {
                    console.log('checking channel');

                    async function banHandler(error) {
                        if (error.toString().includes('USER_DEACTIVATED_BAN')) {
                            await swapToNextAccount(bot);
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
                        await pool.query(QUERIES.deleteChannelByChannelIdAndBotNumber, [chatID.toString(), TELEGRAM.BOT_NUMBER]);

                        await pool.query(QUERIES.insertChannel, [chatID.toString(), channel, TELEGRAM.BOT_NUMBER]);



                        const targetChannelData = await client.invoke(new Api.channels.GetFullChannel({
                            channel: chatID
                        }));

                        const channelInnerLink = targetChannelData.chats?.[0]?.username ||
                            parseInt(targetChannelData.chats?.[0]?.id, 10).toString();

                        const channelTitle = targetChannelData.chats?.[0]?.title || 'Channel';

                        await pool.query(
                            QUERIES.deleteChannelInfoByChannelId,
                            [chatID.toString()]
                        );

                        console.log(channelInnerLink, channelTitle);
                        await pool.query(
                            QUERIES.insertChannelInfo,
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

export default callJoin;