import { parseBabyLogText } from './baby-log-parser.js';

export async function callMockLLM(task, input, context = {}) {
  if (task === 'parse_baby_log') {
    return parseBabyLogText(input.text, context);
  }
  if (task === 'answer_question') {
    return { text: 'Mock answer provider is active.' };
  }
  throw new Error(`Unknown mock LLM task: ${task}`);
}

