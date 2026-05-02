/**
 * @aikit/prompts — basic usage.
 *
 * Demonstrates the core flow: define a versioned, typed prompt template,
 * render it, partial-apply, and recover from missing variables with a
 * typed Result instead of a thrown error.
 *
 * Run: npx tsx examples/basic-usage.ts
 */

import { prompt, isErr } from '@aikit/prompts';

const greet = prompt('greet.user')
  .version('1.0.0')
  .template('Hello {{name}}, you have {{count:number}} new messages.')
  .build();

console.log('--- render ---');
console.log(greet.render({ name: 'Alice', count: 3 }));

console.log('\n--- variables() ---');
console.log(greet.variables());

console.log('\n--- partial application ---');
const supportPrompt = prompt('support.reply')
  .version('1.0.0')
  .template('You are {{role}}. Reply to: {{question}}')
  .partial({ role: 'a senior support engineer who writes concisely' })
  .build();

console.log(supportPrompt.render({ question: 'How do I reset my password?' }));

console.log('\n--- tryRender on missing var ---');
const result = greet.tryRender({ name: 'Bob' } as { name: string; count: number });
if (isErr(result)) {
  console.log('error.code   :', result.error.code);
  console.log('error.missing:', result.error.missing);
} else {
  console.log(result.value);
}

console.log('\n--- toJSON / fromJSON round-trip ---');
const json = greet.toJSON();
console.log(JSON.stringify(json, null, 2));
