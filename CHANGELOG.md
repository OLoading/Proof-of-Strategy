# CHANGELOG — Proof of Strategy

---

## [Patch 0.6 P2 — Bug Hunt & Balance] — 2026-06-06

### Resumo

Sessão intensiva de caça a bugs disparada pelo relatório de QA interno.
13 correções cobrindo: painel QA completamente morto, compounding de specs,
eventos que sumiam, upgrades sem efeito, recompensa fantasma de evento de escolha,
offline com inflação 2.74×, conquistas que eram apagadas no fork/reset, e
performance de render (-58% no frame budget).

---

### Bugs Corrigidos

#### #1 — QA Panel completamente inoperante

**Arquivo:** `game.js`  
**Causa:** O IIFE `qaWire` tentava capturar `initSettingsUI` (função inexistente),
lançando `ReferenceError` antes de qualquer botão ser registrado.  
**Fix:** Substituído por `qaInit` IIFE que registra todos os 5 botões diretamente.

---

#### #2 — `qaBuildDebugText` travava com ReferenceError

**Arquivo:** `game.js`  
**Causa:** Chamava `satPerSecond()`, `energyCostPerSecond()`, `effectivePc()` —
nenhuma delas existe. Nomes reais: `estimateNetSatPerSec()`, `energyCostPerSec()`, `pcValue()`.  
**Fix:** Corrigidos os três nomes de função.

---

#### #3 — Reset Run falhava silenciosamente

**Arquivo:** `game.js`  
**Causa:** `localStorage.removeItem(SAVE.SAVE_KEY)` — `SAVE.SAVE_KEY` é `undefined`.
A chave correta é `SAVE.KEY`.  
**Fix:** Substituído por `localStorage.removeItem(SAVE.KEY)`.

---

#### #4 — Double load no boot corrompendo estado

**Arquivo:** `game.js`  
**Causa:** O boot carregava o save duas vezes; o segundo bloco sobrescrevia o
`Object.assign(freshState(), …)` do primeiro com `state = loaded.s` direto,
perdendo todos os novos campos de `freshState()`.  
**Fix:** Removido o bloco redundante; permanece apenas o carregamento seguro com merge.

---

#### #5 — `shopApplyGuard` quebrava ROI de todos os upgrades

**Arquivo:** `game.js`  
**Causa:** IIFE monkey-patchava `simulateUpgradeDelta` esperando um objeto como
primeiro argumento, mas a função recebe uma string de ID. `typeof id.apply`
nunca é `"function"` → ROI sempre mostrava "—" e spam de erros no console.  
**Fix:** IIFE removida; guarda defensiva adicionada diretamente em `simulateUpgradeDelta`.

---

#### #6 — Specs `eng.c` e `maxi.a` faziam compounding eterno

**Arquivo:** `game.js`  
**Causa:** `Difficulty Dampener` escrevia em `state.mult.difficulty` e
`Block Hunger` em `state.mult.reward` (canais permanentes). Cada chamada a
`clearTemp()` multiplicava os valores novamente — após 5 chamadas,
`mult.reward` subia de 1.05 para 1.276.  
**Fix:** Ambas as specs movidas para `state.temp.difficulty` e `state.temp.reward`
(zerados a cada `clearTemp()`).

---

#### #7 — Eventos temporários sumiam após compra de perk

**Arquivo:** `game.js`  
**Causa:** `clearTemp()` zerava `temp.*` mas não reaplicava o evento ativo em
andamento, tornando Bull Run / FUD / Taxa Alta invisíveis até expirarem.  
**Fix:** Adicionado `reapplyActiveEvent()` ao final de `clearTemp()`.

---

#### #8 — `load_balancer` e `rig_frank` sem efeito após reload

**Arquivo:** `upgrades.js`  
**Causa:** Ambos escreviam em `s.temp.energyCost` (canal volátil, resetado a
cada `clearTemp()`). O efeito evaporava no próximo ciclo.  
**Fix:** Migrados para `s.mult.energyCost` (canal permanente).

---

#### #9 — `satRateMul` do evento de escolha ignorado

**Arquivo:** `game.js`  
**Causa:** `choiceFxMults()` calculava `satRateMul` corretamente e o pill de HUD
o exibia, mas `currentBlockReward()` nunca o lia — recompensa era idêntica com
ou sem a penalidade de taxa.  
**Fix:** `currentBlockReward()` agora multiplica por `fx.satRateMul`.

---

#### #10 — Offline progress com inflação 2.74× e spam de callbacks

**Arquivo:** `game.js`  
**Causa:** Implementação antiga: (a) calculava dificuldade uma única vez para
todo o período offline ignorando o crescimento a cada N blocos; (b) chamava
`onBlockMined` para cada bloco, disparando eventos/modais/sons de forma encadeada.  
**Fix:** Reescrita completa com loop bloco-a-bloco ciente de dificuldade,
sem side effects (sem eventos, sem som, sem modal).

---

#### #11 — Conquistas apagadas no fork / reset run

**Arquivo:** `game.js`  
**Causa:** `state.ach.unlocked` era parte do save principal — um fork ou reset
apagava todas as conquistas conquistadas, sem progressão meta permanente.  
**Fix:** Conquistas migradas para chave separada `pos_ach_v1` no localStorage
(objeto `achUnlocked` + `loadAch()` / `saveAch()`). Boot migra automaticamente
saves antigos. Fork e reset não tocam nas conquistas.

---

#### #12 — Performance: render desnecessário em todo frame

**Arquivo:** `game.js`  
**Causa:** `renderAchievements`, `renderLog` e `renderSpec` reconstruíam o DOM
a cada tick (~60 fps), mesmo sem mudanças de estado.  
**Fix:** Memoização por assinatura (`.sig`) — rebuild só ocorre quando o estado
relevante muda. Medido: 1.277 ms → 0.535 ms por frame (−58%).

---

### Balance

#### #13 — Parede de dificuldade no bloco ~200 (pré-fork)

**Arquivo:** `config.js`  
**Causa:** Análise matemática mostrou que `halvingEveryBlocks: 50` sincronizava
halvings com crescimento de dificuldade, criando uma parede intransponível antes
do fork mínimo (bloco 200). Outras alavancas (multiplicador de dificuldade,
custo de energia) não moviam a parede de forma significativa.  
**Fix:** `halvingEveryBlocks` aumentado de 50 → 75. Parede movida do bloco ~200
para ~250, criando ~50 blocos de margem confortável antes do fork.

**Conquista atualizada:** "Primeiro Halving" agora exige 75 blocos (era 50).

---

### Novos Canais de Estado

| Canal | Tipo | Descrição |
|---|---|---|
| `state.mult.energyCost` | permanente | Multiplicador de custo de energia (upgrades) |
| `state.temp.difficulty` | temporário | Modificador de dificuldade (specs / eventos) |
| `state.temp.reward` | temporário | Modificador de recompensa (specs / eventos) |

---

### Infraestrutura

- **`.claude/launch.json`** criado: servidor de preview `npx serve -l 5050` integrado ao VS Code / Claude Dev.
- **`applySpecialization(target?)`** agora aceita estado destino (parâmetro opcional), habilitando simulações ROI corretas.

---

### Testes Verificados (browser ao vivo)

| # | Teste | Resultado |
|---|---|---|
| QA-1 | Botões do painel QA respondem | ✅ |
| QA-2 | Debug text renderiza sem erros | ✅ |
| QA-3 | Reset Run limpa save corretamente | ✅ |
| BAL-1 | `mult.reward` estável após 5× clearTemp | ✅ |
| BAL-2 | Evento Bull Run persiste após compra de perk | ✅ |
| BAL-3 | `satRateMul` reduz recompensa em 50% com mult 0.5 | ✅ |
| BAL-4 | Offline ratio = 1.000 (sem inflação) | ✅ |
| META-1 | Conquistas sobrevivem ao fork/reset | ✅ |
| META-2 | Migração de saves antigos importa conquistas | ✅ |
| PERF-1 | Frame budget −58% em steady state | ✅ |

---

### Arquivos Modificados

- `game.js` — correções #1–#12, novos canais, sistema de conquistas meta
- `config.js` — `halvingEveryBlocks` 50 → 75
- `upgrades.js` — `load_balancer` e `rig_frank` migrados para `mult.energyCost`
- `CHANGELOG.md` — este arquivo (criado)
- `.claude/launch.json` — configuração de servidor de preview (criado)
