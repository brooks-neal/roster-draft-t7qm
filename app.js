/* Family & friends org chart - decrypts locally, then ticks every age live. */
(function () {
  'use strict';

  var STORAGE_KEY = 'orgchart.pass';
  var PREF_SECONDS = 'orgchart.seconds';
  var data = null;
  var people = [];      // flat list: { name, role, birth, dept, els }
  var showSeconds = true;
  var timer = null;

  /* ------------------------------------------------------------------ crypto */

  function b64ToBytes(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decrypt(passphrase, payload) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function (baseKey) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64ToBytes(payload.salt), iterations: payload.it, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      })
      .then(function (key) {
        return crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: b64ToBytes(payload.iv) },
          key,
          b64ToBytes(payload.ct)
        );
      })
      .then(function (plain) {
        return JSON.parse(new TextDecoder().decode(plain));
      });
  }

  /* -------------------------------------------------------------------- time */

  // "1990-04-12" or "1990-04-12 14:30" -> local Date (never UTC-shifted).
  function parseBirth(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(str).trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Set a date to the same month/day in a target year, clamping Feb 29 -> Feb 28.
  function anniversaryIn(birth, year) {
    var month = birth.getMonth();
    var day = birth.getDate();
    var a = new Date(year, month, day, birth.getHours(), birth.getMinutes(), 0, 0);
    if (a.getMonth() !== month) a = new Date(year, month + 1, 0, birth.getHours(), birth.getMinutes(), 0, 0);
    return a;
  }

  function ageParts(birth, now) {
    var years = now.getFullYear() - birth.getFullYear();
    var anniv = anniversaryIn(birth, birth.getFullYear() + years);
    if (anniv > now) {
      years -= 1;
      anniv = anniversaryIn(birth, birth.getFullYear() + years);
    }
    var ms = now - anniv;
    var days = Math.floor(ms / 86400000); ms -= days * 86400000;
    var hours = Math.floor(ms / 3600000); ms -= hours * 3600000;
    var mins = Math.floor(ms / 60000); ms -= mins * 60000;
    var secs = Math.floor(ms / 1000);
    return { y: years, d: days, h: hours, m: mins, s: secs };
  }

  function nextBirthday(birth, now) {
    var a = anniversaryIn(birth, now.getFullYear());
    if (a <= now) a = anniversaryIn(birth, now.getFullYear() + 1);
    return a;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatAge(p) {
    var out =
      '<b>' + p.y + '</b><span class="u">y</span> ' +
      p.d + '<span class="u">d</span> ' +
      pad(p.h) + '<span class="u">h</span> ' +
      pad(p.m) + '<span class="u">m</span>';
    if (showSeconds) out += ' ' + pad(p.s) + '<span class="u">s</span>';
    return out;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatBorn(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /* ------------------------------------------------------------------ render */

  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    var first = parts[0] ? parts[0][0] : '?';
    var last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  // Deterministic pleasant hue from the name, so colors are stable across loads.
  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 52% 45%)';
  }

  function buildForest(members) {
    var byId = {};
    var roots = [];
    members.forEach(function (m, i) {
      m.__key = m.id != null ? String(m.id) : '__anon' + i;
      m.__kids = [];
      byId[m.__key] = m;
    });
    members.forEach(function (m) {
      var parent = m.parent != null ? byId[String(m.parent)] : null;
      if (parent && parent !== m) parent.__kids.push(m);
      else roots.push(m);
    });
    return roots;
  }

  function personCard(member, deptName) {
    var birth = parseBirth(member.birthdate);
    var card = document.createElement('div');
    card.className = 'card';

    var av = document.createElement('div');
    av.className = 'avatar';
    av.style.background = avatarColor(member.name || '?');
    av.textContent = initials(member.name || '?');
    card.appendChild(av);

    var name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = member.name || 'Unnamed';
    card.appendChild(name);

    var role = document.createElement('div');
    role.className = 'p-role';
    role.textContent = member.role || '';
    card.appendChild(role);

    var born = document.createElement('div');
    born.className = 'p-born';
    born.textContent = birth ? 'Born ' + formatBorn(birth) : 'Birthdate to come';
    card.appendChild(born);

    var age = document.createElement('div');
    age.className = birth ? 'p-age' : 'p-age undated';
    age.textContent = birth ? '...' : 'age unknown';
    card.appendChild(age);

    var flag = document.createElement('div');
    flag.className = 'bday-flag';
    flag.hidden = true;
    card.appendChild(flag);

    // Everyone joins the list, dated or not, so search and headcount cover them.
    people.push({
      name: member.name || '',
      role: member.role || '',
      dept: deptName,
      birth: birth,
      card: card,
      ageEl: age,
      flagEl: flag
    });
    return card;
  }

  function renderNode(member, deptName, seen) {
    seen = seen || [];
    if (seen.indexOf(member) > -1) return document.createElement('li');
    seen = seen.concat([member]);
    var li = document.createElement('li');
    li.appendChild(personCard(member, deptName));
    if (member.__kids.length) {
      var ul = document.createElement('ul');
      member.__kids.forEach(function (kid) { ul.appendChild(renderNode(kid, deptName, seen)); });
      li.appendChild(ul);
    }
    return li;
  }

  function renderDept(family) {
    var dept = document.createElement('section');
    dept.className = 'dept';

    var head = document.createElement('div');
    head.className = 'dept-head';
    head.innerHTML =
      '<span class="dept-caret">&#9660;</span>' +
      '<span class="dept-name"></span>' +
      '<span class="dept-tagline"></span>' +
      '<span class="dept-count"></span>';
    head.querySelector('.dept-name').textContent = family.name || 'Department';
    head.querySelector('.dept-tagline').textContent = family.tagline || '';
    var n = (family.members || []).length;
    head.querySelector('.dept-count').textContent = n + (n === 1 ? ' member' : ' members');
    head.addEventListener('click', function () {
      dept.dataset.collapsed = dept.dataset.collapsed === 'true' ? 'false' : 'true';
    });
    dept.appendChild(head);

    var wrap = document.createElement('div');
    wrap.className = 'tree-wrap';
    var tree = document.createElement('div');
    tree.className = 'tree';
    var ul = document.createElement('ul');
    buildForest(family.members || []).forEach(function (root) {
      ul.appendChild(renderNode(root, family.name || ''));
    });
    tree.appendChild(ul);
    wrap.appendChild(tree);
    dept.appendChild(wrap);
    return dept;
  }

  // The local preview and the published site otherwise look identical, which makes it
  // easy to think you are looking at published data when you are not.
  function markLocalPreview() {
    var host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '') return;
    if (document.getElementById('local-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'local-banner';
    bar.innerHTML =
      '<strong>Local preview</strong> &mdash; unpublished changes on this Mac. ' +
      'The live site is <a href="https://brooks-neal.github.io/roster-draft-t7qm/">brooks-neal.github.io/roster-draft-t7qm</a>.';
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('has-local-banner');
  }

  function render() {
    document.getElementById('org-title').textContent = data.title || 'Org Chart';
    document.title = data.title || 'Org Chart';
    document.getElementById('org-sub').textContent = data.subtitle || '';

    var chart = document.getElementById('chart');
    chart.textContent = '';
    people = [];
    (data.families || []).forEach(function (family) { chart.appendChild(renderDept(family)); });

    var undated = people.filter(function (p) { return !p.birth; }).length;
    document.getElementById('s-count').innerHTML =
      people.length + (undated ? ' <small>(' + undated + ' need a date)</small>' : '');
    document.getElementById('s-depts').textContent = (data.families || []).length;
  }

  /* ------------------------------------------------------------------- ticks */

  function tick() {
    var now = new Date();
    var totalYears = 0;
    var soonest = null;

    var dated = 0;
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (!p.birth) continue;
      dated++;
      var parts = ageParts(p.birth, now);
      p.ageEl.innerHTML = formatAge(parts);
      totalYears += (now - p.birth) / 31557600000; // 365.25d, for the aggregate stats only

      var next = nextBirthday(p.birth, now);
      var daysAway = Math.ceil((next - now) / 86400000);
      var isToday =
        p.birth.getDate() === now.getDate() && p.birth.getMonth() === now.getMonth();
      if (isToday) {
        p.flagEl.hidden = false;
        p.flagEl.className = 'bday-flag today';
        p.flagEl.textContent = 'Birthday today';
      } else if (daysAway <= 14) {
        p.flagEl.hidden = false;
        p.flagEl.className = 'bday-flag';
        p.flagEl.textContent = daysAway === 1 ? 'Tomorrow' : 'in ' + daysAway + ' days';
      } else {
        p.flagEl.hidden = true;
      }
      if (!soonest || next < soonest.when) soonest = { when: next, person: p, days: daysAway, today: isToday };
    }

    var missing = people.length - dated;
    var qualifier = missing ? ' <small>(' + dated + ' with dates)</small>' : '';
    if (dated) {
      document.getElementById('s-total').innerHTML =
        Math.floor(totalYears) + ' <small>years</small>' + qualifier;
      document.getElementById('s-avg').innerHTML =
        (totalYears / dated).toFixed(1) + ' <small>years</small>';
      document.getElementById('s-next').innerHTML = soonest
        ? soonest.person.name + ' <small>' + (soonest.today ? 'today' : 'in ' + soonest.days + 'd') + '</small>'
        : '&mdash;';
    } else {
      document.getElementById('s-total').innerHTML = '&mdash;';
      document.getElementById('s-avg').innerHTML = '&mdash;';
      document.getElementById('s-next').innerHTML = '<small>no birthdates yet</small>';
    }

    document.getElementById('clock').textContent =
      'Live as of ' + now.toLocaleTimeString();

  }

  /* ------------------------------------------------------------------ search */

  function applySearch(q) {
    var query = q.trim().toLowerCase();
    people.forEach(function (p) {
      if (!query) {
        p.card.classList.remove('dim', 'hit');
        return;
      }
      var hit =
        p.name.toLowerCase().indexOf(query) > -1 ||
        p.role.toLowerCase().indexOf(query) > -1 ||
        p.dept.toLowerCase().indexOf(query) > -1;
      p.card.classList.toggle('dim', !hit);
      p.card.classList.toggle('hit', hit);
    });
  }

  /* ------------------------------------------------------------------ unlock */

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function drop(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* private mode */ }
  }

  function start(decoded) {
    data = decoded;
    document.getElementById('lock').hidden = true;
    document.getElementById('lock').style.display = 'none';
    document.getElementById('app').hidden = false;
    render();
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 250);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(timer);
        timer = null;
      } else if (!timer) {
        tick();
        timer = setInterval(tick, 250);
      }
    });
  }

  function attemptUnlock(passphrase, remember) {
    var err = document.getElementById('lock-error');
    var btn = document.getElementById('unlock');
    err.textContent = '';
    btn.disabled = true;
    return decrypt(passphrase, window.__ORG_DATA__)
      .then(function (decoded) {
        if (remember) store(STORAGE_KEY, passphrase);
        start(decoded);
        return true;
      })
      .catch(function () {
        btn.disabled = false;
        return false;
      });
  }

  function boot() {
    markLocalPreview();
    if (!window.__ORG_DATA__) {
      document.getElementById('lock-error').textContent =
        'data.enc.js is missing. Run: node build.mjs';
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      document.getElementById('lock-error').textContent =
        'This browser blocks decryption here. Open the site over https:// or http://localhost.';
      return;
    }

    var seconds = read(PREF_SECONDS);
    if (seconds === 'off') showSeconds = false;
    var secBtn = document.getElementById('toggle-precision');
    secBtn.textContent = 'Seconds: ' + (showSeconds ? 'on' : 'off');
    secBtn.setAttribute('aria-pressed', String(showSeconds));
    secBtn.addEventListener('click', function () {
      showSeconds = !showSeconds;
      secBtn.textContent = 'Seconds: ' + (showSeconds ? 'on' : 'off');
      secBtn.setAttribute('aria-pressed', String(showSeconds));
      store(PREF_SECONDS, showSeconds ? 'on' : 'off');
    });

    document.getElementById('lock-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pass = document.getElementById('passphrase').value;
      var remember = document.getElementById('remember').checked;
      if (!pass) return;
      attemptUnlock(pass, remember).then(function (ok) {
        if (!ok) {
          document.getElementById('lock-error').textContent = 'Wrong passphrase.';
          document.getElementById('passphrase').select();
        }
      });
    });

    document.getElementById('search').addEventListener('input', function (e) {
      applySearch(e.target.value);
    });

    document.getElementById('toggle-all').addEventListener('click', function (e) {
      var collapse = e.target.textContent.indexOf('Collapse') === 0;
      document.querySelectorAll('.dept').forEach(function (d) {
        d.dataset.collapsed = String(collapse);
      });
      e.target.textContent = collapse ? 'Expand all' : 'Collapse all';
    });

    document.getElementById('lock-again').addEventListener('click', function () {
      drop(STORAGE_KEY);
      window.location.reload();
    });

    var saved = read(STORAGE_KEY);
    if (saved) {
      document.getElementById('remember').checked = true;
      attemptUnlock(saved, false).then(function (ok) {
        if (!ok) drop(STORAGE_KEY);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
