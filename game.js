const $ = (id) => document.getElementById(id);

let db = null, channel = null, user = null, room = null;
let remote = {}, queueTimer = null;
let loopId = null;
let aiTimer = null;

let W, H, ctx, mode = null, running = false, last = 0, keys = {}, mouse = { x: 0, y: 0, down: false };
let player = { x: 0, y: 0, r: 17, hp: 100, max: 100, speed: 260, cd: 0, ammo: 12, maxAmmo: 12, reload: 0 };
let enemies = [], bullets = [], score = 0, wave = 1;
let coins = Number(localStorage.coins || 0), rp = Number(localStorage.rp || 0), wins = 0, losses = 0;
let weapon = Number(localStorage.weapon || 1), hpLv = Number(localStorage.hpLv || 1), kills = 0;

const ranks = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "GRAND MASTER"];

function saveLocal() {
  localStorage.coins = coins;
  localStorage.rp = rp;
  localStorage.weapon = weapon;
  localStorage.hpLv = hpLv;
}

function rankName() {
  return ranks[Math.min(6, Math.floor(rp / 100))];
}

function rpIn() {
  return rp % 100;
}

function resize() {
  W = innerWidth;
  H = innerHeight;
  const canvas = $("canvas");
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx = canvas.getContext("2d");
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

addEventListener("resize", resize);
resize();

addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (key === "r") reload();
});

addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

$("canvas").addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

$("canvas").addEventListener("mousedown", () => {
  mouse.down = true;
});

addEventListener("mouseup", () => {
  mouse.down = false;
});

async function init() {
  if (window.GAME_CONFIG && GAME_CONFIG.SUPABASE_URL && GAME_CONFIG.SUPABASE_KEY) {
    db = supabase.createClient(GAME_CONFIG.SUPABASE_URL, GAME_CONFIG.SUPABASE_KEY);
    const { data } = await db.auth.getUser();
    user = data?.user || null;
    if (user) {
      await ensureProfile();
    }
  }
  renderAccount();
}

async function login() {
  if (!db) {
    alert("config.jsにSupabaseのURLとキーを入れてください");
    return;
  }

  const email = prompt("メールアドレス");
  if (!email) return;

  const pass = prompt("パスワード（6文字以上）");
  if (!pass) return;

  let r = await db.auth.signInWithPassword({ email, password: pass });
  if (r.error) {
    r = await db.auth.signUp({ email, password: pass });
  }

  if (r.error) {
    alert(r.error.message);
    return;
  }

  user = r.data.user;
  await ensureProfile();
  renderAccount();
}

async function logout() {
  if (db) await db.auth.signOut();
  user = null;
  renderAccount();
}

async function ensureProfile() {
  if (!db || !user) return;

  const { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (!data) {
    const name = "Player" + Math.floor(Math.random() * 9000 + 1000);
    const { error } = await db.from("profiles").insert({
      id: user.id,
      name,
      rank_points: rp,
      coins,
      weapon_level: weapon,
      hp_level: hpLv
    });

    if (error) {
      console.error("profile insert failed", error);
    }
    return;
  }

  rp = Number(data.rank_points || 0);
  coins = Number(data.coins || 0);
  weapon = Number(data.weapon_level || 1);
  hpLv = Number(data.hp_level || 1);
  saveLocal();
}

function renderAccount() {
  $("account").innerHTML = user
    ? `🟢 ${user.email}<br><button onclick="logout()">ログアウト</button>`
    : `👤 ローカルモード<button onclick="login()">オンラインログイン</button>`;

  $("stats").innerHTML = `🪙 ${coins}　🏆 ${rankName()} ${rpIn()}/100　⚔️ ${wins}勝 ${losses}敗`;
}

async function persist() {
  saveLocal();
  if (db && user) {
    await db.from("profiles").update({
      rank_points: rp,
      coins,
      weapon_level: weapon,
      hp_level: hpLv
    }).eq("id", user.id);
  }
}

function startGame(m) {
  mode = m;
  $("menu").classList.add("hidden");
  $("game").classList.remove("hidden");

  player = {
    x: W / 2,
    y: H / 2,
    r: 17,
    max: 100 + hpLv * 20,
    hp: 100 + hpLv * 20,
    speed: 260,
    cd: 0,
    ammo: 12,
    maxAmmo: 12,
    reload: 0
  };

  score = 0;
  wave = 1;
  kills = 0;
  enemies = [];
  bullets = [];
  running = true;
  last = performance.now();

  if (m === "zombie") spawnWave();

  if (loopId) cancelAnimationFrame(loopId);
  loopId = requestAnimationFrame(loop);

  connectRoom(m === "zombie" ? "zombie" : "rank");
}

function spawnWave() {
  for (let i = 0; i < 5 + wave * 2; i++) {
    const s = Math.floor(Math.random() * 4);
    const x = s < 2 ? (s ? W : 0) : Math.random() * W;
    const y = s >= 2 ? (s === 3 ? H : 0) : Math.random() * H;
    enemies.push({ x, y, r: 15, hp: 35 + wave * 8, speed: 45 + wave * 4 });
  }
}

function reload() {
  if (player.reload <= 0 && player.ammo < player.maxAmmo) {
    player.reload = 1;
  }
}

function fire() {
  if (player.reload > 0 || player.cd > 0) return;
  if (player.ammo <= 0) {
    reload();
    return;
  }

  const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  bullets.push({
    x: player.x,
    y: player.y,
    vx: Math.cos(a) * 700,
    vy: Math.sin(a) * 700,
    life: 1
  });

  player.ammo--;
  player.cd = 0.12 / Math.max(1, weapon * 0.2);
}

function update(dt) {
  const dx = (keys.a || keys.arrowleft ? -1 : 0) + (keys.d || keys.arrowright ? 1 : 0);
  const dy = (keys.w || keys.arrowup ? -1 : 0) + (keys.s || keys.arrowdown ? 1 : 0);
  const l = Math.hypot(dx, dy) || 1;

  player.x = Math.max(20, Math.min(W - 20, player.x + dx / l * player.speed * dt));
  player.y = Math.max(20, Math.min(H - 20, player.y + dy / l * player.speed * dt));
  player.cd -= dt;

  if (mouse.down) fire();

  if (player.reload > 0) {
    player.reload -= dt;
    if (player.reload <= 0) player.ammo = player.maxAmmo;
  }

  bullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  });

  bullets = bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);

  enemies.forEach((e) => {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;

    if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) {
      player.hp -= 22 * dt;
    }
  });

  for (let i = bullets.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      const b = bullets[i];
      const e = enemies[j];

      if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
        e.hp -= 25 + weapon * 8;
        bullets.splice(i, 1);

        if (e.hp <= 0) {
          enemies.splice(j, 1);
          kills++;
          score += 10;
          coins += 2;
        }
        break;
      }
    }
  }

  if (mode === "zombie" && enemies.length === 0) {
    wave++;
    coins += 5;
    score += wave * 20;
    spawnWave();
  }

  if (mode === "rank" && score >= 120) finish(true);
  if (player.hp <= 0) finish(false);

  sendState();
  updateHud();
}

let sendCooldown = 0;

async function sendState() {
  if (!channel) return;
  sendCooldown -= 0.016;
  if (sendCooldown > 0) return;
  sendCooldown = 0.08;

  channel.send({
    type: "broadcast",
    event: "state",
    payload: {
      id: user?.id || "local",
      x: player.x,
      y: player.y,
      hp: player.hp,
      name: user?.email?.split("@")[0] || "Player"
    }
  });
}

function draw() {
  ctx.fillStyle = "#0b1018";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#172337";
  for (let x = 0; x < W; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  for (const id in remote) {
    const p = remote[id];
    ctx.fillStyle = id.startsWith("AI") ? "#d8a63c" : "#55e58a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, 7);
    ctx.fill();
  }

  ctx.fillStyle = "#4da3ff";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, 7);
  ctx.fill();

  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(mouse.x, mouse.y);
  ctx.stroke();

  ctx.fillStyle = "#e03f50";
  enemies.forEach((e) => {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, 7);
    ctx.fill();
  });

  ctx.fillStyle = "#ffd34d";
  bullets.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, 7);
    ctx.fill();
  });
}

function updateHud() {
  $("hud").textContent = `${mode === "zombie" ? "🧟 ZOMBIE" : "🏆 RANK"}　❤️ ${Math.max(0, player.hp | 0)}　🔫 ${player.ammo}/${player.maxAmmo}　⭐ ${score}　🏆 ${rankName()} ${rpIn()}/100　🪙 ${coins}　${mode === "zombie" ? "Wave " + wave : ""}　オンライン:${Object.keys(remote).length}`;
}

function loop(t) {
  if (!running) return;
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  update(dt);
  draw();
  loopId = requestAnimationFrame(loop);
}

async function finish(win) {
  if (!running) return;
  running = false;

  if (mode === "rank") {
    if (win) {
      wins++;
      rp = Math.min(699, rp + 20);
      coins += 20;
    } else {
      losses++;
      rp = Math.max(0, rp - 15);
    }
  } else {
    coins += Math.floor(score / 20);
  }

  await persist();
  await disconnectRoom();
  alert(win ? "勝利！ +20 RP" : "敗北… -15 RP");
  backToMenu();
}

async function connectRoom(roomName) {
  if (!db) return;

  room = "room:" + roomName;

  if (roomName === "rank") {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      if (running && Object.keys(remote).length === 0) {
        for (let i = 0; i < 3; i++) {
          remote["AI" + i] = { x: 80 + i * 150, y: 100, r: 17, hp: 100, name: "AI" };
        }
      }
    }, 2500);
  }

  if (channel) {
    await db.removeChannel(channel);
    channel = null;
  }

  channel = db.channel(room)
    .on("broadcast", { event: "state" }, ({ payload }) => {
      if (payload.id !== (user?.id || "local")) remote[payload.id] = payload;
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => addChat(payload))
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ id: user?.id || "local" });
      }
    });
}

async function disconnectRoom() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }

  if (db && channel) {
    await db.removeChannel(channel);
    channel = null;
  }

  remote = {};
}

function quickMatch() {
  closePanel();
  openPanel(`<h2>🔎 マッチング中...</h2><p>同じランク帯のプレイ��ーを探しています。</p><p class="small">一定時間、人が見つからなければAIが参加します。</p>`);
  setTimeout(() => {
    closePanel();
    startGame("rank");
  }, 1200);
}

function openPanel(h) {
  $("panelContent").innerHTML = h;
  $("panel").classList.remove("hidden");
}

function closePanel() {
  $("panel").classList.add("hidden");
}

function openRank() {
  openPanel(`<h2>🏆 ランクマッチ</h2><p>${rankName()} ${rpIn()}/100 RP</p><p>勝利 <b class="good">+20</b>　敗北 <b class="bad">-15</b></p><p>同じランク帯を優先してマッチングします。人が不足した場合はAI補充です。</p><button onclick="closePanel();quickMatch()">マッチ開始</button>`);
}

function openShop() {
  openPanel(`<h2>🏪 ショップ</h2><div class="row"><span>🔫 武器 Lv.${weapon}</span><button onclick="buyWeapon()">強化 ${50 * weapon}🪙</button></div><div class="row"><span>❤️ HP Lv.${hpLv}</span><button onclick="buyHP()">強化 ${50 * hpLv}🪙</button></div><p>🪙 ${coins}</p>`);
}

function buyWeapon() {
  const c = 50 * weapon;
  if (coins < c) return alert("コイン不足");
  coins -= c;
  weapon++;
  persist();
  openShop();
}

function buyHP() {
  const c = 50 * hpLv;
  if (coins < c) return alert("コイン不足");
  coins -= c;
  hpLv++;
  persist();
  openShop();
}

function openChat() {
  openPanel(`<h2>💬 チャット</h2><div id="chat" class="chat"></div><input id="msg" placeholder="メッセージ"><button onclick="sendChat()">送信</button><p class="small">オンライン接続中は同じルームの人に届きます。</p>`);
}

function addChat(p) {
  const c = $("chat");
  if (!c) return;
  const d = document.createElement("div");
  d.textContent = (p.name || "Player") + ": " + p.message;
  c.prepend(d);
}

async function sendChat() {
  const x = $("msg");
  if (!x || !x.value.trim()) return;

  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "chat",
      payload: {
        name: user?.email?.split("@")[0] || "Player",
        message: x.value.slice(0, 120)
      }
    });
  }

  addChat({ name: "自分", message: x.value });
  x.value = "";
}

async function openFriends() {
  if (!db || !user) {
    openPanel(`<h2>👥 フレンド</h2><p>オンラインログインするとフレンド機能を使えます。</p><button onclick="login()">ログイン</button>`);
    return;
  }

  const { data } = await db.from("friendships").select("*").or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
  openPanel(`<h2>👥 フレンド</h2><input id="friendId" placeholder="相手のユーザーID"><button onclick="addFriend()">申請</button><div>${(data || []).map((x) => `<div class="row">ID: ${x.user_id === user.id ? x.friend_id : x.user_id}<span>${x.status}</span></div>`).join("") || "まだフレンドがいません"}</div>`);
}

async function addFriend() {
  const x = $("friendId").value.trim();
  if (!x) return;

  const r = await db.from("friendships").insert({
    user_id: user.id,
    friend_id: x
  });

  if (r.error) {
    alert(r.error.message);
  } else {
    openFriends();
  }
}

function backToMenu() {
  running = false;
  if (loopId) cancelAnimationFrame(loopId);
  loopId = null;

  disconnectRoom();
  $("game").classList.add("hidden");
  $("menu").classList.remove("hidden");
  renderAccount();
}

init();
