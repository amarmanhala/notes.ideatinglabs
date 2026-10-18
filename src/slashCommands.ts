export function isSlashCommand(textBeforeCaret: string) {
  return /(?:^|\s)\/$/u.test(textBeforeCaret)
}
