// src/utils/isElectron.js
export function isElectron() {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    typeof process.versions.electron === 'string'
  );
}
