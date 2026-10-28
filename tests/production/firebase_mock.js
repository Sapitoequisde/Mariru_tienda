// Served only by Playwright request interception; never included in the app build.
const state = window.__qa;
const callbacks = [];
const snapshots = [];
const copy = value => JSON.parse(JSON.stringify(value));
const snapshot = (path, data) => ({ id: path.split('/').at(-1), ref: { path }, exists: () => data !== undefined, data: () => copy(data) });
const list = path => Object.entries(state.docs).filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(([key, data]) => snapshot(key, data));
const notify = () => snapshots.forEach(({ reference, callback }) => setTimeout(() => callback({ docs: list(reference.path) }), 0));
window.__qaNotify = notify;
export const auth = { get currentUser() { return state.user; } };
export const db = {};
export const storage = {};
export const functions = {};
export const appCheck = null;
export function onAuthStateChanged(_auth, callback) { callbacks.push(callback); setTimeout(() => callback(state.user), 0); return () => {}; }
export async function signOut() { state.user = null; callbacks.forEach(callback => callback(null)); }
export function collection(...args) { return { path: args.filter(arg => typeof arg === 'string').join('/') }; }
export function doc(...args) {
  const parts = args.filter(arg => typeof arg === 'string');
  if (args[0]?.path) parts.unshift(args[0].path);
  if (args.length === 1) parts.push('qa-new-' + (++state.counter));
  return { path: parts.join('/'), id: parts.at(-1) };
}
export async function getDoc(reference) { return snapshot(reference.path, state.docs[reference.path]); }
export async function getDocs(reference) { return { docs: list(reference.path) }; }
export function onSnapshot(reference, callback) { snapshots.push({ reference, callback }); setTimeout(() => callback({ docs: list(reference.path) }), 0); return () => {}; }
export async function updateDoc(reference, data) {
  if (state.failSave) throw Object.assign(new Error('QA simulated offline'), { code: 'unavailable' });
  if (!state.docs[reference.path]) throw Error('QA document missing');
  Object.assign(state.docs[reference.path], copy(data)); state.writes.push({ type: 'update', path: reference.path, data: copy(data) }); notify();
}
export async function setDoc(reference, data, options) {
  if (state.failSave) throw Error('QA simulated offline');
  state.docs[reference.path] = options?.merge ? { ...state.docs[reference.path], ...copy(data) } : copy(data);
  state.writes.push({ type: 'set', path: reference.path, data: copy(data) }); notify();
}
export async function addDoc(reference, data) { const target = doc(reference); await setDoc(target, data); return target; }
export async function deleteDoc(reference) { delete state.docs[reference.path]; state.writes.push({ type: 'delete', path: reference.path }); notify(); }
export function ref(_storage, path) { return { path }; }
export async function deleteObject(reference) { state.mediaDeletes.push(reference.path); }
export async function uploadBytes(reference) { state.uploads.push(reference.path); }
export async function getDownloadURL(reference) { return 'https://example.test/' + reference.path; }
export function serverTimestamp() { return { seconds: 1792900000 }; }
