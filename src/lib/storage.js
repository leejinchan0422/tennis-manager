/**
 * storage.js — 모든 데이터는 지금 쓰는 기기 안에만 저장됩니다. 서버 없음. 인터넷 없어도 됨.
 * 기기(태블릿/폰/PC)마다 저장 공간이 따로입니다. 기기를 옮길 때는 백업 파일로 옮깁니다.
 */

const STORAGE_KEY = 'tcm.db';
export const SCHEMA_VERSION = 3;

export function emptyDB() {
  return { schemaVersion: SCHEMA_VERSION, members: [], guests: [], sessions: {}, settings: {}, updatedAt: null };
}

function migrate(db) {
  if (!Array.isArray(db.members)) db.members = [];
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {}; // v1 -> v2
  if (!db.settings || typeof db.settings !== 'object') db.settings = {}; // v2 -> v3 (관리자 접근코드 등)
  if (!Array.isArray(db.guests)) db.guests = []; // v3: 게스트 목록 자리 (다음 단계)
  db.schemaVersion = SCHEMA_VERSION;
  return db;
}

export function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyDB();
    return migrate(parsed);
  } catch (err) {
    console.error('[storage] 읽기 실패', err);
    return emptyDB();
  }
}

export function saveDB(db) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...db, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() })
    );
    return true;
  } catch (err) {
    console.error('[storage] 저장 실패', err);
    return false;
  }
}

export function exportBackup(db) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tennis-club-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file) {
  const parsed = JSON.parse(await file.text());
  if (!parsed || !Array.isArray(parsed.members)) throw new Error('이 파일은 백업 파일이 아닙니다.');
  return migrate(parsed);
}
