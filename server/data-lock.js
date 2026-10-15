const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Shared by the server and offline backup/restore. Never infer that a lock is
// stale from its age: only ESRCH proves that its owner process has terminated.
function acquireDataLock(directory) {
  const lockPath = path.join(directory, 'pos.lock');
  const recoveryPath = path.join(directory, 'pos-recovery.lock');
  const owner = JSON.stringify({pid: process.pid, token: crypto.randomUUID()});
  function create() {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, owner); }
    catch (error) { try { fs.unlinkSync(lockPath); } catch {} throw error; }
    finally { fs.closeSync(fd); }
  }
  function assertDead(contents) {
    let record;
    try { record = JSON.parse(contents); } catch { throw new Error('Bloqueo inválido; no se modificaron los datos.'); }
    // Support the numeric PID stored by previous versions.
    const pid = typeof record === 'number' ? record : record?.pid;
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Bloqueo inválido; no se modificaron los datos.');
    try { process.kill(pid, 0); }
    catch (error) {
      if (error.code === 'ESRCH') return;
      throw new Error('No se pudo comprobar el proceso propietario del bloqueo.');
    }
    throw new Error('Hay un proceso activo usando los datos. Detén el servidor antes de respaldar o restaurar.');
  }
  try { create(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = fs.readFileSync(lockPath, 'utf8');
    assertDead(previous);
    // Serialize stale-lock recovery so a second starter cannot delete the new
    // owner's lock after observing the same old PID. Fail closed if busy.
    const recoveryFd = fs.openSync(recoveryPath, 'wx', 0o600);
    try {
      if (fs.readFileSync(lockPath, 'utf8') !== previous) throw new Error('El bloqueo cambió. Vuelve a intentar.');
      assertDead(previous);
      fs.unlinkSync(lockPath);
      create();
    } finally {
      fs.closeSync(recoveryFd);
      fs.unlinkSync(recoveryPath);
    }
  }
  return function release() {
    try {
      if (fs.readFileSync(lockPath, 'utf8') === owner) fs.unlinkSync(lockPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}
module.exports = {acquireDataLock};
