#!/usr/bin/env node
/**
 * Generates the bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   cd server && npm run hash:admin-password
 *
 * Reads the password from stdin so it never lands in shell history, then
 * prints the env line to paste into the server environment.
 */
const bcrypt = require('bcryptjs');
const readline = require('readline');

const BCRYPT_ROUNDS = 10;

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  const password = (await prompt('관리자 비밀번호: ')).trim();

  if (password.length < 12) {
    console.error('비밀번호는 12자 이상이어야 합니다.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  console.log(`\nADMIN_PASSWORD_HASH=${hash}\n`);
})();
