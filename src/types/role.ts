/**
 * Conversation role for a chat message or block.
 *
 * - `system`    — instructions / persona / pre-context.
 * - `user`      — caller turn.
 * - `assistant` — model turn (also used for few-shot example completions).
 * - `tool`      — result of a tool / function call returned to the model.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';
