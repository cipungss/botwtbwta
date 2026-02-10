const TelegramBot = require("node-telegram-bot-api");
const config = require("./config.json");

const bot = new TelegramBot(config.TOKEN, { polling: true });
const ADMINS = config.ADMINS;
let users = new Set();
let senders = [];

// === CEK MEMBER DI SEMUA CHANNEL & GRUP ===
async function checkMembership(userId) {
  try {
    for (let ch of config.CHANNELS) {
      let m = await bot.getChatMember(ch, userId);
      if (["left", "kicked"].includes(m.status)) return false;
    }
    for (let gr of config.GROUPS) {
      let m = await bot.getChatMember(gr, userId);
      if (["left", "kicked"].includes(m.status)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// === MIDDLEWARE CEK JOIN ===
async function requireJoin(msg, next) {
  const userId = msg.from.id;
  const ok = await checkMembership(userId);

  if (!ok) {
    let buttons = [];

    config.CHANNELS.forEach(ch => {
      buttons.push([{ text: `📢 Join ${ch}`, url: `https://t.me/${ch.replace("@", "")}` }]);
    });

    config.GROUP_LINKS.forEach((link, i) => {
      buttons.push([{ text: `💬 Join Grup ${i+1}`, url: link }]);
    });

    buttons.push([{ text: "🔄 Reload", callback_data: "reload" }]);

    bot.sendMessage(
      msg.chat.id,
      "⚠️ Kamu harus join semua channel & grup dulu sebelum bisa pakai bot ini!",
      { reply_markup: { inline_keyboard: buttons } }
    );
    return;
  }
  next();
}

// === START ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users.add(chatId);
  requireJoin(msg, () => {
    bot.sendMessage(chatId, "✅ Selamat datang! Kirim pesan kamu dengan format #wtb untuk beli sesuatu #wta untuk menanyakan sesuatu.format di awal.");
  });
});

// === RELOAD ===
bot.on("callback_query", async (q) => {
  if (q.data === "reload") {
    const ok = await checkMembership(q.from.id);
    if (ok) {
      bot.answerCallbackQuery(q.id, { text: "✅ Kamu sudah join semua, silakan kirim pesan.Rules mengirim pesan bisa dilihat disini @RulesWTBWTA." });
      bot.sendMessage(q.from.id, "Sekarang kamu bisa kirim pesan ke bot.Rules mengirim pesan bisa dilihat disini @RulesWTBWTA.");
    } else {
      bot.answerCallbackQuery(q.id, { text: "❌ Belum join semua!" });
    }
  }
});

// === PESAN USER → KIRIM KE CHANNEL ===
bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return; // cegah komentar grup
  if (msg.text && msg.text.startsWith("/")) return; // skip command

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isAdmin = ADMINS.includes(userId);

  if (msg.text) {
    requireJoin(msg, async () => {
      let text = msg.text.trim();

      // === VALIDASI HASHTAG WAJIB DI AWAL ===
      const matches = text.match(/^(#wtb|#wta)\b/i);
      if (!matches) {
        return bot.sendMessage(chatId, "⚠️ Pesan harus diawali dengan #wtb atau #wta.");
      }

      // pastikan hanya 1 hashtag
      const allTags = text.match(/#wtb|#wta/gi);
      if (allTags.length > 1) {
        return bot.sendMessage(chatId, "⚠️ Pesan hanya boleh mengandung 1 hashtag (#wtb atau #wta saja).");
      }

      // pisahkan hashtag dari isi pesan
      const tag = matches[1].toLowerCase();
      const content = text.replace(/^(#wtb|#wta)\s*/i, "").trim();

      // format final sesuai aturan
      let finalMsg = "";
      if (tag === "#wtb") {
        finalMsg = `☁ #wtb\n${content}`;
      } else if (tag === "#wta") {
        finalMsg = `☕ #wta\n${content}`;
      }

      // === BATASAN NON-ADMIN ===
      if (!isAdmin) {
        if (content.length > 80) {
          return bot.sendMessage(chatId, "⚠️ Maksimal 80 karakter!");
        }
        finalMsg = finalMsg.replace(/@\w+/g, "[username dihapus]");
      }

      try {
        const sent = await bot.sendMessage(config.CHANNELS[0], finalMsg); // post ke channel utama
        senders.push({ id: userId, name: msg.from.first_name, text: finalMsg });

        const link = `https://t.me/${config.CHANNELS[0].replace("@", "")}/${sent.message_id}`;
        bot.sendMessage(chatId, "✅ Pesan berhasil dikirim!", {
          reply_markup: {
            inline_keyboard: [[{ text: "🔗 Lihat di Channel", url: link }]]
          }
        });
      } catch (e) {
        console.error("Error kirim:", e.message);
        bot.sendMessage(chatId, "❌ Gagal kirim ke channel.");
      }
    });
  }
});

// === ADMIN: LIHAT PENGIRIM ===
bot.onText(/\/senders/, (msg) => {
  if (!ADMINS.includes(msg.from.id)) return;
  if (!senders.length) return bot.sendMessage(msg.chat.id, "Belum ada pengirim.");
  let list = senders.map(s => `👤 ${s.name} (${s.id}) → ${s.text}`).join("\n\n");
  bot.sendMessage(msg.chat.id, list);
});

// === ADMIN: BROADCAST ===
bot.onText(/\/bc (.+)/, (msg, match) => {
  if (!ADMINS.includes(msg.from.id)) return;
  const text = match[1];
  users.forEach(u => {
    bot.sendMessage(u, `📢 Pesan dari Admin:\n\n${text}`);
  });
});
