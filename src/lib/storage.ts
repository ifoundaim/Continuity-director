const CHAR_KEY = "cd_profiles_v1";
const SET_KEY  = "cd_setting_v1";

export function saveProfiles(v: unknown) {
  try { localStorage.setItem(CHAR_KEY, JSON.stringify(v)); } catch {}
}
export function loadProfiles<T>(fallback: T): T {
  try { const s = localStorage.getItem(CHAR_KEY); if (s) return JSON.parse(s); } catch {}
  return fallback;
}

export function saveSetting(v: unknown) {
  try { localStorage.setItem(SET_KEY, JSON.stringify(v)); } catch {}
}
export function loadSetting<T>(fallback: T): T {
  try { const s = localStorage.getItem(SET_KEY); if (s) return JSON.parse(s); } catch {}
  return fallback;
}
