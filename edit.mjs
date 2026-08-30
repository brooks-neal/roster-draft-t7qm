#!/usr/bin/env node
// Local editor for the org chart. Run:  node edit.mjs
// Serves the site plus /editor.html, saves people.json, and publishes to GitHub.
// Binds to 127.0.0.1 only - nothing here is reachable from outside this Mac.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, countPeople, encryptToFileText } from './lib/encrypt.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const PEOPLE = join(ROOT, 'people.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj));
}

// Block cross-origin calls (a stray browser tab should not be able to drive this).
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === 'http://localhost:' + PORT || origin === 'http://127.0.0.1:' + PORT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function git(args) {
  const { stdout, stderr } = await run('git', args, { cwd: ROOT });
  return (stdout + stderr).trim();
}

async function handleApi(req, res, url) {
  if (!originOk(req)) return sendJson(res, 403, { error: 'Cross-origin request refused.' });

  if (url.pathname === '/api/people' && req.method === 'GET') {
    try {
      const text = await readFile(PEOPLE, 'utf8');
      return send(res, 200, text);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return send(res, 200, JSON.stringify({ title: 'Org Chart', subtitle: '', families: [] }));
      }
      return sendJson(res, 500, { error: 'Could not read people.json: ' + err.message });
    }
  }

  if (url.pathname === '/api/people' && req.method === 'POST') {
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, 400, { error: 'Bad JSON: ' + err.message });
    }
    await writeFile(PEOPLE, JSON.stringify(data, null, 2) + '\n');
    return sendJson(res, 200, { ok: true, people: countPeople(data), problems: validate(data) });
  }

  if (url.pathname === '/api/publish' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, 400, { error: 'Bad JSON: ' + err.message });
    }
    const passphrase = String(body.passphrase || '');
    if (passphrase.length < 6) return sendJson(res, 400, { error: 'Passphrase must be at least 6 characters.' });

    let data;
    try {
      data = JSON.parse(await readFile(PEOPLE, 'utf8'));
    } catch (err) {
      return sendJson(res, 400, { error: 'Could not read people.json: ' + err.message });
    }
    const problems = validate(data);
    if (problems.length) return sendJson(res, 400, { error: 'Fix these first:\n- ' + problems.join('\n- ') });

    try {
      await writeFile(join(ROOT, 'data.enc.js'), await encryptToFileText(data, passphrase));
    } catch (err) {
      return sendJson(res, 500, { error: 'Encryption failed: ' + err.message });
    }

    if (body.encryptOnly) {
      return sendJson(res, 200, { ok: true, log: 'Encrypted ' + countPeople(data) + ' people into data.enc.js (not pushed).' });
    }

    const log = [];
    try {
      await git(['add', '-A']);
      const staged = await git(['diff', '--cached', '--name-only']);
      if (!staged) {
        return sendJson(res, 200, { ok: true, log: 'Nothing changed since the last publish.' });
      }
      log.push('Committing: ' + staged.split('\n').join(', '));
      await git(['commit', '-m', body.message || 'Update the org chart']);
      log.push(await git(['push']));
      log.push('Published ' + countPeople(data) + ' people. GitHub Pages usually updates within a minute.');
    } catch (err) {
      return sendJson(res, 500, { error: 'Git step failed:\n' + (err.stderr || err.stdout || err.message), log: log.join('\n') });
    }
    return sendJson(res, 200, { ok: true, log: log.filter(Boolean).join('\n') });
  }

  return sendJson(res, 404, { error: 'Unknown endpoint' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/editor.html';
  if (rel === '/editor.html') rel = '/tools/editor.html';
  if (rel === '/editor.js') rel = '/tools/editor.js';
  if (rel === '/chart' || rel === '/chart/') rel = '/index.html';

  // Never serve the plaintext people file over HTTP except through the API.
  if (normalize(rel).replace(/^[/\\]+/, '') === 'people.json') {
    return send(res, 403, 'Use the editor.', 'text/plain; charset=utf-8');
  }

  const filePath = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Nope.', 'text/plain; charset=utf-8');

  try {
    const buf = await readFile(filePath);
    return send(res, 200, buf, TYPES[extname(filePath)] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'Not found: ' + rel, 'text/plain; charset=utf-8');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Org chart editor:  http://localhost:' + PORT);
  console.log('Preview the chart: http://localhost:' + PORT + '/chart');
  console.log('Press Ctrl+C to stop.');
});
