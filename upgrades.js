/**
 * PROOF OF STRATEGY — upgrades.js
 * Catálogo único de upgrades (Loja)
 *
 * Convenções:
 * - baseCost / growth: preço = baseCost * growth^owned
 * - type:
 *    - "stack": pode comprar infinitas vezes (incremental)
 *    - "unique": compra única
 * - apply(state): aplica o efeito permanentemente no state atual
 * - visible(state): gate para aparecer na loja
 * - roi: usado só para estimativa/preview (o jogo pode tratar como aproximação)
 */

window.UPGRADES = [
  // ==================================================
  // TAB: CLICK
  // ==================================================
  {
    id: "mouse_mod",
    tab: "click",
    name: "Mouse Mod",
    desc: "+1 PC (poder de clique).",
    baseCost: 50,
    growth: CONFIG.pricing.genericGrowth,
    type: "stack",
    visible: () => true,
    effectLabel: () => `PC +1`,
    roi: { addPc: 1 },
    apply: (s) => { s.pcBase += 1; }
  },
  {
    id: "glove",
    tab: "click",
    name: "Luva Anti-Fadiga",
    desc: "+25% PC (multiplicador).",
    baseCost: 200,
    growth: 1.22,
    type: "unique",
    visible: (s) => s.blocksMined >= 5,
    effectLabel: () => `PC ×1.25`,
    roi: { mulPc: 1.25 },
    apply: (s) => { s.mult.pc *= 1.25; }
  },
  {
    id: "macro",
    tab: "click",
    name: "Macro Script",
    desc: "Clique automático a cada 5s (respeita dificuldade).",
    baseCost: 1000,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 15,
    effectLabel: () => `Auto-clique`,
    roi: { feature: "autoClick" },
    apply: (s) => { s.features.autoClick = true; }
  },

  // ==================================================
  // TAB: MACHINES
  // ==================================================
  {
    id: "cpu",
    tab: "machines",
    name: "CPU Rig",
    desc: "+0.5 H/s • +0.2 ⚡/s",
    baseCost: 100,
    growth: CONFIG.pricing.machineGrowth,
    type: "stack",
    visible: () => true,
    effectLabel: () => `+0.5 H/s • +0.2⚡`,
    roi: { addHash: 0.5, addEnergy: 0.2 },
    apply: (s) => { s.hashBase += 0.5; s.energy += 0.2; }
  },
  {
    id: "gpu",
    tab: "machines",
    name: "GPU Miner",
    desc: "+3 H/s • +1.2 ⚡/s",
    baseCost: 750,
    growth: CONFIG.pricing.machineGrowth,
    type: "stack",
    visible: (s) => s.blocksMined >= 10,
    effectLabel: () => `+3 H/s • +1.2⚡`,
    roi: { addHash: 3.0, addEnergy: 1.2 },
    apply: (s) => { s.hashBase += 3.0; s.energy += 1.2; }
  },
  {
    id: "asic",
    tab: "machines",
    name: "ASIC Unit",
    desc: "+15 H/s • +6 ⚡/s",
    baseCost: 5000,
    growth: CONFIG.pricing.machineGrowth,
    type: "stack",
    visible: (s) => s.blocksMined >= 30,
    effectLabel: () => `+15 H/s • +6⚡`,
    roi: { addHash: 15.0, addEnergy: 6.0 },
    apply: (s) => { s.hashBase += 15.0; s.energy += 6.0; }
  },

  // ==================================================
  // TAB: EFF (eficiência)
  // ==================================================
  {
    id: "psu_80",
    tab: "eff",
    name: "Fonte 80 Plus",
    desc: "-15% consumo de energia (multiplicador).",
    baseCost: 600,
    growth: 1.25,
    type: "unique",
    visible: (s) => s.energy > 0.3,
    effectLabel: () => `⚡ ×0.85`,
    roi: { mulEnergy: 0.85 },
    apply: (s) => { s.mult.energy *= 0.85; }
  },
  {
    id: "undervolt",
    tab: "eff",
    name: "Undervolt",
    desc: "-25% ⚡, mas -10% H/s (trade-off).",
    baseCost: 1500,
    growth: 1.28,
    type: "unique",
    visible: (s) => s.blocksMined >= 25,
    effectLabel: () => `⚡ ×0.75 • H/s ×0.90`,
    roi: { mulEnergy: 0.75, mulHash: 0.90 },
    apply: (s) => { s.mult.energy *= 0.75; s.mult.hash *= 0.90; }
  },
  {
    id: "cooling",
    tab: "eff",
    name: "Cooling Avançado",
    desc: "Remove a penalidade de prejuízo (SAT < 0).",
    baseCost: 4000,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 60,
    effectLabel: () => `Sem penalidade`,
    roi: { feature: "noDeficitPenalty" },
    apply: (s) => { s.features.noDeficitPenalty = true; }
  },

  // ==================================================
  // TAB: NET (rede)
  // ==================================================
  {
    id: "mempool",
    tab: "net",
    name: "Otimizador de Mempool",
    desc: "-5% Dificuldade (multiplicador).",
    baseCost: 1200,
    growth: 1.22,
    type: "unique",
    visible: (s) => s.blocksMined >= 25,
    effectLabel: () => `D ×0.95`,
    roi: { mulDifficulty: 0.95 },
    apply: (s) => { s.mult.difficulty *= 0.95; }
  },
  {
    id: "stratum",
    tab: "net",
    name: "Stratum Pro",
    desc: "+10% eficiência de H/s (multiplicador).",
    baseCost: 2200,
    growth: 1.28,
    type: "unique",
    visible: (s) => s.blocksMined >= 35,
    effectLabel: () => `H/s ×1.10`,
    roi: { mulHash: 1.10 },
    apply: (s) => { s.mult.hash *= 1.10; }
  },
  {
    id: "compact_block",
    tab: "net",
    name: "Bloco Compactado",
    desc: "+10% RB (recompensa do bloco).",
    baseCost: 3000,
    growth: 1.30,
    type: "unique",
    visible: (s) => s.blocksMined >= 40,
    effectLabel: () => `RB ×1.10`,
    roi: { mulReward: 1.10 },
    apply: (s) => { s.mult.reward *= 1.10; }
  },

  // ==================================================
  // PATCH 0.6 — Parte 1 (Trade-offs)
  // ==================================================
  // Eficiência
  {
    id: "firmware_async",
    tab: "eff",
    name: "Firmware Assíncrono",
    desc: "-10% dificuldade, mas -5% recompensa do bloco.",
    baseCost: 1200,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 35,
    effectLabel: () => `D ×0.90 • RB ×0.95`,
    roi: { mulDifficulty: 0.90, mulReward: 0.95 },
    apply: (s) => { s.mult.difficulty *= 0.90; s.mult.reward *= 0.95; }
  },
  {
    id: "cache_local",
    tab: "eff",
    name: "Cache Local",
    desc: "+8% PC, mas -10% hashrate.",
    baseCost: 1500,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 40,
    effectLabel: () => `PC ×1.08 • H/s ×0.90`,
    roi: { mulPc: 1.08, mulHash: 0.90 },
    apply: (s) => { s.mult.pc *= 1.08; s.mult.hash *= 0.90; }
  },
  {
    id: "load_balancer",
    tab: "eff",
    name: "Load Balancer",
    desc: "-15% custo de energia, mas -3% de PC.",
    baseCost: 2200,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 45,
    effectLabel: () => `⚡ ×0.85 • PC ×0.97`,
    roi: { mulEnergyCost: 0.85, mulPc: 0.97 },
    apply: (s) => { s.mult.energyCost = (s.mult.energyCost ?? 1) * 0.85; s.mult.pc *= 0.97; }
  },
  // Máquinas
  {
    id: "rig_frank",
    tab: "machines",
    name: "Rig Frankenstein",
    desc: "+20% H/s, mas +12% custo de energia.",
    baseCost: 2600,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 50,
    effectLabel: () => `H/s ×1.20 • ⚡ ×1.12`,
    roi: { mulHash: 1.20, mulEnergyCost: 1.12 },
    apply: (s) => { s.mult.hash *= 1.20; s.mult.energyCost = (s.mult.energyCost ?? 1) * 1.12; }
  },
  {
    id: "vent_impro",
    tab: "machines",
    name: "Ventilação Improvisada",
    desc: "Remove penalidade de prejuízo (SAT < 0), mas -10% PC.",
    baseCost: 2800,
    growth: 1.0,
    type: "unique",
    visible: (s) => s.blocksMined >= 55,
    effectLabel: () => `Sem penalidade • PC ×0.90`,
    roi: { feature: "noDeficitPenalty", mulPc: 0.90 },
    apply: (s) => { s.features.noDeficitPenalty = true; s.mult.pc *= 0.90; }
  },
];

// Conveniência: expõe também como global "UPGRADES" (opcional)
window.UPGRADES = window.UPGRADES || [];


// ==================================================
// Eventos (básicos) — usado pelo game.js
// ==================================================
window.EVENTS = [
  { id:"bull",  name:"Bull Run 📈",    dur:60, tag:"Bull Run +50% RB",   start:(s)=>{ s.temp.reward *= 1.5; } },
  { id:"fud",   name:"FUD 📉",         dur:60, tag:"FUD -30% H/s",       start:(s)=>{ s.temp.hash *= 0.7; } },
  { id:"fee",   name:"Taxa Alta ⚡",   dur:60, tag:"Energia +50% custo", start:(s)=>{ s.temp.energyCost *= 1.5; } },
  { id:"lucky", name:"Lucky Block 🍀", dur:0,  tag:"Lucky: +50% progresso", start:(s)=>{ s.blockProgress += 50; } },
];
