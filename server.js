const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const Discord = require("discord.js");
const request = require("request");
const {
  Intents,
  Client,
  MessageActionRow, //使用してません
  MessageButton, //使用してません
  ClientApplication,
} = require("discord.js");
const options = {
  intents: [
    "GUILDS",
    "GUILD_MESSAGES",
    "GUILD_MESSAGE_REACTIONS", //使用してません
    "GUILD_VOICE_STATES", //使用してません
    "GUILD_WEBHOOKS",
  ],
};
const cacheWebhooks = new Map();
const commands = [
  {
    name: "ping",
    description: "ping値を返します。",
  },
  {
    name: "autotrans",
    description: "コマンドが送信されたチャンネルで自動翻訳を開始/停止します。",
  },
];
const fs = require("fs");
const client = new Discord.Client(options);
// const prefix = "t!";//prefix自分で入れてね
const fetch = require("node-fetch");
const trmsgid = new Object();

var cash;

const S3 = new S3Client({
  region: "auto",
  endpoint: process.env.ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadR2(S3) {
  const res = await S3.send(
    new PutObjectCommand({
      Body: fs.createReadStream("targets.json"),
      Bucket: "discor-bot-misc-f928yrweah887ab8348rg0",
      Key: "targets.json",
    })
  );
}

async function downloadR2(S3) {
  const fs = require("fs");
  fs.unlink("./targets.json", (error) => {});
  const res = await S3.send(
    new GetObjectCommand({
      Bucket: "discor-bot-misc-f928yrweah887ab8348rg0",
      Key: "targets.json",
    })
  );

  const settings = await res.Body?.transformToString();
  fs.writeFileSync("./targets.json", settings);
  return settings;
}

var cache = downloadR2(S3);
var packagejson = require("./package.json");

client.on("ready", async () => {
  console.log(client.user.tag + "にログインしました");
  client.user.setPresence({
    status: "online",
  });
  client.user.setActivity(
    `ver ${packagejson.version} | d.js : ${packagejson.dependencies[
      "discord.js"
    ].replace("^", "")},wake up time : ${Date.now()}`,
    { type: "PLAYING" }
  );
  await client.application.commands.set(commands); //スラッシュコマンドの登録
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return; //botのメッセージに反応しない。消してもいいけど永遠に翻訳ループする可能性があるので注意
  if (message.content.match("")) {
    const nickname = message.member.displayName; //webhookのauthorname
    const avatarURL = message.author.avatarURL({ dynamic: true }); //webhookのavatar(URLで指定)
    const webhook = await getWebhookInChannel(message.channel);

    if (message.channel.id in cash["msgch"]) {
      if (message.mentions.members.size > 0) {
        var mentionmember = message.mentions.members.first(); //メンションされた最初の人を取得
        var trtext = message.content.replace(`<@${mentionmember.user.id}>`, ""); //さっき取得したメンションを置き換え(複数メンション非対応(改善の余地あり))
      } else {
        var trtext = message.content;
      }
      try {
        var jares = await fetch(
          `https://script.google.com/macros/s/AKfycbxE0P0J33Us4JGSz6m_QeJ6mLOpyVnUWNMZGRtJ-KQp8WiPDVWrYrhGtm--AFh1tDja/exec?text=${trtext}`
        ).then((res) => res.text());

        if (jares === "[リンク省略]") {
          return;
        } //もしリンクのみの場合、Google Apps Scriptでリンクを[リンク省略]に置き換えてるので、リンク省略のみが返された場合はメッセージ送信しない(複数リンク非対応)
        if (message.content === "") {
          return;
        } //送信されたものが画像だけだったりファイルだけの場合翻訳しない。
        if (jares === "") {
          return;
        }
        //絵文字とか除外(完全ではない。)
        if (jares.match("<H1>Bad Request</H1>")) {
          return await webhook.send({
            content: `Cannot translate.`,
            username: `Error`,
            avatarURL: avatarURL,
          });
        } //翻訳でエラーが出た場合除外
        if (jares.match("<title>Error</title>")) {
          return await webhook.send({
            content: `Cannot translate.`,
            username: `Error`,
            avatarURL: avatarURL,
          });
        } //翻訳でエラーが出た場合除外(こっちだけでいい感あり)
        //もっといい例外処理の書き方あると思う
        const translatemsg = await webhook.send({
          content: `...`, //とりあえずwebhookの送信(翻訳apiの返答に600msぐらいかかるため)
          username: `from: ${nickname}`,
          avatarURL: avatarURL,
        });
        trmsgid[message.id] = translatemsg.id; //キャッシュに保存(ファイルに保存してもいいけど活発なサーバーだと読み込み遅くなると思う。)
        webhook.editMessage(translatemsg.id, jares); //さっき送信したwebhookの編集
      } catch (err) {
        console.error(err);
      }
    } //エラー出たらコンソールに出力
  }
});
client.on("messageDelete", async (message) => {
  //メッセージ削除検知的な
  if (!message.guild) return; //メッセージ削除されたのがサーバーじゃなければ除外
  if (trmsgid[message.id] === undefined) {
    //キャッシュに削除されたメッセージのidがなければ除外
    return;
  } else {
    await client.channels.cache
      .get(message.channel.id)
      .messages.cache.get(trmsgid[message.id])
      .delete(); //キャッシュに存在するメッセージidからwebhookで送信したメッセージ取得して削除
  }
});
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  } //ボタン使うならこれの前にコード書く
  if (interaction.commandName === "ping") {
    //よくあるやつ(全部ミリ秒)
    cash.timestamp0 = Date.now();
    await interaction.deferReply();
    cash.timestamp = Date.now();
    const webhook = await getWebhookInChannel(interaction.channel);
    const msg = await webhook.send({
      content: `test`,
      username: `test`,
      avatarURL:
        "https://cdn.discordapp.com/avatars/1190995174030053476/0bbe1045e85da9c0aab26f649f0fc0c6.png?size=1024",
    });
    cash.timestamp1 = Date.now();
    msg;
    cash.timestamp2 = Date.now();
    webhook.editMessage(msg.id, "editedmessage");
    cash.timestamp3 = Date.now();
    await client.channels.cache
      .get(interaction.channel.id)
      .messages.cache.get(msg.id)
      .delete();
    cash.timestamp4 = Date.now();
    await fetch(
      `https://script.google.com/macros/s/AKfycbxE0P0J33Us4JGSz6m_QeJ6mLOpyVnUWNMZGRtJ-KQp8WiPDVWrYrhGtm--AFh1tDja/exec?text=${"test"}`
    ).then((res) => res.text());
    cash.timestamp5 = Date.now();
    return await interaction.editReply({
      content: `EndPoint : ${
        cash.timestamp0 - Date.parse(interaction.createdAt)
      }(Not so accurate.)\nsendmessage : ${
        cash.timestamp - cash.timestamp0
      }\nsendwebhook : ${cash.timestamp3 - cash.timestamp}\ndeletemessage : ${
        cash.timestamp4 - cash.timestamp3
      }\ntranslateapi : ${cash.timestamp5 - cash.timestamp4}`,
      ephemeral: false,
    });
  }
  if (interaction.commandName === "autotrans") {
    //自動翻訳の開始終了
    const channelid = interaction.channel.id;
    var FilePath = "./targets.json";
    var Structure = JSON.parse(fs.readFileSync(FilePath));
    if (channelid in Structure["msgch"]) {
      delete Structure["msgch"][channelid];
      cash = Structure;
      fs.writeFileSync(FilePath, JSON.stringify(Structure));
      uploadR2(S3);
      return interaction.reply("stop translation");
    } else {
      var FilePath = "./targets.json";
      var Structure = JSON.parse(fs.readFileSync(FilePath));
      Structure["msgch"][channelid] = true;
      fs.writeFileSync(FilePath, JSON.stringify(Structure));
      cash = Structure;
      uploadR2(S3);
      return interaction.reply("start translation");
    }
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  //メッセージが編集されたことを検知
  if (trmsgid[oldMessage.id] === undefined) {
    //キャッシュにメッセージidなかったら除外
    return;
  } else {
    const webhook = await getWebhookInChannel(oldMessage.channel);
    const translatemsg = trmsgid[oldMessage.id];
    try {
      var jares = await fetch(
        `https://script.google.com/macros/s/AKfycbxE0P0J33Us4JGSz6m_QeJ6mLOpyVnUWNMZGRtJ-KQp8WiPDVWrYrhGtm--AFh1tDja/exec?text=${newMessage.content}`
      ).then((res) => res.text());
      // var enres = await fetch(`https://script.google.com/macros/s/AKfycbxE0P0J33Us4JGSz6m_QeJ6mLOpyVnUWNMZGRtJ-KQp8WiPDVWrYrhGtm--AFh1tDja/exec?text=${newMessage.content}`).then(res => res.text())
      if (jares === "[リンク省略]") {
        return;
      }
      if (newMessage.content === "") {
        return;
      }
      if (jares === "") {
        return;
      }
      // if(enres===""){
      //   return
      // }
      if (jares.match("<H1>Bad Request</H1>")) {
        return await webhook.editMessage(translatemsg, `Cannot translate.`);
      }
      if (jares.match("<title>Error</title>")) {
        return await webhook.editMessage(translatemsg, `Cannot translate.`);
      }
      webhook.editMessage(translatemsg, jares);
    } catch (err) {
      console.error(err);
    }
  }
});

if (process.env.DISCORD_BOT_TOKEN == undefined) {
  console.log("DISCORD_BOT_TOKENが設定されていません。");
  process.exit(0);
}

// async function test(){
//   var testtext = encodeURIComponent("Hello Mr.Tomichi");
//   var msg = await fetch(`https://script.google.com/macros/s/AKfycbxE0P0J33Us4JGSz6m_QeJ6mLOpyVnUWNMZGRtJ-KQp8WiPDVWrYrhGtm--AFh1tDja/exec?text=${testtext}`).then(res => res.text())
//   console.log(msg);
// }

// test();
client.login(process.env.DISCORD_BOT_TOKEN);

async function getWebhookInChannel(channel) {
  //webhookのキャッシュを自前で保持し速度向上
  const webhook = cacheWebhooks.get(channel.id) ?? (await getWebhook(channel));
  return webhook;
}

async function getWebhook(channel) {
  //チャンネル内のWebhookを全て取得
  const webhooks = await channel.fetchWebhooks();
  //tokenがある（＝webhook製作者がbot自身）Webhookを取得、なければ作成する
  const webhook =
    webhooks?.find((v) => v.token) ??
    (await channel.createWebhook("Bot Webhook"));
  //キャッシュに入れて次回以降使い回す
  if (webhook) cacheWebhooks.set(channel.id, webhook);
  return webhook;
}
