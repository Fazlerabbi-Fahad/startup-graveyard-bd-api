// Prompts for the admin password (input hidden) and prints a bcrypt hash for ADMIN_PASSWORD_HASH.
// Usage: npm run hash-password
import readline from 'node:readline';
import bcrypt from 'bcrypt';

const COST = 12;
const MIN_LENGTH = 12;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
let muted = false;
// Hide typed characters while still showing the prompt itself.
rl._writeToOutput = (str) => {
  if (!muted) rl.output.write(str);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question) {
  rl.output.write(question);
  muted = true;
  const { value = '' } = await lines.next();
  muted = false;
  rl.output.write('\n');
  return value.replace(/^﻿/, ''); // Windows PowerShell prepends a BOM to piped input
}

try {
  const password = await ask('Admin password: ');
  if (password.length < MIN_LENGTH) throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  const confirm = await ask('Confirm password: ');
  if (password !== confirm) throw new Error('Passwords do not match.');

  const hash = await bcrypt.hash(password, COST);
  console.log('\nAdd this line to your .env (keep the single quotes):\n');
  console.log(`ADMIN_PASSWORD_HASH='${hash}'`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
