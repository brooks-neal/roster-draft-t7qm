#!/usr/bin/env node
// Encrypts people.json -> data.enc.js so the plaintext never leaves this machine.
// Usage:  node build.mjs                          (prompts for the passphrase, not echoed)
//         ORG_PASSPHRASE='...' node build.mjs     (for scripting)
import { readFile, writeFile } from 'node:fs/promises';
import { validate, countPeople, encryptToFileText } from './lib/encrypt.mjs';

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('No terminal available. Use ORG_PASSPHRASE=... node build.mjs'));
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const ETX = 3, BACKSPACE = 8, LF = 10, CR = 13, EOT = 4, DEL = 127;
    const onData = (char) => {
      const code = char.charCodeAt(0);
      if (code === CR || code === LF || code === EOT) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (code === ETX) {
        stdin.setRawMode(false);
        stdout.write('\n');
        process.exit(130);
      } else if (code === DEL || code === BACKSPACE) {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const b64 = (buf) => Buffer.from(buf).toString('base64');

const raw = await readFile(new URL('./people.json', import.meta.url), 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error('people.json is not valid JSON: ' + err.message);
  process.exit(1);
}

const problems = validate(data);
if (problems.length) {
  console.error('Fix these first:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const passphrase = process.env.ORG_PASSPHRASE ?? await promptHidden('Passphrase: ');
if (!passphrase) {
  console.error('No passphrase given.');
  process.exit(1);
}
if (passphrase.length < 6) {
  console.error('Use at least 6 characters.');
  process.exit(1);
}

const fileText = await encryptToFileText(data, passphrase);
await writeFile(new URL('./data.enc.js', import.meta.url), fileText);

console.log('Encrypted ' + countPeople(data) + ' people across ' + (data.families ?? []).length + ' departments -> data.enc.js');
