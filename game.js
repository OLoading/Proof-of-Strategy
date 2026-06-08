// ==================================================
// PROOF OF STRATEGY — game.js
// Organizado + comentado (Fix definitivo pós Patch 0.5)
// Seções: Utils • Áudio • Acessibilidade • Stats • State • Loja • UI • Modals • Boot
// ==================================================

// ==================================================
// SECTION: Utils
// ==================================================
const $ = (id) => document.getElementById(id);

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function fmt(n, d=0){
  if (!isFinite(n)) return "0";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
}

// PATCH 0.8 — formatação de números grandes (K/M/B/T…)
const BIG_SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmtBig(n, d=2){
  if(!isFinite(n)) return "0";
  const neg = n < 0;
  let x = Math.abs(n);
  // abaixo de 1000: inteiro se for redondo, senão até d casas
  if(x < 1000){
    const dec = (x % 1 === 0) ? 0 : d;
    return (neg ? "-" : "") + fmt(x, dec);
  }
  let tier = Math.floor(Math.log10(x) / 3);
  if(tier >= BIG_SUFFIXES.length) tier = BIG_SUFFIXES.length - 1;
  const scaled = x / Math.pow(1000, tier);
  // menos casas conforme o número de dígitos inteiros cresce (1,23K • 12,3K • 123K)
  const intDigits = Math.floor(Math.log10(scaled)) + 1;
  const dec = clamp(d - (intDigits - 1), 0, d);
  const str = scaled.toLocaleString("pt-BR", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  return (neg ? "-" : "") + str + BIG_SUFFIXES[tier];
}
function toast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.hidden = true, 1400);
}
function fmtTime(seconds){
  if(!isFinite(seconds) || seconds <= 0) return "—";
  if(seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = seconds/60;
  if(m < 60) return `${Math.ceil(m)}min`;
  const h = m/60;
  if(h < 48) return `${Math.ceil(h)}h`;
  const d = h/24;
  return `${Math.ceil(d)}d`;
}
function priceFor(upg, qtyOwned){
  const g = upg.growth ?? CONFIG.pricing.genericGrowth;
  return upg.baseCost * Math.pow(g, qtyOwned);
}


// ==================================================
// SECTION: Áudio (SFX)
// ==================================================
const AUDIO_KEY = "pos_audio_v1";

const AUDIO = {
  enabled: true,
  volume: 0.6,
  sounds: {},
  lastPlayed: {},
  cooldownMs: { click:35, block:120, buy:90, event:250, error:200 }
};

function loadSound(name){
  const a = new Audio(`sounds/${name}.mp3`);
  a.volume = AUDIO.volume;
  return a;
}
function initAudio(){
  AUDIO.sounds = {
    click: loadSound("click"),
    block: loadSound("block"),
    buy: loadSound("buy"),
    event: loadSound("event"),
    error: loadSound("error"),
  };
}
function applyAudioSettings(){
  for(const k in AUDIO.sounds) AUDIO.sounds[k].volume = AUDIO.volume;
}
function saveAudio(){
  localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled: AUDIO.enabled, volume: AUDIO.volume }));
}
function loadAudio(){
  try{
    const raw = localStorage.getItem(AUDIO_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(typeof d.enabled === "boolean") AUDIO.enabled = d.enabled;
    if(typeof d.volume === "number") AUDIO.volume = clamp(d.volume, 0, 1);
  }catch{}
}
function playSound(name){
  if(!AUDIO.enabled) return;
  const s = AUDIO.sounds[name];
  if(!s) return;

  const now = performance.now();
  const cd = AUDIO.cooldownMs?.[name] ?? 0;
  const last = AUDIO.lastPlayed?.[name] ?? -1e9;
  if(now - last < cd) return;
  AUDIO.lastPlayed[name] = now;

  const vol = name === "error" ? (AUDIO.volume * 0.75) : AUDIO.volume;
  const c = s.cloneNode();
  c.volume = vol;
  c.play().catch(()=>{});
}


// ==================================================
// SECTION: Música (ambiente)
// ==================================================
const MUSIC_KEY = "pos_music_v1";

const MUSIC = {
  enabled: false,
  volume: 0.25,
  el: null
};

function initMusic(){
  const a = new Audio("sounds/ambient.mp3");
  a.loop = true;
  a.volume = MUSIC.volume;
  MUSIC.el = a;
}
function applyMusicSettings(){
  if(MUSIC.el) MUSIC.el.volume = MUSIC.volume;
}
function saveMusic(){
  localStorage.setItem(MUSIC_KEY, JSON.stringify({ enabled: MUSIC.enabled, volume: MUSIC.volume }));
}
function loadMusic(){
  try{
    const raw = localStorage.getItem(MUSIC_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(typeof d.enabled === "boolean") MUSIC.enabled = d.enabled;
    if(typeof d.volume === "number") MUSIC.volume = clamp(d.volume, 0, 1);
  }catch{}
}
async function startMusic(){
  if(!MUSIC.el || !MUSIC.enabled) return;
  try{ await MUSIC.el.play(); } catch {}
}
function stopMusic(){
  if(!MUSIC.el) return;
  MUSIC.el.pause();
  MUSIC.el.currentTime = 0;
}


// ==================================================
// SECTION: Acessibilidade
// - Contraste usa a classe CSS: .contrast-on
// ==================================================
const ACCESS_KEY = "pos_access_v1";

const ACCESS = {
  highContrast: false,
  reduceMotion: false
};

function loadAccess(){
  try{
    const raw = localStorage.getItem(ACCESS_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    ACCESS.highContrast = !!d.highContrast;
    ACCESS.reduceMotion = !!d.reduceMotion;
  }catch{}
}
function saveAccess(){
  localStorage.setItem(ACCESS_KEY, JSON.stringify(ACCESS));
}
function applyAccess(){
  document.body.classList.toggle("contrast-on", ACCESS.highContrast);
  document.body.classList.toggle("reduce-motion", ACCESS.reduceMotion);
}


// ==================================================
// SECTION: Estatísticas (metaprogress)
// ==================================================
const STATS_KEY = "pos_stats_v1";

function freshStats(){
  return {
    totalSeconds: 0,
    runSeconds: 0,
    totalClicks: 0,
    bestRunBlocks: 0,
    totalForks: 0,
    peakSat: 0,
    totalEvents: 0,   // Patch 0.7 — para conquista event_veteran
    // PATCH 1.0 — contadores por raridade de evento
    eventsCommon: 0,
    eventsRare: 0,
    eventsEpic: 0,
  };
}
let stats = freshStats();

function loadStats(){
  try{
    const raw = localStorage.getItem(STATS_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    stats = { ...freshStats(), ...d };
  }catch{}
}
function saveStats(){
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
function fmtDur(sec){
  sec = Math.max(0, Math.floor(sec));
  if(sec < 60) return `${sec}s`;
  const m = Math.floor(sec/60);
  const h = Math.floor(m/60);
  const d = Math.floor(h/24);
  if(d > 0) return `${d}d ${h%24}h`;
  if(h > 0) return `${h}h ${m%60}m`;
  return `${m}m`;
}


// ==================================================
// SECTION: Estado do jogo (run atual)
// ==================================================
function freshState(){
  return {
    sat: 0,
    blockProgress: 0,
    blocksMined: 0,

    pcBase: 1,
    hashBase: 0,
    energy: 0,

    mult: { pc:1, hash:1, energy:1, difficulty:1, reward:1, energyCost:1 },
    path: null,

    fork: { totalForks:0, fp:0, bonusMult:1 },
    owned: {},

    features: { autoClick:false, noDeficitPenalty:false },

    activeEvent: null,
    temp: { pc:1, hash:1, energyCost:1, reward:1, difficulty:1 },

    // ✅ Patch 0.5: specialization
    spec: { eng: { a:0, b:0, c:0 }, max: { a:0, b:0, c:0 } },

    ui: { tab:"click" },
    log: [],
    ach: { unlocked:{} },

    // PATCH 0.6 P2 — efeitos temporários (eventos com escolha)
    choiceFx: [],
    choiceLastBlock: 0,
    choiceCooldownUntilBlock: 0,

    // PATCH 0.7 — flags de conquistas
    hadNegativeSat: false,   // true quando SAT já ficou < 0 nessa run

    lastTick: Date.now(),
    lastSave: Date.now(),
    lastAutoClick: Date.now(),
  };
}

let state = freshState();


// ==================================================
// SECTION: Conquistas (meta-progresso permanente, fora do save da run)
// - Vivem em localStorage próprio (como as stats); sobrevivem a Hard Fork e Reset Run.
// ==================================================
const ACH_KEY = "pos_ach_v1";
let achUnlocked = {};   // { id: true }

function loadAch(){
  try{
    const raw = localStorage.getItem(ACH_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    achUnlocked = (d && d.unlocked) ? d.unlocked : (d || {});
  }catch{}
}
function saveAch(){
  try{ localStorage.setItem(ACH_KEY, JSON.stringify({ unlocked: achUnlocked })); }catch{}
}

// ==================================================
// PATCH 0.7 — E2: flags de UI (dicas de primeiro uso)
// Persistem em localStorage próprio; sobrevivem a Fork/Reset.
// ==================================================
const UIFLAGS_KEY = "pos_uiflags_v1";
let uiFlags = {};   // { forkHintSeen: true, ... }
function loadUIFlags(){
  try{
    const raw = localStorage.getItem(UIFLAGS_KEY);
    if(raw) uiFlags = JSON.parse(raw) || {};
  }catch{}
}
function saveUIFlags(){
  try{ localStorage.setItem(UIFLAGS_KEY, JSON.stringify(uiFlags)); }catch{}
}

// ==================================================
// PATCH 0.8 — Missões / Objetivos
// Catálogo ordenado; mostra as próximas N não resgatadas.
// metric() lê valores monotônicos (stats meta + run atual).
// Persistem em localStorage próprio (sobrevivem a Fork/Reset).
// ==================================================
const MISSIONS_KEY = "pos_missions_v1";
let missionClaimed = {};   // { id: true }
function loadMissions(){
  try{
    const raw = localStorage.getItem(MISSIONS_KEY);
    if(raw) missionClaimed = JSON.parse(raw) || {};
  }catch{}
}
function saveMissions(){
  try{ localStorage.setItem(MISSIONS_KEY, JSON.stringify(missionClaimed)); }catch{}
}

const MISSIONS = [
  { id:"m_block1",   name:"Primeiro Hash",      desc:"Valide 1 bloco.",          target:1,      metric:()=> Math.max(state.blocksMined, stats.bestRunBlocks ?? 0), reward:()=>{ state.sat += 100; },        rewardLabel:"+100 SAT" },
  { id:"m_click25",  name:"Dedos Quentes",      desc:"Clique 25 vezes.",         target:25,     metric:()=> stats.totalClicks,                                     reward:()=>{ state.sat += 150; },        rewardLabel:"+150 SAT" },
  { id:"m_block10",  name:"Aquecendo",          desc:"Valide 10 blocos.",        target:10,     metric:()=> Math.max(state.blocksMined, stats.bestRunBlocks ?? 0), reward:()=>{ state.sat += 400; },        rewardLabel:"+400 SAT" },
  { id:"m_buy3",     name:"Investidor Inicial", desc:"Compre 3 upgrades.",       target:3,      metric:()=> totalUpgradesOwned(),                                  reward:()=>{ state.sat += 500; },        rewardLabel:"+500 SAT" },
  { id:"m_sat5k",    name:"Cofre Cheio",        desc:"Acumule 5.000 SAT.",       target:5000,   metric:()=> stats.peakSat ?? 0,                                    reward:()=>{ state.mult.pc *= 1.05; },   rewardLabel:"+5% PC" },
  { id:"m_event3",   name:"Caçador de Eventos", desc:"Acione 3 eventos.",        target:3,      metric:()=> stats.totalEvents ?? 0,                                reward:()=>{ state.sat += 800; },        rewardLabel:"+800 SAT" },
  { id:"m_block50",  name:"Minerador Dedicado", desc:"Valide 50 blocos.",        target:50,     metric:()=> Math.max(state.blocksMined, stats.bestRunBlocks ?? 0), reward:()=>{ state.mult.hash *= 1.10; }, rewardLabel:"+10% H/s" },
  { id:"m_sat50k",   name:"Baleia Jr.",         desc:"Acumule 50.000 SAT.",      target:50000,  metric:()=> stats.peakSat ?? 0,                                    reward:()=>{ state.mult.reward *= 1.08; },rewardLabel:"+8% RB" },
  { id:"m_fork1",    name:"Novo Começo",        desc:"Faça 1 Hard Fork.",        target:1,      metric:()=> stats.totalForks ?? 0,                                 reward:()=>{ state.sat += 2000; },       rewardLabel:"+2.000 SAT" },
  { id:"m_block200", name:"Pronto pro Fork",    desc:"Valide 200 blocos.",       target:200,    metric:()=> Math.max(state.blocksMined, stats.bestRunBlocks ?? 0), reward:()=>{ state.mult.pc *= 1.15; },   rewardLabel:"+15% PC" },
  { id:"m_sat500k",  name:"Magnata",            desc:"Acumule 500.000 SAT.",     target:500000, metric:()=> stats.peakSat ?? 0,                                    reward:()=>{ state.mult.hash *= 1.15; }, rewardLabel:"+15% H/s" },
];

function totalUpgradesOwned(){
  let n = 0;
  for(const k in state.owned){ n += state.owned[k] || 0; }
  return n;
}
// Retorna as próximas missões ainda não resgatadas (em ordem)
function activeMissions(limit = 3){
  return MISSIONS.filter(m => !missionClaimed[m.id]).slice(0, limit);
}
function claimMission(id){
  const m = MISSIONS.find(x => x.id === id);
  if(!m || missionClaimed[id]) return;
  if(m.metric() < m.target){ playSound("error"); return; }
  m.reward();
  missionClaimed[id] = true;
  saveMissions();
  playSound("buy");
  toast(`🎯 Missão concluída: ${m.name} (${m.rewardLabel})`);
  pushLog(`🎯 Missão "${m.name}" concluída — recompensa: ${m.rewardLabel}.`);
  renderMissions();
  renderUI();
  renderShop();
}

// ==================================================
// PATCH 0.9 — Daily Bonus / Streak
// Loja própria em localStorage; sobrevive a Fork/Reset.
// ==================================================
const DAILY_KEY = "pos_daily_v1";
let daily = { lastClaim: null, streak: 0 };
function loadDaily(){
  try{ const raw = localStorage.getItem(DAILY_KEY); if(raw) daily = { ...daily, ...JSON.parse(raw) }; }catch{}
}
function saveDaily(){
  try{ localStorage.setItem(DAILY_KEY, JSON.stringify(daily)); }catch{}
}

const DAILY_REWARDS = [200, 400, 700, 1100, 1600, 2200, 3000]; // dia 1..7+ (satura no 7)
const DAILY_MAX_DAY = DAILY_REWARDS.length;

function dayKey(d = new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayDiff(aKey, bKey){
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function dailyRewardFor(streakDay){
  const idx = clamp(streakDay - 1, 0, DAILY_REWARDS.length - 1);
  const base = DAILY_REWARDS[idx];
  // escala leve com forks para continuar relevante no late game
  return Math.floor(base * (1 + 0.10 * (stats.totalForks || 0)));
}
function dailyAvailable(){
  return daily.lastClaim !== dayKey();
}
// qual seria o streak se coletasse agora
function pendingStreak(){
  if(!daily.lastClaim) return 1;
  const diff = dayDiff(daily.lastClaim, dayKey());
  if(diff <= 0) return daily.streak;       // já coletou hoje
  if(diff === 1) return Math.min(daily.streak + 1, 9999); // dia seguinte
  return 1;                                 // quebrou o streak
}
function claimDaily(){
  if(!dailyAvailable()){ playSound("error"); return; }
  const newStreak = pendingStreak();
  const sat = dailyRewardFor(newStreak);
  state.sat += sat;
  daily.streak = newStreak;
  daily.lastClaim = dayKey();
  saveDaily();
  playSound("buy");
  toast(`📅 Bônus diário (dia ${newStreak}): +${fmtBig(sat)} SAT!`);
  pushLog(`📅 Bônus diário coletado — streak dia ${newStreak}: +${fmtBig(sat)} SAT.`);
  renderDaily();
  updateDailyIndicator();
  renderUI();
  renderShop();
}

function openDailyModal(){
  const m = $("dailyModal");
  if(!m) return;
  renderDaily();
  m.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeDailyModal(){
  const m = $("dailyModal");
  if(!m) return;
  m.hidden = true;
  document.body.style.overflow = "";
}
function renderDaily(){
  const strip = $("dailyStrip");
  const avail = dailyAvailable();
  const claimStreak = pendingStreak();            // dia que será coletado (ou o atual se já coletou)
  const shownStreak = avail ? claimStreak : daily.streak;

  if(strip){
    strip.innerHTML = "";
    for(let d = 1; d <= DAILY_MAX_DAY; d++){
      const cell = document.createElement("div");
      const isToday = avail && d === claimStreak;
      const past = d < shownStreak || (!avail && d <= daily.streak);
      cell.className = "daily-cell" + (isToday ? " today" : "") + (past && !isToday ? " done" : "");
      const label = d === DAILY_MAX_DAY ? `Dia ${d}+` : `Dia ${d}`;
      cell.innerHTML = `
        <div class="daily-day">${label}</div>
        <div class="daily-amt">${fmtBig(dailyRewardFor(d))}</div>
        ${past && !isToday ? `<div class="daily-check">✓</div>` : ""}
      `;
      strip.appendChild(cell);
    }
  }

  if($("dailySub")){
    $("dailySub").textContent = avail
      ? `Streak atual: ${daily.streak} dia(s). Colete para chegar ao dia ${claimStreak}!`
      : `Você já coletou hoje. Streak: ${daily.streak} dia(s). Volte amanhã!`;
  }
  if($("dailyRewardValue")) $("dailyRewardValue").textContent = `+${fmtBig(dailyRewardFor(claimStreak))} SAT`;
  if($("btnClaimDaily")){
    $("btnClaimDaily").disabled = !avail;
    $("btnClaimDaily").textContent = avail ? "Coletar" : "Coletado ✓";
  }
}
function updateDailyIndicator(){
  const btn = $("btnDaily");
  if(btn) btn.classList.toggle("has-bonus", dailyAvailable());
}

const ACHIEVEMENTS = [
  // === Blocos ===
  { id:"first_block",   name:"Primeiro Bloco",      desc:"Valide seu primeiro bloco na chain.",          check:(s)=> s.blocksMined >= 1 },
  { id:"ten_blocks",    name:"Dez Blocos",           desc:"Valide 10 blocos.",                            check:(s)=> s.blocksMined >= 10 },
  { id:"blocks_25",     name:"Minerador em Série",   desc:"Valide 25 blocos seguidos.",                   check:(s)=> s.blocksMined >= 25 },
  { id:"first_halving", name:"Primeiro Halving",     desc:"Chegue ao primeiro halving (75 blocos).",      check:(s)=> s.blocksMined >= 75 },
  { id:"blocks_150",    name:"Mineiro Sério",        desc:"Valide 150 blocos.",                           check:(s)=> s.blocksMined >= 150 },
  { id:"fork_ready",    name:"Pronto pro Fork",      desc:"Desbloqueie o Hard Fork (200 blocos).",        check:(s)=> s.blocksMined >= CONFIG.fork.minBlocks },
  { id:"blocks_500",    name:"Veterano da Chain",    desc:"Valide 500 blocos. Você está comprometido.",   check:(s)=> s.blocksMined >= 500 },

  // === Riqueza ===
  { id:"sat_10k",   name:"Primeiros 10K",      desc:"Acumule 10.000 SAT de saldo.",                  check:(s)=> s.sat >= 10_000 },
  { id:"sat_100k",  name:"Centena K",          desc:"Acumule 100.000 SAT de saldo.",                 check:(s)=> s.sat >= 100_000 },
  { id:"sat_500k",  name:"Meio Milhão",        desc:"Acumule 500.000 SAT de saldo.",                 check:(s)=> s.sat >= 500_000 },
  { id:"one_btc",   name:"1 BTC Acumulado",    desc:"Chegue a 1 BTC em SAT (saldo atual).",          check:(s)=> s.sat >= CONFIG.SAT_PER_BTC },

  // === Hard Fork ===
  { id:"choice_made", name:"Decisão Tomada",   desc:"Escolha Solo ou Pool no bloco 100.",            check:(s)=> !!s.path },
  { id:"first_fork",  name:"Hard Forker",      desc:"Execute seu primeiro Hard Fork.",               check:(s)=> (s.fork?.totalForks ?? 0) >= 1 },
  { id:"fork_5",      name:"Multiverse",       desc:"Execute 5 Hard Forks. A chain nunca acaba.",   check:(s)=> (s.fork?.totalForks ?? 0) >= 5 },

  // === Cliques ===
  { id:"click_100",  name:"Clicador Iniciante", desc:"100 cliques registrados.",                     check:()=> stats.totalClicks >= 100 },
  { id:"click_1k",   name:"Clicador Hardcore",  desc:"1.000 cliques registrados.",                  check:()=> stats.totalClicks >= 1_000 },
  { id:"click_10k",  name:"Lenda do Mouse",     desc:"10.000 cliques. Seus dedos agradecem.",       check:()=> stats.totalClicks >= 10_000 },

  // === Upgrades & Spec ===
  { id:"upgrades_5",  name:"Comprador Técnico",   desc:"Compre 5 upgrades no total.",               check:(s)=> Object.values(s.owned||{}).reduce((a,b)=>a+(b||0),0) >= 5 },
  { id:"upgrades_10", name:"Arsenal Completo",    desc:"Compre 10 upgrades no total.",              check:(s)=> Object.values(s.owned||{}).reduce((a,b)=>a+(b||0),0) >= 10 },
  { id:"first_spec",  name:"Especialista",        desc:"Desbloqueie o primeiro perk de especialização.", check:(s)=>{ const e=Object.values(s.spec?.eng||{}).reduce((a,b)=>a+(b||0),0); const m=Object.values(s.spec?.max||{}).reduce((a,b)=>a+(b||0),0); return e+m >= 1; } },

  // === Eventos & Sobrevivência ===
  { id:"event_veteran",    name:"Veterano de Eventos",  desc:"Sobreviva a 10 eventos na rede.",      check:()=> (stats.totalEvents||0) >= 10 },
  { id:"deficit_survivor", name:"Sobrevivente",         desc:"Recupere seu saldo depois de ficar negativo (SAT < 0).", check:(s)=> s.hadNegativeSat && s.sat > 0 },
];

function pushLog(msg){
  state.log.unshift({ t: Date.now(), msg });
  if(state.log.length > 80) state.log.length = 80;
}
function unlockAchievement(id){
  if(achUnlocked[id]) return;
  achUnlocked[id] = true;
  saveAch();
  const a = ACHIEVEMENTS.find(x=>x.id===id);
  if(a){
    toast(`Conquista: ${a.name}`);
    pushLog(`🏆 Conquista desbloqueada: ${a.name}`);
  }
}
function checkAchievements(){
  for(const a of ACHIEVEMENTS){
    if(!achUnlocked[a.id] && a.check(state)) unlockAchievement(a.id);
  }
}


// ==================================================
// SECTION: Especializações (Patch 0.5)
// ==================================================
const SPEC = {
  capTotal: 18,
  engineer: [
    { id:"a", name:"Grid Tuning", desc:"+1 nível = -4% custo de energia", max:5, apply:(s,lvl)=>{ s.temp.energyCost *= (1 - 0.04*lvl); } },
    { id:"b", name:"ASIC Scheduler", desc:"+1 nível = +6% H/s", max:5, apply:(s,lvl)=>{ s.temp.hash *= (1 + 0.06*lvl); } },
    { id:"c", name:"Difficulty Dampener", desc:"+1 nível = -3% dificuldade", max:4, apply:(s,lvl)=>{ s.temp.difficulty *= (1 - 0.03*lvl); } },
    // PATCH 0.9 — perks avançados
    { id:"d", name:"Loop de Imersão", desc:"+1 nível = -5% custo de energia", max:4, apply:(s,lvl)=>{ s.temp.energyCost *= (1 - 0.05*lvl); } },
    { id:"e", name:"Firmware Quântico", desc:"+1 nível = +5% H/s e -2% dificuldade", max:3, apply:(s,lvl)=>{ s.temp.hash *= (1 + 0.05*lvl); s.temp.difficulty *= (1 - 0.02*lvl); } },
  ],
  maxi: [
    { id:"a", name:"Block Hunger", desc:"+1 nível = +5% recompensa", max:5, apply:(s,lvl)=>{ s.temp.reward *= (1 + 0.05*lvl); } },
    { id:"b", name:"Click Brutality", desc:"+1 nível = +6% PC", max:5, apply:(s,lvl)=>{ s.temp.pc *= (1 + 0.06*lvl); } },
    { id:"c", name:"Overclock Mindset", desc:"+1 nível = +4% H/s, +2% custo energia", max:4, apply:(s,lvl)=>{ s.temp.hash *= (1 + 0.04*lvl); s.temp.energyCost *= (1 + 0.02*lvl); } },
    // PATCH 0.9 — perks avançados
    { id:"d", name:"Motor da Ganância", desc:"+1 nível = +7% recompensa", max:4, apply:(s,lvl)=>{ s.temp.reward *= (1 + 0.07*lvl); } },
    { id:"e", name:"Hiper Clicker", desc:"+1 nível = +8% PC e +3% recompensa", max:3, apply:(s,lvl)=>{ s.temp.pc *= (1 + 0.08*lvl); s.temp.reward *= (1 + 0.03*lvl); } },
  ]
};

function specTotalLevels(){
  const e = state.spec?.eng ?? {};
  const m = state.spec?.max ?? {};
  const sum = (obj)=> Object.values(obj).reduce((a,b)=>a+(b||0),0);
  return sum(e) + sum(m);
}
function specAvailablePoints(){
  const total = Math.floor(state.fork?.fp || 0);
  return Math.max(0, total - specTotalLevels());
}
function applySpecialization(target){
  const s = target || state;
  if(!s.spec) return;

  for(const perk of SPEC.engineer){
    const lvl = s.spec.eng?.[perk.id] ?? 0;
    if(lvl > 0) perk.apply(s, lvl);
  }
  for(const perk of SPEC.maxi){
    const lvl = s.spec.max?.[perk.id] ?? 0;
    if(lvl > 0) perk.apply(s, lvl);
  }
}
function renderSpec(){
  // memo: só reconstrói quando FP ou níveis de perk mudam
  const sig = `${specTotalLevels()}:${state.fork?.fp || 0}`;
  if(renderSpec._sig === sig) return;
  renderSpec._sig = sig;

  const fpEl = $("specFP");
  const avEl = $("specAvail");
  if(fpEl) fpEl.textContent = fmt(state.fork?.fp || 0, 2);
  if(avEl) avEl.textContent = fmt(specAvailablePoints(), 0);

  function rowHTML(perk, tree){
    const isEng = tree === "eng";
    const lv = isEng ? (state.spec.eng?.[perk.id] ?? 0) : (state.spec.max?.[perk.id] ?? 0);
    const canBuy = specAvailablePoints() > 0 && lv < perk.max && specTotalLevels() < SPEC.capTotal;

    return `
      <div class="spec-item">
        <div>
          <div class="spec-name">${perk.name}</div>
          <div class="spec-sub">${perk.desc}</div>
        </div>
        <div style="text-align:right">
          <div class="spec-level">Lv ${lv}/${perk.max}</div>
          <button class="btn ${canBuy ? "primary" : ""}" ${canBuy ? "" : "disabled"} data-spec="${tree}:${perk.id}">
            Comprar
          </button>
        </div>
      </div>
    `;
  }

  const eng = $("specEngineer");
  const max = $("specMaxi");
  if(eng) eng.innerHTML = SPEC.engineer.map(p=>rowHTML(p,"eng")).join("");
  if(max) max.innerHTML = SPEC.maxi.map(p=>rowHTML(p,"max")).join("");

  document.querySelectorAll("[data-spec]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const [tree, id] = btn.dataset.spec.split(":");
      buySpec(tree, id);
    });
  });
}
function buySpec(tree, id){
  if(specAvailablePoints() <= 0){
    toast("Sem FP disponível.");
    playSound("error");
    return;
  }
  if(specTotalLevels() >= SPEC.capTotal){
    toast("Limite de níveis atingido.");
    playSound("error");
    return;
  }

  const list = tree === "eng" ? SPEC.engineer : SPEC.maxi;
  const perk = list.find(p=>p.id===id);
  if(!perk) return;

  const node = tree === "eng" ? state.spec.eng : state.spec.max;
  const cur = node[id] ?? 0;
  if(cur >= perk.max){
    toast("Max level.");
    playSound("error");
    return;
  }

  node[id] = cur + 1;
  toast("Perk comprado");
  playSound("buy");
  pushLog(`🧬 Perk: ${perk.name} (Lv ${node[id]})`);

  clearTemp();
  renderUI();
  renderSpec();
  SAVE.saveGame(state);
}

// --------- derived ---------
// ==================================================
// PATCH 0.6 P2 — Choice FX (multiplicadores temporários por blocos)
// ==================================================
function choiceFxMults(){
  // Patch 0.7: adicionado hashMul para evento mining_competition
  const m = { pcMul:1, hashMul:1, difficultyMul:1, energyCostMul:1, satRateMul:1 };
  const list = Array.isArray(state.choiceFx) ? state.choiceFx : [];
  for(const it of list){
    const fx = it.fx || {};
    if(typeof fx.pcMul         === "number") m.pcMul         *= fx.pcMul;
    if(typeof fx.hashMul       === "number") m.hashMul       *= fx.hashMul;
    if(typeof fx.difficultyMul === "number") m.difficultyMul *= fx.difficultyMul;
    if(typeof fx.energyCostMul === "number") m.energyCostMul *= fx.energyCostMul;
    if(typeof fx.satRateMul    === "number") m.satRateMul    *= fx.satRateMul;
  }
  return m;
}

function addChoiceFx(id, blocks, fx){
  state.choiceFx = Array.isArray(state.choiceFx) ? state.choiceFx : [];
  state.choiceFx.push({ id, blocksLeft: blocks, fx });
  pushLog(`⏳ Efeito ativo (${blocks} blocos): ${id}`);
}

function tickChoiceFxOnBlock(){
  if(!Array.isArray(state.choiceFx) || state.choiceFx.length === 0) return;
  for(const it of state.choiceFx) it.blocksLeft -= 1;
  const before = state.choiceFx.length;
  state.choiceFx = state.choiceFx.filter(it => it.blocksLeft > 0);
  if(state.choiceFx.length !== before) pushLog(`✅ Um efeito temporário expirou.`);
}

function currentDifficulty(){
  const steps = Math.floor(state.blocksMined / CONFIG.difficulty.everyNBlocks);
  const base = CONFIG.difficulty.start * Math.pow(CONFIG.difficulty.multiplier, steps);
  const fx = choiceFxMults();
  return base * state.mult.difficulty * (state.temp.difficulty ?? 1) * fx.difficultyMul;
}
function currentBlockReward(){
  const halvings = Math.floor(state.blocksMined / CONFIG.block.halvingEveryBlocks);
  const base = CONFIG.block.baseRewardSat / Math.pow(2, halvings);
  const fx = choiceFxMults();
  return Math.max(0.0001, base) * state.mult.reward * state.temp.reward * fx.satRateMul;
}
function pcValue(){
  const fx = choiceFxMults();
  return state.pcBase * state.mult.pc * state.temp.pc * state.fork.bonusMult * fx.pcMul;
}
function hashValue(deficit){
  const fx = choiceFxMults();
  const h = state.hashBase * state.mult.hash * state.temp.hash * state.fork.bonusMult * fx.hashMul;
  if(deficit && !state.features.noDeficitPenalty) return h * CONFIG.energy.deficitPenaltyHashrateMult;
  return h;
}
function energyPerSec(){ return state.energy * state.mult.energy; }
function energyCostPerSec(){ const fx = choiceFxMults();
  return energyPerSec() * CONFIG.energy.satPerEnergyPerSec * (state.mult.energyCost ?? 1) * state.temp.energyCost * fx.energyCostMul; }
function nextHalvingIn(){
  const mod = state.blocksMined % CONFIG.block.halvingEveryBlocks;
  return CONFIG.block.halvingEveryBlocks - mod;
}
function canFork(){ return state.blocksMined >= CONFIG.fork.minBlocks; }

// PATCH 0.7 — E2: dica de primeiro uso do Hard Fork
function maybeShowForkHint(){
  const btn = $("btnFork");
  if(!btn) return;
  // só na PRIMEIRA vez que o fork fica disponível, sem nenhum fork ainda
  if(canFork() && (state.fork?.totalForks ?? 0) === 0 && !uiFlags.forkHintSeen){
    uiFlags.forkHintSeen = true;
    saveUIFlags();
    btn.classList.add("fork-attn");
    toast("🧨 Hard Fork liberado! Troque o progresso por bônus permanente.");
    pushLog("🧨 Hard Fork disponível: reinicia a run em troca de FP e bônus permanente.");
  }
  // remove o destaque assim que o jogador forka pela primeira vez
  if((state.fork?.totalForks ?? 0) > 0) btn.classList.remove("fork-attn");
}

// ==================================================
// PATCH 0.8 — Tutorial guiado de primeira sessão
// ==================================================
const TUTORIAL_STEPS = [
  { sel:"#btnMine",         title:"⛏️ Minere blocos",        text:"Clique no ₿ (ou tecle Espaço) para gerar progresso. Cliques seguidos formam combo e mineram mais rápido." },
  { sel:"#progressBarWrap", title:"📊 Progresso do bloco",    text:"Quando a barra chega a 100%, você valida um bloco e ganha a recompensa em SAT." },
  { sel:"#shopList",        title:"🛒 Evolua na Loja",        text:"Gaste SAT em upgrades para aumentar poder de clique, hashrate e eficiência. Acompanhe o ROI estimado." },
  { sel:"#missionsPanel",   title:"🎯 Cumpra Missões",        text:"Complete objetivos para ganhar SAT e multiplicadores permanentes. Ótimo para acelerar o começo." },
  { sel:"#btnFork",         title:"🧨 Hard Fork (prestígio)", text:"Mais adiante, reinicie a run trocando o progresso por bônus permanente. É o ciclo de longo prazo do jogo." },
];
let _tutStep = 0;

function startTutorial(){
  if(!$("tutorialOverlay")) return;
  _tutStep = 0;
  $("tutorialOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  showTutorialStep(0);
}
function showTutorialStep(i){
  _tutStep = i;
  const step = TUTORIAL_STEPS[i];
  if(!step){ endTutorial(); return; }
  const target = document.querySelector(step.sel);
  const spot = $("tutorialSpotlight");
  const tip = $("tutorialTip");

  if($("tutorialStepNum")) $("tutorialStepNum").textContent = `Passo ${i+1} de ${TUTORIAL_STEPS.length}`;
  if($("tutorialTitle")) $("tutorialTitle").textContent = step.title;
  if($("tutorialText")) $("tutorialText").textContent = step.text;
  if($("tutorialNext")) $("tutorialNext").textContent = (i === TUTORIAL_STEPS.length - 1) ? "Concluir" : "Próximo";

  if(!target){ // alvo ausente: centraliza o tip sem spotlight
    if(spot) spot.style.display = "none";
    if(tip){ tip.style.left = "50%"; tip.style.top = "50%"; tip.style.transform = "translate(-50%,-50%)"; }
    return;
  }

  target.scrollIntoView({ block:"center", behavior:"instant" });
  // posiciona após o scroll assentar
  requestAnimationFrame(()=>{
    const r = target.getBoundingClientRect();
    const pad = 8;
    if(spot){
      spot.style.display = "block";
      spot.style.left = `${r.left - pad}px`;
      spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad*2}px`;
      spot.style.height = `${r.height + pad*2}px`;
    }
    if(tip){
      tip.style.transform = "none";
      const tipW = 320;
      let left = clamp(r.left + r.width/2 - tipW/2, 12, window.innerWidth - tipW - 12);
      let top = r.bottom + 14;
      // se não couber abaixo, posiciona acima
      if(top + 160 > window.innerHeight) top = Math.max(12, r.top - 175);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }
  });
}
function nextTutorialStep(){ showTutorialStep(_tutStep + 1); }
function endTutorial(){
  if($("tutorialOverlay")) $("tutorialOverlay").hidden = true;
  document.body.style.overflow = "";
  uiFlags.tutorialDone = true;
  saveUIFlags();
}
function maybeStartTutorial(){
  if(!uiFlags.tutorialDone) startTutorial();
}

function calcFP(blocks){ return Math.sqrt(blocks / 10); }

// --------- ROI ---------
function estimateNetSatPerSec(){
  const D = currentDifficulty();
  const deficit = state.sat < 0;
  const h = hashValue(deficit);
  const reward = currentBlockReward();
  const blocksPerSec = (h / D) / 100;
  const mining = blocksPerSec * reward;
  const cost = energyCostPerSec();
  return mining - cost;
}
function estimateNetSatPerSecFromClone(clone){
  const Dsteps = Math.floor(clone.blocksMined / CONFIG.difficulty.everyNBlocks);
  const Dbase = CONFIG.difficulty.start * Math.pow(CONFIG.difficulty.multiplier, Dsteps);
  const Dclone = Dbase * (clone.mult?.difficulty ?? 1) * (clone.temp?.difficulty ?? 1);

  const halvings = Math.floor(clone.blocksMined / CONFIG.block.halvingEveryBlocks);
  const rbase = CONFIG.block.baseRewardSat / Math.pow(2, halvings);
  const rclone = Math.max(0.0001, rbase) * (clone.mult?.reward ?? 1) * (clone.temp?.reward ?? 1);

  const deficit = (clone.sat < 0) && !(clone.features?.noDeficitPenalty);
  const hcloneBase = (clone.hashBase ?? 0) * (clone.mult?.hash ?? 1) * (clone.temp?.hash ?? 1) * (clone.fork?.bonusMult ?? 1);
  const hclone = deficit ? hcloneBase * CONFIG.energy.deficitPenaltyHashrateMult : hcloneBase;

  const eclone = (clone.energy ?? 0) * (clone.mult?.energy ?? 1);
  const ecclone = eclone * CONFIG.energy.satPerEnergyPerSec * (clone.mult?.energyCost ?? 1) * (clone.temp?.energyCost ?? 1);

  const blocksPerSec = (hclone / Dclone) / 100;
  return (blocksPerSec * rclone) - ecclone;
}
function simulateUpgradeDelta(id){
  const u = UPGRADES.find(x=>x.id===id);
  // defensivo: id inexistente ou upgrade sem apply() não quebra a loja
  if(!u || typeof u.apply !== "function") return { delta:0, roiSec:Infinity };

  const qty = state.owned[id] ?? 0;
  if(u.type === "unique" && qty >= 1) return { delta:0, roiSec:Infinity };

  const net0 = estimateNetSatPerSec();

  const clone = JSON.parse(JSON.stringify(state));
  clone.mult = clone.mult ?? { pc:1, hash:1, energy:1, difficulty:1, reward:1, energyCost:1 };
  if(clone.mult.energyCost == null) clone.mult.energyCost = 1;
  clone.temp = { pc:1, hash:1, energyCost:1, reward:1, difficulty:1 };
  clone.features = clone.features ?? { autoClick:false, noDeficitPenalty:false };
  clone.fork = clone.fork ?? { bonusMult:1 };

  applySpecialization(clone);   // espelha o real: perks vivem no temp
  u.apply(clone);

  const net1 = estimateNetSatPerSecFromClone(clone);
  const delta = net1 - net0;

  const cost = priceFor(u, qty);
  return { delta, roiSec: delta > 0 ? (cost / delta) : Infinity };
}


// ==================================================
// SECTION: Eventos
// ==================================================
function clearTemp(){
  state.temp = { pc:1, hash:1, energyCost:1, reward:1, difficulty:1 };
  applySpecialization();      // perks sempre re-aplicados (idempotente, vivem no temp)
  reapplyActiveEvent();       // não perde o efeito de um evento temporizado ativo
}
function reapplyActiveEvent(){
  if(!state.activeEvent) return;
  const ev = EVENTS.find(e => e.id === state.activeEvent.id);
  // Patch 0.7: usa dur>0 em vez de id!=="lucky" — cobre todos os instantâneos
  if(ev && ev.dur > 0) ev.start(state);
}
const RARITY_LABEL = { common: "", rare: "⭐ RARO", epic: "💎 ÉPICO" };
function startEvent(ev){
  const rarity = ev.rarity || "common";
  if(ev.dur > 0){
    state.activeEvent = { id: ev.id, endsAt: Date.now() + ev.dur * 1000 };
  }
  ev.start(state);
  if($("eventTag")){
    $("eventTag").hidden = false;
    $("eventTag").textContent = (RARITY_LABEL[rarity] ? RARITY_LABEL[rarity] + " • " : "") + ev.tag;
    $("eventTag").className = `pill event-${rarity}`;
  }
  const prefix = rarity === "epic" ? "💎 ÉPICO! " : rarity === "rare" ? "⭐ Raro! " : "";
  toast(prefix + ev.name);
  playSound("event");
  pushLog(`${rarity === "epic" ? "💎" : rarity === "rare" ? "⭐" : "✨"} Evento${rarity !== "common" ? ` (${rarity})` : ""}: ${ev.name}`);
  stats.totalEvents = (stats.totalEvents || 0) + 1;
  // PATCH 1.0 — conta por raridade
  if(rarity === "epic") stats.eventsEpic = (stats.eventsEpic || 0) + 1;
  else if(rarity === "rare") stats.eventsRare = (stats.eventsRare || 0) + 1;
  else stats.eventsCommon = (stats.eventsCommon || 0) + 1;

  // flash de tela para épicos
  if(rarity === "epic") flashEpic();

  // Instantâneo: limpa activeEvent e esconde tag após 1.2s
  if(ev.dur === 0){
    state.activeEvent = null;
    setTimeout(()=>{ if($("eventTag")) $("eventTag").hidden = true; }, 1200);
  }

  // A3/0.9: chuva de ₿ no Bull Run e em qualquer evento épico
  if(ev.id === "bull" || rarity === "epic"){
    startBitcoinRain();
    if(ev.dur === 0) setTimeout(stopBitcoinRain, 3000); // épico instantâneo: rajada curta
  } else {
    stopBitcoinRain();
  }
}
// PATCH 0.9 — flash visual para eventos épicos
function flashEpic(){
  if(ACCESS.reduceMotion) return;
  const el = document.createElement("div");
  el.className = "epic-flash";
  document.body.appendChild(el);
  el.addEventListener("animationend", ()=> el.remove(), { once:true });
}
// PATCH 0.9 — seleção ponderada por raridade
const RARITY_WEIGHTS = { common: 75, rare: 20, epic: 5 };
function pickWeightedEvent(){
  const r = Math.random() * 100;
  const tier = r < RARITY_WEIGHTS.common ? "common"
             : r < (RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare) ? "rare"
             : "epic";
  const pool = EVENTS.filter(e => (e.rarity || "common") === tier);
  if(!pool.length) return EVENTS[Math.floor(Math.random() * EVENTS.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}
function maybeTriggerEvent(){
  if(Math.random() >= CONFIG.block.eventChancePerBlock) return;
  state.activeEvent = null;           // evita empilhar com um evento anterior ainda ativo
  clearTemp();
  startEvent(pickWeightedEvent());
}
function updateEvent(){
  if(!state.activeEvent) return;
  if(Date.now() >= state.activeEvent.endsAt){
    state.activeEvent = null;
    clearTemp();
    if($("eventTag")){ $("eventTag").hidden = true; $("eventTag").className = "pill"; }
    // 0.9: garante parar a chuva (Bull Run ou épicos timed)
    stopBitcoinRain();
    pushLog("⏱️ Evento terminou");
    toast("Evento terminou");
  }
}

// --------- Solo vs Pool ---------
// ==================================================
// PATCH 0.6 P2 — Eventos com escolha (hardcore)
// - aparecem pós-bloco (com cooldown)
// - aplicam efeitos temporários e/ou permanentes
// ==================================================
const CHOICE_EVENTS = [
  {
    id: "congestion",
    title: "Congestionamento da Rede",
    desc: "A mempool está lotada. Você ajusta a estratégia agora.",
    a: {
      name: "Pagar taxa extra",
      tag: "Consistência",
      lines: ["-5% SAT/s por 30 blocos"],
      apply: () => addChoiceFx("fee_paid", 30, { satRateMul: 0.95 }),
    },
    b: {
      name: "Ignorar e esperar",
      tag: "Risco",
      lines: ["+20% dificuldade por 15 blocos"],
      apply: () => addChoiceFx("fee_skip", 15, { difficultyMul: 1.20 }),
    },
  },
  {
    id: "overclock",
    title: "Oportunidade de Overclock",
    desc: "Um perfil agressivo pode acelerar sua run, mas cobra um preço.",
    a: {
      name: "Aceitar overclock",
      tag: "Burst",
      lines: ["+25% PC por 20 blocos", "Depois: -10% PC permanente"],
      apply: () => {
        addChoiceFx("oc_burst", 20, { pcMul: 1.25 });
        state.mult.pc *= 0.90;
        pushLog("🔥 Overclock aceito: burst temporário e desgaste permanente (-10% PC).");
      },
    },
    b: {
      name: "Recusar",
      tag: "Estável",
      lines: ["+5% H/s permanente"],
      apply: () => {
        state.mult.hash *= 1.05;
        pushLog("🧊 Overclock recusado: +5% H/s permanente.");
      },
    },
  },
  {
    id: "cold_snap",
    title: "Queda de Temperatura",
    desc: "O ambiente resfriou — chance de economizar ou fortalecer a operação.",
    a: {
      name: "Aproveitar resfriamento",
      tag: "Economia",
      lines: ["-30% custo de energia por 10 blocos"],
      apply: () => addChoiceFx("cold_save", 10, { energyCostMul: 0.70 }),
    },
    b: {
      name: "Ignorar e reforçar",
      tag: "Resiliência",
      lines: ["+10% RB permanente", "+4% D permanente"],
      apply: () => {
        state.mult.reward *= 1.10;
        state.mult.difficulty *= 1.04;
        pushLog("🧱 Reforço aplicado: +10% RB e +4% D permanentes.");
      },
    },
  },

  // === PATCH 0.7 — 3 novos eventos com escolha ===
  {
    id: "regulation",
    title: "Pressão Regulatória",
    desc: "Autoridades exigem conformidade. Pagar agora evita sanções maiores.",
    a: {
      name: "Pagar a multa",
      tag: "Conformidade",
      lines: ["-10% do SAT atual (mín. 50 SAT)", "Sem penalidade de dificuldade"],
      apply: () => {
        const fine = Math.max(50, Math.floor(state.sat * 0.10));
        state.sat -= fine;
        pushLog(`🏛️ Multa paga: ${fine} SAT. Operação regularizada.`);
      },
    },
    b: {
      name: "Ignorar e continuar",
      tag: "Risco",
      lines: ["+30% dificuldade por 20 blocos"],
      apply: () => {
        addChoiceFx("reg_ignore", 20, { difficultyMul: 1.30 });
        pushLog("⚠️ Regulação ignorada: +30% D por 20 blocos.");
      },
    },
  },
  {
    id: "mining_competition",
    title: "Competição de Mining",
    desc: "Uma pool abriu vagas. Você pode aderir ou competir diretamente.",
    a: {
      name: "Entrar na pool",
      tag: "Estável",
      lines: ["+15% H/s por 25 blocos", "-10% RB por 25 blocos"],
      apply: () => {
        addChoiceFx("pool_join", 25, { hashMul: 1.15, satRateMul: 0.90 });
        pushLog("🤝 Pool aderida: +15% H/s e -10% RB por 25 blocos.");
      },
    },
    b: {
      name: "Competir solo",
      tag: "Agressivo",
      lines: ["+20% RB por 25 blocos", "+15% dificuldade por 25 blocos"],
      apply: () => {
        addChoiceFx("solo_comp", 25, { satRateMul: 1.20, difficultyMul: 1.15 });
        pushLog("🔴 Competindo solo: +20% RB e +15% D por 25 blocos.");
      },
    },
  },
  {
    id: "hw_offer",
    title: "Oferta de Hardware",
    desc: "Um lote de equipamentos está disponível por tempo limitado.",
    a: {
      name: "Comprar o lote",
      tag: "Investimento",
      lines: ["-500 SAT", "+25% H/s permanente"],
      apply: () => {
        state.sat -= 500;
        state.mult.hash *= 1.25;
        pushLog("🔧 Hardware adquirido: -500 SAT, +25% H/s permanente.");
      },
    },
    b: {
      name: "Recusar a oferta",
      tag: "Conservador",
      lines: ["+10% RB permanente"],
      apply: () => {
        state.mult.reward *= 1.10;
        pushLog("🧊 Oferta recusada: +10% RB permanente como alternativa.");
      },
    },
  },
];

let pendingChoiceEvent = null;
let eventChoiceListenersBound = false;

function openEventChoiceModal(){
  const m = $("eventChoiceModal");
  if(m) m.hidden = false;
}
function closeEventChoiceModal(){
  const m = $("eventChoiceModal");
  if(pendingChoiceEvent){
    toast("Escolha A ou B para continuar.");
    return;
  }
  if(m) m.hidden = true;
}

function renderEventChoiceModal(ev){
  $("evTitle").textContent = ev.title;
  $("evDesc").textContent = ev.desc;

  $("evAName").textContent = ev.a.name;
  $("evATag").textContent  = ev.a.tag;
  $("evAList").innerHTML = ev.a.lines.map(x => `<li>${x}</li>`).join("");

  $("evBName").textContent = ev.b.name;
  $("evBTag").textContent  = ev.b.tag;
  $("evBList").innerHTML = ev.b.lines.map(x => `<li>${x}</li>`).join("");
}

function chooseEvent(which){
  if(!pendingChoiceEvent) return;
  const ev = pendingChoiceEvent;
  pendingChoiceEvent = null;

  if(which === "A") ev.a.apply();
  else ev.b.apply();

  pushLog(`🧾 Escolha tomada: ${ev.id} (${which})`);
  playSound("event");
  closeEventChoiceModal();
  renderUI();
  renderLog();
}

function bindEventChoiceListeners(){
  if(eventChoiceListenersBound) return;

  const btnA = $("evAButton");
  const btnB = $("evBButton");
  const btnClose = $("btnCloseEventChoice");

  if(btnA){
    btnA.addEventListener("click", (e)=>{
      e.preventDefault();
      chooseEvent("A");
    });
  }

  if(btnB){
    btnB.addEventListener("click", (e)=>{
      e.preventDefault();
      chooseEvent("B");
    });
  }

  if(btnClose){
    btnClose.addEventListener("click", (e)=>{
      e.preventDefault();
      closeEventChoiceModal();
    });
  }

  eventChoiceListenersBound = true;
}

function maybeTriggerChoiceEvent(){
  if(state.blocksMined < (state.choiceCooldownUntilBlock || 0)) return;

  const m = $("eventChoiceModal");
  if(m && !m.hidden) return;

  const choice = $("choiceModal");
  if(choice && !choice.hidden) return;

  if(Math.random() > CONFIG.block.choiceEventChancePerBlock) return;

  const ev = CHOICE_EVENTS[Math.floor(Math.random() * CHOICE_EVENTS.length)];
  if(!ev) return;

  pendingChoiceEvent = ev;
  state.choiceLastBlock = state.blocksMined;
  state.choiceCooldownUntilBlock = state.blocksMined + CONFIG.block.choiceEventCooldownBlocks;

  pushLog(`🎲 Evento: ${ev.title}`);
  renderEventChoiceModal(ev);
  openEventChoiceModal();
}

// HUD: efeitos ativos
function renderChoiceFxHUD(){
  const root = $("fxList");
  const hint = $("fxHint");
  if(!root) return;

  const list = Array.isArray(state.choiceFx) ? state.choiceFx : [];
  if(list.length === 0){
    root.innerHTML = `<div class="muted small">Nenhum efeito temporário ativo.</div>`;
    if(hint) hint.textContent = "Eventos temporários e permanentes";
    return;
  }

  if(hint) hint.textContent = `${list.length} efeito(s) temporário(s) ativo(s)`;
  root.innerHTML = "";

  const pill = (txt) => `<span class="fx-pill">${txt}</span>`;

  for(const it of list){
    const fx = it.fx || {};
    const pills = [];
    if(typeof fx.pcMul         === "number" && fx.pcMul         !== 1) pills.push(pill(`PC ×${fx.pcMul.toFixed(2)}`));
    if(typeof fx.hashMul       === "number" && fx.hashMul       !== 1) pills.push(pill(`H/s ×${fx.hashMul.toFixed(2)}`));
    if(typeof fx.difficultyMul === "number" && fx.difficultyMul !== 1) pills.push(pill(`D ×${fx.difficultyMul.toFixed(2)}`));
    if(typeof fx.energyCostMul === "number" && fx.energyCostMul !== 1) pills.push(pill(`⚡ ×${fx.energyCostMul.toFixed(2)}`));
    if(typeof fx.satRateMul    === "number" && fx.satRateMul    !== 1) pills.push(pill(`SAT/s ×${fx.satRateMul.toFixed(2)}`));

    const row = document.createElement("div");
    row.className = "fx-row";
    row.innerHTML = `
      <div>
        <div class="fx-name">${it.id}</div>
        <div class="fx-meta">${pills.join("") || pill("Efeito")}</div>
      </div>
      <div class="fx-time">${it.blocksLeft} blocos</div>
    `;
    root.appendChild(row);
  }
}

function openChoiceModal(){
  if(!$("choiceModal")) return;
  $("choiceModal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeChoiceModal(){
  if(!$("choiceModal")) return;
  $("choiceModal").hidden = true;
  document.body.style.overflow = "";
}
function applyPathChoice(choice){
  if(state.path) return;
  state.path = choice;

  if(choice === "solo"){
    state.mult.reward *= 1.30;
    state.mult.difficulty *= 1.25;
    pushLog("🔴 Escolha irreversível: Minerador Solo (+RB, +D)");
  }else{
    state.mult.difficulty *= 0.80;
    state.mult.reward *= 0.85;
    pushLog("🔵 Escolha irreversível: Pool de Mineração (-D, -RB)");
  }

  toast("Escolha aplicada");
  unlockAchievement("choice_made");
  closeChoiceModal();
  renderShop();
  renderUI();
}


// ==================================================
// SECTION: Loja / Upgrades
// - Depende de window.UPGRADES (upgrades.js)
// ==================================================
function getUpgradesForTab(tab){
  return UPGRADES.filter(u => u.tab === tab && (u.visible?.(state) ?? true));
}
function ownedQty(id){ return state.owned[id] ?? 0; }
function isUniqueOwned(u){ return u.type === "unique" && ownedQty(u.id) >= 1; }

// PATCH 0.8 — "Próximo desbloqueio": quantos blocos faltam para um upgrade aparecer
function blocksNeededFor(u){
  if(u.visible?.(state) ?? true) return null; // já visível
  const probe = { ...state };
  const cur = state.blocksMined;
  for(let b = cur + 1; b <= cur + 2000; b++){
    probe.blocksMined = b;
    if(u.visible?.(probe)) return b - cur;
  }
  return null; // gate não depende de blocos (ex.: energia)
}
function nextUnlockInfo(tab){
  const hidden = UPGRADES.filter(u => u.tab === tab && !(u.visible?.(state) ?? true));
  let best = null;
  for(const u of hidden){
    const need = blocksNeededFor(u);
    if(need == null) continue;
    if(best == null || need < best.need) best = { u, need };
  }
  return best;
}

function renderShop(){
  const list = $("shopList");
  if(!list) return;
  list.innerHTML = "";

  const ups = getUpgradesForTab(state.ui.tab);
  const teaser = nextUnlockInfo(state.ui.tab);

  if(ups.length === 0 && !teaser){
    list.innerHTML = `<div class="muted small">Nada aqui ainda. Continue minerando…</div>`;
    return;
  }

  for(const u of ups){
    const qty = ownedQty(u.id);
    const disabled = isUniqueOwned(u);

    const cost = priceFor(u, qty);
    const afford = state.sat >= cost && !disabled;

    const sim = simulateUpgradeDelta(u.id);
    const roiText = sim.roiSec === Infinity ? "ROI: —" : `ROI: ${fmtTime(sim.roiSec)}`;

    const el = document.createElement("div");
    el.className = "shop-item";
    el.innerHTML = `
      <div>
        <div class="shop-name">${u.name}</div>
        <div class="shop-desc">${u.desc}</div>
        <div class="shop-meta">
          <span class="pill btc">Custo: ${fmtBig(cost)} SAT</span>
          <span class="pill">${u.effectLabel ? u.effectLabel(state) : ""}</span>
          <span class="pill">${roiText}</span>
        </div>
      </div>
      <div class="shop-actions">
        <button class="btn ${afford ? "primary" : ""}" ${afford ? "" : "disabled"} data-buy="${u.id}">
          ${disabled ? "Comprado" : "Comprar"}
        </button>
        <div class="qty">Qtd: ${qty}</div>
      </div>
    `;

    el.querySelector("[data-buy]").addEventListener("click", () => buyUpgrade(u.id));
    list.appendChild(el);
  }

  // PATCH 0.8 — card-fantasma do próximo desbloqueio
  if(teaser){
    const t = document.createElement("div");
    t.className = "shop-item shop-locked";
    t.innerHTML = `
      <div>
        <div class="shop-name">🔒 ${teaser.u.name}</div>
        <div class="shop-desc">Bloqueado — continue minerando para liberar.</div>
        <div class="shop-meta">
          <span class="pill">Desbloqueia em ${fmtBig(teaser.need)} bloco${teaser.need > 1 ? "s" : ""}</span>
        </div>
      </div>
      <div class="shop-actions">
        <button class="btn" disabled>🔒</button>
        <div class="qty">bloco ${fmtBig(state.blocksMined + teaser.need)}</div>
      </div>
    `;
    list.appendChild(t);
  }
}

function buyUpgrade(id){
  const u = UPGRADES.find(x => x.id === id);
  if(!u) return;
  const qty = ownedQty(id);

  if(u.type === "unique" && qty >= 1){
    toast("Você já comprou isso.");
    playSound("error");
    return;
  }
  const cost = priceFor(u, qty);
  if(state.sat < cost){
    toast("SAT insuficiente.");
    playSound("error");
    return;
  }

  state.sat -= cost;
  state.owned[id] = qty + 1;
  u.apply(state);

  toast("Upgrade comprado");
  playSound("buy");
  pushLog(`🛒 Comprou: ${u.name}`);
  renderShop();
  renderUI();
}


// ==================================================
// SECTION: Loop do jogo
// ==================================================
function addProgress(amount){
  state.blockProgress += amount;
  if(state.blockProgress >= 100){
    while(state.blockProgress >= 100){
      state.blockProgress -= 100;
      onBlockMined();
      if(state.blocksMined % 5 === 0) renderShop();
    }
  }
}

function onBlockMined(){
  playSound("block");

  const reward = currentBlockReward();
  state.sat += reward;
  state.blocksMined += 1;

  if(state.blocksMined > stats.bestRunBlocks) stats.bestRunBlocks = state.blocksMined;

  maybeTriggerEvent();

  // PATCH 0.6 P2 — tick de efeitos temporários + chance de evento com escolha
  tickChoiceFxOnBlock();
  maybeTriggerChoiceEvent();

  if(state.blocksMined % CONFIG.difficulty.everyNBlocks === 0){
    toast(`Dificuldade aumentou`);
    pushLog(`📈 Dificuldade aumentou (blocos: ${state.blocksMined})`);
  }
  if(state.blocksMined % CONFIG.block.halvingEveryBlocks === 0){
    toast(`Halving aplicado`);
    pushLog(`🪓 Halving aplicado (blocos: ${state.blocksMined})`);
  }

  // D2: halving warning — aviso quando ≤5 blocos para o próximo halving
  const halvLeft = nextHalvingIn();
  if(halvLeft <= 5 && halvLeft > 0){
    toast(`⚠️ Halving em ${halvLeft} bloco${halvLeft > 1 ? "s" : ""}!`);
  }

  // D3: mini-milestone a cada 25 blocos (exceto nos halvings que já têm aviso)
  if(state.blocksMined % 25 === 0 && state.blocksMined % CONFIG.block.halvingEveryBlocks !== 0){
    const bonus = Math.floor(50 + state.blocksMined * 0.5);
    state.sat += bonus;
    toast(`🏅 Marco: ${fmtBig(state.blocksMined)} blocos! +${fmtBig(bonus)} SAT`);
    pushLog(`🏅 Mini-marco atingido: ${fmtBig(state.blocksMined)} blocos — bônus de +${fmtBig(bonus)} SAT!`);
  }

  if(state.blocksMined >= 100 && !state.path){
    pushLog("🧭 Decisão disponível: Solo vs Pool");
    openChoiceModal();
  }
}

// ==================================================
// PATCH 0.7 — D1: Click Combo System
// ==================================================
let _clickCombo = 0;
let _lastClickTime = 0;
const COMBO_TIMEOUT_MS = 1500;
const COMBO_MAX = 8;

// PATCH 1.0 — trava o autosave enquanto restauramos um backup (evita
// que o loop regrave o estado em memória por cima do backup antes do reload)
let _restoringBackup = false;

// PATCH 1.0 — histórico de SAT da sessão (para o gráfico de stats)
const SAT_HISTORY_MAX = 120;
const SAT_SAMPLE_MS = 2000;
let _satHistory = [];
let _lastSatSample = 0;
function sampleSatHistory(){
  const now = Date.now();
  if(now - _lastSatSample < SAT_SAMPLE_MS) return;
  _lastSatSample = now;
  _satHistory.push({ t: now, sat: state.sat });
  if(_satHistory.length > SAT_HISTORY_MAX) _satHistory.shift();
}

function getComboMult(){
  // 1.0 → 2.0 linear across 0→COMBO_MAX
  return 1.0 + (_clickCombo / COMBO_MAX);
}

function updateComboDisplay(){
  const el = $("comboDisplay");
  if(!el) return;
  if(_clickCombo <= 1){ el.hidden = true; return; }
  el.hidden = false;
  const mult = getComboMult();
  el.className = "combo-display" + (_clickCombo >= COMBO_MAX ? " max" : "");
  el.textContent = `⚡ COMBO ×${fmt(mult, 2)} (${_clickCombo} cliques)`;
  // retrigger animation
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

// ==================================================
// PATCH 0.7 — A2: Partículas flutuantes ₿
// ==================================================
function spawnParticle(x, y){
  if(ACCESS.reduceMotion) return;
  const canvas = $("particleCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "btc-particle";
  el.textContent = "₿";
  const dx = (Math.random() - 0.5) * 80;
  const dy = -(40 + Math.random() * 60);
  const rot = (Math.random() - 0.5) * 40 + "deg";
  const dur = (0.6 + Math.random() * 0.5) + "s";
  el.style.cssText = `left:${x - rect.left}px;top:${y - rect.top}px;--dx:${dx}px;--dy:${dy}px;--rot:${rot};--dur:${dur};`;
  canvas.appendChild(el);
  el.addEventListener("animationend", ()=> el.remove(), { once:true });
}

// ==================================================
// PATCH 0.7 — A3: Bitcoin rain durante Bull Run
// ==================================================
let _rainInterval = null;
function startBitcoinRain(){
  if(ACCESS.reduceMotion) return;
  stopBitcoinRain();
  _rainInterval = setInterval(()=>{
    const el = document.createElement("span");
    el.className = "rain-coin";
    el.textContent = "₿";
    el.style.left = (Math.random() * 100) + "vw";
    el.style.animationDuration = (2.5 + Math.random() * 3) + "s";
    el.style.fontSize = (14 + Math.random() * 14) + "px";
    el.style.opacity = (0.4 + Math.random() * 0.5);
    document.body.appendChild(el);
    el.addEventListener("animationend", ()=> el.remove(), { once:true });
  }, 280);
}
function stopBitcoinRain(){
  if(_rainInterval){ clearInterval(_rainInterval); _rainInterval = null; }
  document.querySelectorAll(".rain-coin").forEach(el => el.remove());
}

function clickMine(){
  stats.totalClicks += 1;

  // D1: combo tracking
  const now = Date.now();
  if(now - _lastClickTime <= COMBO_TIMEOUT_MS){
    _clickCombo = Math.min(_clickCombo + 1, COMBO_MAX);
  } else {
    _clickCombo = 1;
  }
  _lastClickTime = now;
  updateComboDisplay();

  const D = currentDifficulty();
  const p = pcValue() * getComboMult();
  addProgress(p / D);

  playSound("click");
  if(MUSIC.enabled) startMusic();

  // A2: partícula no botão
  const bm = $("btnMine");
  if(bm){
    const r = bm.getBoundingClientRect();
    spawnParticle(r.left + r.width/2, r.top + r.height/2);
    bm.style.transform = "translateY(1px) scale(.97)";
    setTimeout(()=> bm.style.transform = "", 80);
  }
}

function update(dt){
  updateEvent();

  stats.totalSeconds += dt;
  stats.runSeconds += dt;
  if(state.sat > stats.peakSat) stats.peakSat = state.sat;
  sampleSatHistory();

  const deficit = state.sat < 0;
  if(deficit && !state.hadNegativeSat) state.hadNegativeSat = true;
  if($("profitTag")) $("profitTag").hidden = !deficit;

  const D = currentDifficulty();
  const h = hashValue(deficit);
  addProgress((h * dt) / D);

  state.sat -= energyCostPerSec() * dt;

  if(state.features.autoClick){
    if(Date.now() - state.lastAutoClick >= 5000){
      state.lastAutoClick = Date.now();
      addProgress(pcValue() / D);
    }
  }

  // D1: reset combo if idle too long
  if(_clickCombo > 0 && Date.now() - _lastClickTime > COMBO_TIMEOUT_MS){
    _clickCombo = 0;
    updateComboDisplay();
  }

  if(!_restoringBackup && Date.now() - state.lastSave >= CONFIG.autosaveMs){
    SAVE.saveGame(state);
    state.lastSave = Date.now();
    if($("saveInfo")) $("saveInfo").textContent = `Salvo • ${new Date().toLocaleTimeString("pt-BR")}`;
    saveStats();
    updateBackupInfo();
  }

  checkAchievements();
}

// PATCH 1.0 — exibe horário do último backup automático
function updateBackupInfo(){
  const el = $("backupInfo");
  if(!el) return;
  const when = SAVE.hasBackup() ? SAVE.backupInfo() : null;
  el.textContent = when
    ? `💾 Backup automático: ${new Date(when).toLocaleString("pt-BR")}`
    : "💾 Backup automático: ainda não criado";
}

// ==================================================
// PATCH 1.0 — Tela de Estatísticas / gráficos
// ==================================================
let _statsRefreshTimer = null;
function openStatsModal(){
  const m = $("statsModal");
  if(!m) return;
  renderStatsModal();
  m.hidden = false;
  document.body.style.overflow = "hidden";
  if(_statsRefreshTimer) clearInterval(_statsRefreshTimer);
  _statsRefreshTimer = setInterval(renderStatsModal, 1500);
}
function closeStatsModal(){
  const m = $("statsModal");
  if(!m) return;
  m.hidden = true;
  document.body.style.overflow = "";
  if(_statsRefreshTimer){ clearInterval(_statsRefreshTimer); _statsRefreshTimer = null; }
}
function renderStatsModal(){
  if($("msPeakSat")) $("msPeakSat").textContent = fmtBig(stats.peakSat || 0) + " SAT";
  const bpm = stats.runSeconds > 0 ? (state.blocksMined / (stats.runSeconds / 60)) : 0;
  if($("msBlocksPerMin")) $("msBlocksPerMin").textContent = fmt(bpm, 2);
  if($("msClicks")) $("msClicks").textContent = fmtBig(stats.totalClicks || 0);
  if($("msForks")) $("msForks").textContent = fmt(stats.totalForks || 0, 0);

  const c = stats.eventsCommon || 0, r = stats.eventsRare || 0, e = stats.eventsEpic || 0;
  const tot = c + r + e;
  if($("msEventsTotal")) $("msEventsTotal").textContent = fmt(tot, 0);
  const maxv = Math.max(c, r, e, 1);
  if($("rbCommon")) $("rbCommon").style.width = (c / maxv * 100) + "%";
  if($("rbRare"))   $("rbRare").style.width   = (r / maxv * 100) + "%";
  if($("rbEpic"))   $("rbEpic").style.width   = (e / maxv * 100) + "%";
  if($("rnCommon")) $("rnCommon").textContent = fmt(c, 0);
  if($("rnRare"))   $("rnRare").textContent   = fmt(r, 0);
  if($("rnEpic"))   $("rnEpic").textContent   = fmt(e, 0);

  drawSatChart();
}
function drawSatChart(){
  const cv = $("satChart");
  if(!cv || !cv.getContext) return;
  const empty = $("satChartEmpty");
  const data = _satHistory;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  if(data.length < 2){
    if(empty) empty.hidden = false;
    cv.style.opacity = ".3";
    return;
  }
  if(empty) empty.hidden = true;
  cv.style.opacity = "1";

  const pad = 8;
  const sats = data.map(d => d.sat);
  let min = Math.min(...sats), max = Math.max(...sats);
  if(max === min) max = min + 1;
  const xAt = (i) => pad + (i / (data.length - 1)) * (W - 2 * pad);
  const yAt = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);

  // linha de base do zero (se 0 estiver no range)
  if(min < 0 && max > 0){
    ctx.strokeStyle = "rgba(255,255,255,.15)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, yAt(0)); ctx.lineTo(W - pad, yAt(0)); ctx.stroke();
  }

  // traço da linha
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(sats[0]));
  for(let i = 1; i < data.length; i++) ctx.lineTo(xAt(i), yAt(sats[i]));
  ctx.strokeStyle = "#f7931a";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // preenchimento abaixo da linha
  ctx.lineTo(xAt(data.length - 1), H - pad);
  ctx.lineTo(xAt(0), H - pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(247,147,26,.30)");
  grad.addColorStop(1, "rgba(247,147,26,0)");
  ctx.fillStyle = grad;
  ctx.fill();
}

function loop(){
  const now = Date.now();
  const dt = (now - state.lastTick) / 1000;
  state.lastTick = now;

  update(clamp(dt, 0, 0.5));
  renderUI();
  requestAnimationFrame(loop);
}


// ==================================================
// SECTION: UI (render)
// ==================================================
function renderAchievements(){
  const list = $("achList");
  if(!list) return;

  // memo: só reconstrói quando o nº de conquistas desbloqueadas muda
  const sig = Object.keys(achUnlocked).length;
  if(renderAchievements._sig === sig) return;
  renderAchievements._sig = sig;

  if($("achCount")) $("achCount").textContent = `${sig}/${ACHIEVEMENTS.length}`;
  list.innerHTML = "";

  for(const a of ACHIEVEMENTS){
    const ok = !!achUnlocked[a.id];
    const item = document.createElement("div");
    item.className = `ach-item ${ok ? "" : "locked"}`;
    item.innerHTML = `
      <div class="ach-title">${ok ? "✅ " : "🔒 "}${a.name}</div>
      <div class="ach-desc">${a.desc}</div>
      <div class="ach-pill ${ok ? "unlocked" : ""}">${ok ? "Desbloqueada" : "Bloqueada"}</div>
    `;
    list.appendChild(item);
  }
}

// PATCH 0.8 — render das missões (estrutura memoizada + progresso ao vivo)
function renderMissions(){
  const list = $("missionList");
  if(!list) return;

  const active = activeMissions(3);
  const claimedCount = MISSIONS.filter(m => missionClaimed[m.id]).length;
  if($("missionCount")) $("missionCount").textContent = `${claimedCount}/${MISSIONS.length}`;

  // memo: reconstrói só quando muda o conjunto de missões ativas
  const sig = active.map(m => m.id).join(",") || "all-done";
  if(renderMissions._sig !== sig){
    renderMissions._sig = sig;
    list.innerHTML = "";

    if(active.length === 0){
      list.innerHTML = `<div class="muted small">🎉 Todas as missões concluídas! Mais virão em updates futuros.</div>`;
    } else {
      for(const m of active){
        const item = document.createElement("div");
        item.className = "mission-item";
        item.dataset.id = m.id;
        item.innerHTML = `
          <div class="mission-top">
            <div class="mission-name">${m.name}</div>
            <div class="mission-reward">${m.rewardLabel}</div>
          </div>
          <div class="mission-desc">${m.desc}</div>
          <div class="mission-bar"><div class="mission-bar-fill"></div></div>
          <div class="mission-foot">
            <span class="mission-prog mono">0/0</span>
            <button class="btn mission-claim" data-claim="${m.id}" disabled>Resgatar</button>
          </div>
        `;
        list.appendChild(item);
      }
    }
  }

  updateMissionProgress();
}

// atualiza barras/labels e estado do botão a cada frame (sem reconstruir DOM)
function updateMissionProgress(){
  const list = $("missionList");
  if(!list) return;
  for(const item of list.querySelectorAll(".mission-item")){
    const m = MISSIONS.find(x => x.id === item.dataset.id);
    if(!m) continue;
    const cur = m.metric();
    const done = cur >= m.target;
    const pct = clamp((cur / m.target) * 100, 0, 100);
    const fill = item.querySelector(".mission-bar-fill");
    if(fill) fill.style.width = `${pct}%`;
    const prog = item.querySelector(".mission-prog");
    if(prog) prog.textContent = `${fmtBig(Math.min(cur, m.target))}/${fmtBig(m.target)}`;
    const btn = item.querySelector(".mission-claim");
    if(btn) btn.disabled = !done;
    item.classList.toggle("ready", done);
  }
}

function renderLog(){
  const list = $("logList");
  if(!list) return;

  // memo: só reconstrói quando o log muda (tamanho ou entrada mais recente)
  const sig = state.log.length + ":" + (state.log[0]?.t || 0);
  if(renderLog._sig === sig) return;
  renderLog._sig = sig;

  list.innerHTML = "";
  if(!state.log.length){
    list.innerHTML = `<div class="muted small">Sem eventos ainda…</div>`;
    return;
  }
  for(const line of state.log){
    const el = document.createElement("div");
    el.className = "log-line";
    el.innerHTML = `
      <div class="log-time">${new Date(line.t).toLocaleString("pt-BR")}</div>
      <div>${line.msg}</div>
    `;
    list.appendChild(el);
  }
}

function renderUI(){
  if($("sat")) $("sat").textContent = fmtBig(state.sat);
  if($("btc")) $("btc").textContent = fmt(state.sat / CONFIG.SAT_PER_BTC, 8);

  const D = currentDifficulty();
  if($("difficulty")) $("difficulty").textContent = `${fmt(D, 2)}×`;

  const reward = currentBlockReward();
  if($("blockReward")) $("blockReward").textContent = fmtBig(reward);

  if($("blockPct")) $("blockPct").textContent = fmt(state.blockProgress, 1);
  if($("progressBar")) $("progressBar").style.width = `${clamp(state.blockProgress, 0, 100)}%`;
  // A4: pulso visual quando progresso > 85%
  const wrap = $("progressBarWrap");
  if(wrap) wrap.classList.toggle("near-complete", state.blockProgress >= 85);

  if($("blocksMined")) $("blocksMined").textContent = fmtBig(state.blocksMined);
  const halvLeft = nextHalvingIn();
  if($("nextHalving")) $("nextHalving").textContent = fmt(halvLeft, 0);
  // D2: destaque visual no stat de Blocos quando halving está próximo
  const halvStat = $("halvingStat");
  if(halvStat) halvStat.classList.toggle("halving-soon", halvLeft <= 5);

  const deficit = state.sat < 0;
  const h = hashValue(deficit);
  if($("hashrate")) $("hashrate").textContent = fmtBig(h, 1);

  const blocksPerSec = (h / D) / 100;
  if($("cpsSat")) $("cpsSat").textContent = fmtBig(blocksPerSec * reward, 1);

  if($("energy")) $("energy").textContent = fmtBig(energyPerSec(), 2);
  if($("energyCost")) $("energyCost").textContent = fmtBig(energyCostPerSec(), 2);

  const pc = pcValue();
  if($("pc")) $("pc").textContent = fmtBig(pc, 1);
  if($("pcEffective")) $("pcEffective").textContent = fmtBig(pc / D, 2);
  const effectivePc = pc * getComboMult();
  if($("mineSub")) $("mineSub").textContent = _clickCombo > 1
    ? `+${fmtBig(effectivePc / D, 2)} progresso/click (combo ×${fmt(getComboMult(), 2)})`
    : `+${fmtBig(pc / D, 2)} progresso/click`;

  if($("fp")) $("fp").textContent = fmt(calcFP(state.blocksMined), 2);
  if($("forkBonus")) $("forkBonus").textContent = `+${fmt((state.fork.bonusMult - 1) * 100, 1)}%`;
  if($("btnFork")) $("btnFork").disabled = !canFork();
  maybeShowForkHint();

  if(state.activeEvent){
    const ev = EVENTS.find(x => x.id === state.activeEvent.id);
    if(ev && $("eventTag")){
      const rarity = ev.rarity || "common";
      $("eventTag").hidden = false;
      $("eventTag").textContent = (RARITY_LABEL[rarity] ? RARITY_LABEL[rarity] + " • " : "") + ev.tag;
      $("eventTag").className = `pill event-${rarity}`;
    }
  }

  renderAchievements();
  renderMissions();
  renderLog();
  renderSpec();

  // stats render
  if($("bestRunTag")) $("bestRunTag").textContent = `Recorde: ${fmtBig(stats.bestRunBlocks ?? 0)}`;
  if($("statTotalTime")) $("statTotalTime").textContent = fmtDur(stats.totalSeconds);
  if($("statRunTime")) $("statRunTime").textContent = fmtDur(stats.runSeconds);
  if($("statClicks")) $("statClicks").textContent = fmtBig(stats.totalClicks);
  if($("statRunBlocks")) $("statRunBlocks").textContent = fmtBig(state.blocksMined);
  if($("statForks")) $("statForks").textContent = fmt(stats.totalForks, 0);
  if($("statPeakSat")) $("statPeakSat").textContent = `${fmtBig(stats.peakSat)} SAT`;
}

// --------- offline ---------
function applyOfflineProgress(loadedObj){
  const last = loadedObj.t;
  const now = Date.now();
  let secs = clamp((now - last) / 1000, 0, CONFIG.offline.maxSeconds);
  if(secs <= 2) return;

  // conta offline nas stats
  stats.totalSeconds += secs;
  stats.runSeconds += secs;

  const deficit = state.sat < 0;
  const hBase = hashValue(deficit) * CONFIG.offline.efficiency;

  // energia também escalada pela eficiência offline (consistente com o hash)
  state.sat -= energyCostPerSec() * CONFIG.offline.efficiency * secs;

  // minera respeitando a dificuldade crescente (sobe a cada 50 blocos),
  // sem disparar eventos/modais/som como o onBlockMined faria no boot.
  let remaining = secs;
  let blocks = 0;
  let satGained = 0;
  const MAX_OFFLINE_BLOCKS = 100000; // trava de segurança
  while(hBase > 0 && remaining > 0 && blocks < MAX_OFFLINE_BLOCKS){
    const D = currentDifficulty();
    const progPerSec = hBase / D;            // progresso/s (100 = 1 bloco)
    if(progPerSec <= 0) break;
    const needed = (100 - state.blockProgress) / progPerSec; // s p/ fechar o bloco
    if(needed > remaining){
      state.blockProgress += progPerSec * remaining;
      remaining = 0;
    } else {
      remaining -= needed;
      state.blockProgress = 0;
      satGained += currentBlockReward();
      state.blocksMined += 1;
      blocks += 1;
    }
  }
  state.sat += satGained;
  if(state.blocksMined > stats.bestRunBlocks) stats.bestRunBlocks = state.blocksMined;
  saveStats();

  pushLog(`🕒 Offline: ${Math.floor(secs)}s • +${blocks} blocos, +${fmt(satGained,0)} SAT`);
  toast(`Offline: +${blocks} blocos aplicados`);
}

  // --------- settings modal ---------

const btnOpenSettings = $("btnOpenSettings");
const btnCloseSettings = $("btnCloseSettings");
const settingsModal = $("settingsModal");

function openSettings(){
  if(!settingsModal) return;
  settingsModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSettings(){
  if(!settingsModal) return;
  settingsModal.hidden = true;
  document.body.style.overflow = "";
}

// abrir
if(btnOpenSettings){
  btnOpenSettings.addEventListener("click", (e)=>{
    e.preventDefault();
    openSettings();
  });
}

// fechar no X
if(btnCloseSettings){
  btnCloseSettings.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    closeSettings();
  });
}

// fechar clicando fora do card
if(settingsModal){
  settingsModal.addEventListener("click", (e)=>{
    if(e.target === settingsModal){
      closeSettings();
    }
  });
}

// fechar com ESC
window.addEventListener("keydown", (e)=>{
  if(e.key === "Escape" && settingsModal && !settingsModal.hidden){
    closeSettings();
  }
});

// --------- boot ---------
function boot(){
  bindEventChoiceListeners();

  loadAudio();
  loadMusic();
  loadAccess();
  loadStats();
  loadAch();
  loadUIFlags();
  loadMissions();
  loadDaily();
  applyAccess();

  initAudio();
  applyAudioSettings();

  initMusic();
  applyMusicSettings();

  const btnOpenSettings = $("btnOpenSettings");
const btnCloseSettings = $("btnCloseSettings");
const settingsModal = $("settingsModal");

if(btnOpenSettings){
  btnOpenSettings.addEventListener("click", (e)=>{
    e.preventDefault();
    openSettings();
  });
}

if(btnCloseSettings){
  btnCloseSettings.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    closeSettings();
  });
}

// ✅ fecha clicando fora do card (no fundo escuro)
if(settingsModal){
  settingsModal.addEventListener("click", (e)=>{
    if(e.target === settingsModal){
      closeSettings();
    }
  });
}

// ✅ segurança extra: qualquer elemento com data-close="settings"
document.querySelectorAll('[data-close="settings"]').forEach(el=>{
  el.addEventListener("click", (e)=>{
    e.preventDefault();
    closeSettings();
  });
});

  // FX UI
  const btnSound = $("btnSound");
  const vol = $("vol");
  if(btnSound && vol){
    btnSound.textContent = `Som: ${AUDIO.enabled ? "ON" : "OFF"}`;
    vol.value = String(Math.round(AUDIO.volume * 100));

    btnSound.addEventListener("click", ()=>{
      AUDIO.enabled = !AUDIO.enabled;
      btnSound.textContent = `Som: ${AUDIO.enabled ? "ON" : "OFF"}`;
      saveAudio();
      if(AUDIO.enabled) playSound("click");
    });

    vol.addEventListener("input", ()=>{
      AUDIO.volume = clamp(Number(vol.value) / 100, 0, 1);
      applyAudioSettings();
      saveAudio();
    });
  }

  // Music UI
  const btnMusic = $("btnMusic");
  const musicVol = $("musicVol");
  if(btnMusic && musicVol){
    btnMusic.textContent = `Música: ${MUSIC.enabled ? "ON" : "OFF"}`;
    musicVol.value = String(Math.round(MUSIC.volume * 100));

    btnMusic.addEventListener("click", async ()=>{
      MUSIC.enabled = !MUSIC.enabled;
      btnMusic.textContent = `Música: ${MUSIC.enabled ? "ON" : "OFF"}`;
      saveMusic();

      if(MUSIC.enabled){
        await startMusic();
        if(AUDIO.enabled) playSound("click");
      }else{
        stopMusic();
      }
    });

    musicVol.addEventListener("input", ()=>{
      MUSIC.volume = clamp(Number(musicVol.value) / 100, 0, 1);
      applyMusicSettings();
      saveMusic();
    });
  }

  // A11y UI
  const btnContrast = $("btnContrast");
  const btnMotion = $("btnMotion");

  if(btnContrast){
    btnContrast.textContent = `Contraste: ${ACCESS.highContrast ? "ON" : "OFF"}`;
    btnContrast.addEventListener("click", ()=>{
      ACCESS.highContrast = !ACCESS.highContrast;
      btnContrast.textContent = `Contraste: ${ACCESS.highContrast ? "ON" : "OFF"}`;
      applyAccess();
      saveAccess();
      playSound("click");
    });
  }

  if(btnMotion){
    btnMotion.textContent = `Motion: ${ACCESS.reduceMotion ? "OFF" : "ON"}`;
    btnMotion.addEventListener("click", ()=>{
      ACCESS.reduceMotion = !ACCESS.reduceMotion;
      btnMotion.textContent = `Motion: ${ACCESS.reduceMotion ? "OFF" : "ON"}`;
      applyAccess();
      saveAccess();
      playSound("click");
    });
  }

  // reset stats
  const btnResetStats = $("btnResetStats");
  if(btnResetStats){
    btnResetStats.addEventListener("click", ()=>{
      if(confirm("Zerar estatísticas? (isso não apaga seu save)")){
        stats = freshStats();
        saveStats();
        toast("Stats zeradas");
        renderUI();
      }
    });
  }

  // tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      state.ui.tab = btn.dataset.tab;
      renderShop();
    });
  });

  // mine
  if($("btnMine")) $("btnMine").addEventListener("click", clickMine);

  // reset run
  if($("btnReset")) $("btnReset").addEventListener("click", ()=>{
    localStorage.removeItem(SAVE.KEY);
    state = freshState();
    clearTemp();
    stats.runSeconds = 0;
    saveStats();
    renderShop();
    renderUI();
    toast("Resetado");
  });

  // export/import
  if($("btnExport")) $("btnExport").addEventListener("click", async ()=>{
    const raw = SAVE.exportSave() || "";
    if(!raw){
      toast("Nada para exportar.");
      playSound("error");
      return;
    }
    try{
      await navigator.clipboard.writeText(raw);
      toast("Save copiado");
    }catch{
      prompt("Copie seu save:", raw);
    }
  });

  // PATCH 1.0 — restaurar backup
  if($("btnRestoreBackup")) $("btnRestoreBackup").addEventListener("click", ()=>{
    if(!SAVE.hasBackup()){
      toast("Sem backup disponível.");
      playSound("error");
      return;
    }
    const when = SAVE.backupInfo();
    const whenStr = when ? new Date(when).toLocaleString("pt-BR") : "desconhecido";
    if(!confirm(`Restaurar o backup de ${whenStr}?\n\nO progresso atual da run será substituído pelo backup.`)) return;
    if(SAVE.restoreBackup()){
      _restoringBackup = true;   // impede o autosave de regravar por cima
      toast("Backup restaurado — recarregando…");
      setTimeout(()=> location.reload(), 600);
    } else {
      toast("Falha ao restaurar backup.");
      playSound("error");
    }
  });

  if($("btnImport")) $("btnImport").addEventListener("click", ()=>{
    const raw = prompt("Cole seu save aqui:");
    if(!raw) return;
    const ok = SAVE.importSave(raw);
    if(!ok){
      toast("Save inválido");
      playSound("error");
      return;
    }
    const loaded = SAVE.loadGame();
    if(loaded && loaded.s){
      state = Object.assign(freshState(), loaded.s);
      state.mult = state.mult ?? { pc:1, hash:1, energy:1, difficulty:1, reward:1 };
      state.temp = state.temp ?? { pc:1, hash:1, energyCost:1, reward:1 };
      state.features = state.features ?? { autoClick:false, noDeficitPenalty:false };
      state.fork = state.fork ?? { totalForks:0, fp:0, bonusMult:1 };
      state.owned = state.owned ?? {};
      state.ui = state.ui ?? { tab:"click" };
      state.log = state.log ?? [];
      state.ach = state.ach ?? { unlocked:{} };
      state.spec = state.spec ?? { eng:{a:0,b:0,c:0}, max:{a:0,b:0,c:0} };
      state.lastTick = Date.now();
      state.lastSave = Date.now();

      // migra conquistas do save importado para o meta-progresso permanente
      if(state.ach && state.ach.unlocked){
        for(const k in state.ach.unlocked){ if(state.ach.unlocked[k]) achUnlocked[k] = true; }
        saveAch();
        renderAchievements._sig = null; // força re-render do painel
      }
    }
    toast("Save importado");
    clearTemp();
    renderShop();
    renderUI();
  });

  // hard fork
  if($("btnFork")) $("btnFork").addEventListener("click", ()=>{
    if(!canFork()){
      toast("Ainda não disponível.");
      playSound("error");
      return;
    }

    stats.totalForks += 1;
    stats.bestRunBlocks = Math.max(stats.bestRunBlocks, state.blocksMined);
    saveStats();

    const fpNow = calcFP(state.blocksMined);
    const bonus = 1 + fpNow * CONFIG.fork.bonusPerFP;
    pushLog(`🧨 Hard Fork executado (+bônus permanente)`);

    const keepFork = {
      totalForks: state.fork.totalForks + 1,
      fp: state.fork.fp + fpNow,
      bonusMult: state.fork.bonusMult * bonus,
    };

    // ✅ mantém especialização
    const keepSpec = state.spec;

    state = freshState();
    state.fork = keepFork;
    state.spec = keepSpec;

    state.sat = 50;
    stats.runSeconds = 0;
    saveStats();

    clearTemp();
    renderShop();
    renderUI();
    renderSpec();

    pushLog(`✅ Nova run iniciada (Forks: ${state.fork.totalForks})`);
    toast("Hard Fork concluído");
  });

  // modal Solo/Pool
  if($("btnSolo")) $("btnSolo").addEventListener("click", () => applyPathChoice("solo"));
  if($("btnPool")) $("btnPool").addEventListener("click", () => applyPathChoice("pool"));

  // log
  if($("btnClearLog")) $("btnClearLog").addEventListener("click", ()=>{
    state.log = [];
    toast("Log limpo");
    renderLog();
  });

  // PATCH 0.8 — resgate de missões (listener delegado)
  if($("missionList")) $("missionList").addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-claim]");
    if(btn) claimMission(btn.dataset.claim);
  });

  // PATCH 0.8 — tutorial
  if($("tutorialNext")) $("tutorialNext").addEventListener("click", nextTutorialStep);
  if($("tutorialSkip")) $("tutorialSkip").addEventListener("click", endTutorial);
  if($("btnReplayTutorial")) $("btnReplayTutorial").addEventListener("click", ()=>{
    closeSettings();
    startTutorial();
  });

  // PATCH 0.9 — daily bonus
  if($("btnDaily")) $("btnDaily").addEventListener("click", openDailyModal);
  if($("btnCloseDaily")) $("btnCloseDaily").addEventListener("click", closeDailyModal);
  if($("btnClaimDaily")) $("btnClaimDaily").addEventListener("click", claimDaily);
  if($("dailyModal")) $("dailyModal").addEventListener("click", (e)=>{
    if(e.target === $("dailyModal")) closeDailyModal();
  });

  // PATCH 1.0 — stats / gráficos
  if($("btnOpenStats")) $("btnOpenStats").addEventListener("click", openStatsModal);
  if($("btnCloseStats")) $("btnCloseStats").addEventListener("click", closeStatsModal);
  if($("statsModal")) $("statsModal").addEventListener("click", (e)=>{
    if(e.target === $("statsModal")) closeStatsModal();
  });

  // keyboard shortcuts + ESC closes modals
  window.addEventListener("keydown", (e)=>{
    if(e.repeat) return;

    const key = e.key.toLowerCase();

    if(key === "escape"){
      if(!$("settingsModal")?.hidden) closeSettings();
      if(!$("choiceModal")?.hidden) closeChoiceModal();
      if(!$("dailyModal")?.hidden) closeDailyModal();
      if(!$("statsModal")?.hidden) closeStatsModal();
      return;
    }

    switch(key){
      case " ":
        e.preventDefault();
        clickMine();
        break;
      case "b": {
        const btn = document.querySelector(".shop-item .btn.primary");
        if(btn) btn.click();
        break;
      }
      case "m": {
        const bm = $("btnMusic");
        if(bm) bm.click();
        break;
      }
    }
  });

  // load save (merge seguro com defaults pra não quebrar saves antigos)
  const loaded = SAVE.loadGame();
  if(loaded && loaded.s){
    state = Object.assign(freshState(), loaded.s);

    state.lastTick = Date.now();
    state.lastSave = Date.now();
    state.lastAutoClick = state.lastAutoClick ?? Date.now();
    state.ui = state.ui ?? { tab:"click" };
    state.features = state.features ?? { autoClick:false, noDeficitPenalty:false };
    state.temp = state.temp ?? { pc:1, hash:1, energyCost:1, reward:1 };
    state.mult = state.mult ?? { pc:1, hash:1, energy:1, difficulty:1, reward:1 };
    state.fork = state.fork ?? { totalForks:0, fp:0, bonusMult:1 };
    state.spec = state.spec ?? { eng:{a:0,b:0,c:0}, max:{a:0,b:0,c:0} };
    state.log = state.log ?? [];
    state.ach = state.ach ?? { unlocked:{} };
    state.path = state.path ?? null;

    // migração: conquistas que ficavam no save da run passam para o meta-progresso permanente
    if(state.ach && state.ach.unlocked){
      for(const k in state.ach.unlocked){ if(state.ach.unlocked[k]) achUnlocked[k] = true; }
      saveAch();
    }

    clearTemp();
    applyOfflineProgress(loaded);

    // PATCH 1.0 — garante um backup de segurança no início da sessão
    if(!SAVE.hasBackup()) SAVE.snapshotBackup();
  }else{
    SAVE.saveGame(state);
  }

  clearTemp();
  renderShop();
  renderUI();
  renderSpec();

  if(state.log.length === 0) pushLog("🟢 Início da sessão");
  requestAnimationFrame(loop);

  // PATCH 0.8/0.9 — tutorial e bônus diário (após o primeiro render)
  updateDailyIndicator();
  updateBackupInfo();
  requestAnimationFrame(()=>{
    if(!uiFlags.tutorialDone){
      maybeStartTutorial();        // novato: tutorial primeiro; daily via botão 📅
    } else if(dailyAvailable()){
      openDailyModal();            // veterano: abre o bônus diário direto
    }
  });
}

// ============================================
// HOTFIX: Settings modal fecha no X / fundo / ESC
// (usa pointerdown + capture pra não ser bloqueado)
// ============================================
(function settingsCloseHotfix(){
  const getModal = () => document.getElementById("settingsModal");

  const close = () => {
    const m = getModal();
    if(!m) return;
    m.hidden = true;
    document.body.style.overflow = "";
  };

  const open = () => {
    const m = getModal();
    if(!m) return;
    m.hidden = false;
    document.body.style.overflow = "hidden";
  };

  // abrir no ⚙️
  document.addEventListener("pointerdown", (e)=>{
    const openBtn = e.target.closest("#btnOpenSettings");
    if(openBtn){
      e.preventDefault();
      open();
    }
  }, true); // ✅ capture

  // fechar no X
  document.addEventListener("pointerdown", (e)=>{
    const closeBtn = e.target.closest('[data-close-modal="settings"]');
    if(closeBtn){
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }, true); // ✅ capture

  // fechar clicando no fundo (backdrop)
  document.addEventListener("pointerdown", (e)=>{
    const m = getModal();
    if(!m || m.hidden) return;
    if(e.target === m) close();
  }, true); // ✅ capture

  // ESC fecha
  document.addEventListener("keydown", (e)=>{
    if(e.key !== "Escape") return;
    const m = getModal();
    if(m && !m.hidden) close();
  }, true);
})();

// ============================================
// A11Y: Contraste (patch seguro)
// ============================================
(function contrastPatch(){
  const KEY = "pos_contrast";

  function $(id){ return document.getElementById(id); }

  function apply(on){
    document.body.classList.toggle("contrast-on", !!on);
    const btn = $("btnContrast");
    if(btn) btn.textContent = `Contraste: ${on ? "ON" : "OFF"}`;
    localStorage.setItem(KEY, on ? "1" : "0");
  }

  // boot state
  const saved = localStorage.getItem(KEY);
  apply(saved === "1");

  // toggle
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest("#btnContrast");
    if(!btn) return;
    e.preventDefault();
    const nowOn = !document.body.classList.contains("contrast-on");
    apply(nowOn);
  });
})();



boot();

// ==================================================
// PATCH QA — Modo QA (debug para balanceamento)
// - Toggle em Configurações
// - Forçar Evento
// - +10 blocos
// - +10.000 SAT
// - Reset Run
// - Copiar debug
// ==================================================
const QA_KEY = "pos_qa_v1";
const QA = { enabled: false };

function loadQA(){
  try{
    const raw = localStorage.getItem(QA_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    QA.enabled = !!d.enabled;
  }catch{}
}
function saveQA(){
  localStorage.setItem(QA_KEY, JSON.stringify(QA));
}

function qaBuildDebugText(){
  // usa funções já existentes no game.js
  const D = currentDifficulty();
  const h = hashValue(state.sat < 0);
  const grossSatPerSec = ((h / D) / 100) * currentBlockReward();
  const energyPerSecCost = energyCostPerSec();
  const net = estimateNetSatPerSec();
  const effPc = pcValue() / D;
  const fx = (state.choiceFx || []).map(it => `${it.id} (${it.blocksLeft}b)`).join(", ") || "—";

  const lines = [
    `Run: ${state.blocksMined} blocos | Progresso: ${state.blockProgress.toFixed(1)}%`,
    `SAT: ${Math.floor(state.sat)} | BTC: ${(state.sat / CONFIG.SAT_PER_BTC).toFixed(8)}`,
    `SAT/s bruto: ${grossSatPerSec.toFixed(2)} | energia/s: ${energyPerSecCost.toFixed(2)} | líquido: ${net.toFixed(2)}`,
    `PC base: ${state.pcBase} | PC mult: ${(state.mult.pc * state.temp.pc * state.fork.bonusMult).toFixed(3)} | PC efetivo: ${effPc.toFixed(3)}`,
    `H/s base: ${state.hashBase.toFixed(2)} | H/s mult: ${(state.mult.hash * state.temp.hash * state.fork.bonusMult).toFixed(3)} | H/s efetivo: ${(state.hashBase * state.mult.hash * state.temp.hash * state.fork.bonusMult).toFixed(2)}`,
    `Dificuldade mult: ${state.mult.difficulty.toFixed(3)} | Reward mult: ${state.mult.reward.toFixed(3)} | Energia mult: ${state.mult.energy.toFixed(3)}`,
    `Path: ${state.path || "—"} | FP: ${state.fork.fp.toFixed(2)} | Bonus: ${state.fork.bonusMult.toFixed(3)}`,
    `Choice cooldown até bloco: ${state.choiceCooldownUntilBlock || 0}`,
    `Efeitos temporários: ${fx}`,
  ];

  return lines.join("\n");
}

function qaSyncUI(){
  const btn = $("btnQA");
  const tools = $("qaTools");
  const info = $("qaInfo");
  if(btn) btn.textContent = `QA: ${QA.enabled ? "ON" : "OFF"}`;
  if(tools) tools.hidden = !QA.enabled;
  if(info && QA.enabled) info.textContent = qaBuildDebugText();
}

function qaForceChoiceEvent(){
  // força abrir o modal de evento com escolha, ignorando chance/cooldown
  try{
    const m = $("eventChoiceModal");
    if(m && !m.hidden) return;

    // CHOICE_EVENTS e pendingChoiceEvent são globais no game.js atual
    if(typeof CHOICE_EVENTS === "undefined" || !Array.isArray(CHOICE_EVENTS) || CHOICE_EVENTS.length === 0){
      toast("Sem eventos carregados.");
      return;
    }
    const ev = CHOICE_EVENTS[Math.floor(Math.random() * CHOICE_EVENTS.length)];
    pendingChoiceEvent = ev;
    renderEventChoiceModal(ev);
    openEventChoiceModal();
    pushLog(`🧪 QA: Evento forçado (${ev.id})`);
  }catch(e){
    console.warn("qaForceChoiceEvent falhou", e);
  }
}

function qaMineBlocks(n=10){
  // mine N blocos rapidamente, sem travar por evento com escolha
  const oldCooldown = state.choiceCooldownUntilBlock || 0;
  state.choiceCooldownUntilBlock = (state.blocksMined + n + 9999); // bloqueia choice event durante o loop

  for(let i=0;i<n;i++){
    // força completar um bloco
    state.blockProgress = 100;
    addProgress(0); // addProgress faz o while e chama onBlockMined()
  }
  state.choiceCooldownUntilBlock = oldCooldown;
  pushLog(`🧪 QA: +${n} blocos`);
  renderShop();
  renderUI();
}

function qaResetRun(){
  // preserva stats globais e preferências
  const keep = {
    owned: {},
    ach: { unlocked:{} },
  };
  state = freshState();
  state.owned = keep.owned;
  state.ach = keep.ach;
  stats.runSeconds = 0;
  toast("Run resetada (QA)");
  pushLog("🧪 QA: Reset Run");
  renderShop();
  renderUI();
  SAVE.saveGame(state);
}

function qaCopyDebug(){
  const txt = qaBuildDebugText();
  navigator.clipboard?.writeText(txt).then(()=> toast("Debug copiado!")).catch(()=> toast("Não deu pra copiar"));
}

// QA: carrega preferência e liga os botões diretamente.
// boot() já rodou e o DOM está pronto, então é só wire direto (sem hooks).
(function qaInit(){
  loadQA();

  const btnQA = $("btnQA");
  const btnForce = $("btnForceChoiceEvent");
  const btnSkip = $("btnSkip10Blocks");
  const btnAdd = $("btnAddSat");
  const btnReset = $("btnResetRun");
  const btnCopy = $("btnCopyDebug");

  btnQA?.addEventListener("click", ()=>{
    QA.enabled = !QA.enabled;
    saveQA();
    qaSyncUI();
    toast(QA.enabled ? "QA ON" : "QA OFF");
  });

  btnForce?.addEventListener("click", ()=> qaForceChoiceEvent());
  btnSkip?.addEventListener("click", ()=> qaMineBlocks(10));
  btnAdd?.addEventListener("click", ()=>{
    state.sat += 10000;
    pushLog("🧪 QA: +10.000 SAT");
    renderUI();
    qaSyncUI();
  });
  btnReset?.addEventListener("click", ()=> qaResetRun());
  btnCopy?.addEventListener("click", ()=> qaCopyDebug());

  qaSyncUI();
})();

// Hook renderUI para atualizar painel QA quando ligado
(function qaRenderHook(){
  const orig = renderUI;
  window.renderUI = function(){
    const r = orig.apply(this, arguments);
    try{
      if(QA.enabled){
        const info = $("qaInfo");
        if(info) info.textContent = qaBuildDebugText();
      }
    }catch{}
    return r;
  };
})();
