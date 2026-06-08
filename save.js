// ==================================================
// PROOF OF STRATEGY — save.js
// Save/Load + Export/Import (Base64) + Backup robusto (Patch 1.0)
// ==================================================

window.SAVE = (() => {
  const KEY = "pos_save_v3";
  const BACKUP_KEY = "pos_save_backup_v1";
  const VERSION = 3;
  const BACKUP_MIN_INTERVAL_MS = 3 * 60 * 1000; // backup automático no máx. a cada 3 min

  function safeParse(raw){
    try { return JSON.parse(raw); } catch { return null; }
  }

  // Validação de forma: precisa ter envelope { s: {...} } com campos plausíveis.
  function isValidSave(data){
    return !!(
      data && typeof data === "object" &&
      data.s && typeof data.s === "object" &&
      typeof data.s.blocksMined === "number" &&
      typeof data.s.sat === "number"
    );
  }

  // Migração defensiva: normaliza versão. O preenchimento de campos
  // faltantes é feito no boot (merge com freshState()).
  function migrate(data){
    if(!data) return data;
    if(typeof data.v !== "number") data.v = 1;
    data.v = VERSION;
    return data;
  }

  function saveGame(state){
    try{
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, t: Date.now(), s: state }));
      maybeAutoBackup();
      return true;
    }catch{
      return false;
    }
  }

  function loadGame(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return null;
      const data = safeParse(raw);
      if(!isValidSave(data)){
        // save principal ausente/corrompido → tenta recuperar do backup
        const bk = loadBackupClean();
        if(isValidSave(bk)){
          try{ localStorage.setItem(KEY, JSON.stringify(bk)); }catch{}
          return migrate(bk);
        }
        return null;
      }
      return migrate(data);
    }catch{
      return null;
    }
  }

  // ---------- Backup ----------
  function writeBackup(data){
    try{
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ ...data, bt: Date.now() }));
      return true;
    }catch{ return false; }
  }
  function loadBackupRaw(){
    try{
      const raw = localStorage.getItem(BACKUP_KEY);
      return raw ? safeParse(raw) : null;
    }catch{ return null; }
  }
  // backup sem o campo auxiliar bt (pronto pra virar save principal)
  function loadBackupClean(){
    const bk = loadBackupRaw();
    if(!bk) return null;
    const { bt, ...clean } = bk;
    return clean;
  }
  // snapshot imediato do save principal atual → backup
  function snapshotBackup(){
    const raw = localStorage.getItem(KEY);
    const data = raw ? safeParse(raw) : null;
    if(isValidSave(data)) return writeBackup(data);
    return false;
  }
  function maybeAutoBackup(){
    const bk = loadBackupRaw();
    const last = (bk && bk.bt) ? bk.bt : 0;
    if(Date.now() - last >= BACKUP_MIN_INTERVAL_MS){
      snapshotBackup();
    }
  }
  function hasBackup(){ return isValidSave(loadBackupClean()); }
  function backupInfo(){
    const bk = loadBackupRaw();
    return (bk && bk.bt) ? bk.bt : null;
  }
  function restoreBackup(){
    const bk = loadBackupClean();
    if(!isValidSave(bk)) return false;
    try{
      localStorage.setItem(KEY, JSON.stringify(bk));
      return true;
    }catch{ return false; }
  }

  // ---------- Export / Import ----------
  function exportSave(){
    const data = loadGame();
    if(!data) return "";
    const json = JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(json)));
  }

  function importSave(b64){
    try{
      const json = decodeURIComponent(escape(atob(b64.trim())));
      const data = safeParse(json);
      if(!isValidSave(data)) return false;
      // antes de sobrescrever, guarda o estado atual como backup
      snapshotBackup();
      localStorage.setItem(KEY, JSON.stringify(migrate(data)));
      return true;
    }catch{
      return false;
    }
  }

  function clearSave(){
    try{ localStorage.removeItem(KEY); }catch{}
  }

  return {
    saveGame, loadGame, exportSave, importSave, clearSave, KEY,
    // Patch 1.0 — backup
    snapshotBackup, restoreBackup, hasBackup, backupInfo, isValidSave, VERSION
  };
})();
