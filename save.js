// ==================================================
// PROOF OF STRATEGY — save.js
// Save/Load + Export/Import (Base64)
// ==================================================

window.SAVE = (() => {
  const KEY = "pos_save_v3";

  function safeParse(raw){
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveGame(state){
    try{
      localStorage.setItem(KEY, JSON.stringify({ v: 3, t: Date.now(), s: state }));
      return true;
    }catch{
      return false;
    }
  }

  function loadGame(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return null;
      return safeParse(raw);
    }catch{
      return null;
    }
  }

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
      if(!data || !data.s) return false;
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    }catch{
      return false;
    }
  }

  function clearSave(){
    try{ localStorage.removeItem(KEY); }catch{}
  }

  return { saveGame, loadGame, exportSave, importSave, clearSave, KEY };
})();
