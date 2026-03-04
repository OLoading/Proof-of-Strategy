// ==================================================
// PROOF OF STRATEGY — config.js
// Ajustes de balance / economia / hardcore
// ==================================================

window.CONFIG = {
  SAT_PER_BTC: 100_000_000,

  autosaveMs: 1500,

  pricing: {
    genericGrowth: 1.15,
    machineGrowth: 1.18,
  },

  // Dificuldade: cresce a cada N blocos, multiplicando por multiplier
  difficulty: {
    start: 1.00,
    everyNBlocks: 50,
    multiplier: 1.12,
  },

  // Recompensa do bloco (SAT) com halvings por blocos
  block: {
    baseRewardSat: 250,          // recompensa inicial por bloco
    halvingEveryBlocks: 50,      // 1º halving no bloco 50
    eventChancePerBlock: 0.10,   // eventos simples (Bull/FUD/Fee/Lucky)
    // PATCH 0.6 P2 — eventos com escolha
    choiceEventChancePerBlock: 0.12,
    choiceEventCooldownBlocks: 6,
  },

  // Energia (hardcore):
  // - satPerEnergyPerSec: quanto SAT/s você paga por cada unidade de energia/s
  // - deficitPenaltyHashrateMult: quando SAT < 0 (prejuízo), hashrate é penalizado (se não tiver upgrade)
  energy: {
    satPerEnergyPerSec: 0.45,
    deficitPenaltyHashrateMult: 0.85,
  },

  // Hard Fork (quase um "rebirth" leve)
  fork: {
    minBlocks: 200,
    bonusPerFP: 0.04,
  },

  // Offline progress
  offline: {
    maxSeconds: 6 * 60 * 60,   // 6 horas
    efficiency: 0.75,          // 75% eficiência offline
  },
};
