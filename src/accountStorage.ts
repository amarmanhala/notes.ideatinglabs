// Keep account drafts and sync revisions separate, including across sign-out.
// Earlier anonymous drafts remain untouched in their original browser keys.
export function accountStorage(storage: Storage, userId: string): Storage {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('Invalid account identity')
  const prefix = `notes.account.${userId}.`
  const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null && key.startsWith(prefix))
  return {
    get length() { return keys().length },
    key: index => keys()[index]?.slice(prefix.length) ?? null,
    getItem: key => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: key => storage.removeItem(prefix + key),
    clear: () => keys().forEach(key => storage.removeItem(key)),
  }
}
