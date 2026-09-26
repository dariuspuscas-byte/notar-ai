import i18n from '../i18n'

/**
 * Drafts the "generate client message" text — UX_SPEC.md §4.
 * Uses ONLY the current Missing rows, never Verifying/Needs-review ones:
 * those documents are already in the client's hands, so listing them would
 * confusingly ask the client to resend something they already sent.
 */
export function generateClientMessage(actTypeName: string, missingItemNames: string[]): string {
  const bulletList = missingItemNames
    .map((name) => i18n.t('clientMessage.bullet', { name }))
    .join('\n')
  return i18n.t('clientMessage.body', { actType: actTypeName.toLowerCase(), list: bulletList })
}
