/**
 * Drafts the "generate client message" text — UX_SPEC.md §4.
 * Uses ONLY the current Missing rows, never Verifying/Needs-review ones:
 * those documents are already in the client's hands, so listing them would
 * confusingly ask the client to resend something they already sent.
 */
export function generateClientMessage(actTypeNameRo: string, missingItemNames: string[]): string {
  const bulletList = missingItemNames.map((name) => `— ${name}`).join('\n')
  return `Hello, for your case (${actTypeNameRo.toLowerCase()}) we still need the following documents:\n${bulletList}\nPlease send them to the office or to this number. Thank you!`
}
