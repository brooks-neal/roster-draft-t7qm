/* Local editor for people.json. Talks to edit.mjs on 127.0.0.1 only. */
(function () {
  'use strict';

  var model = { title: '', subtitle: '', families: [] };
  var dirty = false;

  /* --------------------------------------------------------------- helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function note(msg, bad) {
    var n = document.getElementById('save-note');
    n.textContent = msg || '';
    n.classList.toggle('bad', !!bad);
  }

  // Native confirm() is unavailable in some browser contexts (it silently returns
  // false), so removal is confirmed with a second click on the button itself.
  function armConfirm(btn, armedLabel, onGo) {
    var original = btn.textContent;
    var armed = false;
    var timer = null;
    function disarm() {
      armed = false;
      btn.textContent = original;
      btn.classList.remove('armed');
      if (timer) clearTimeout(timer);
    }
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        btn.textContent = armedLabel;
        btn.classList.add('armed');
        timer = setTimeout(disarm, 4000);
        return;
      }
      disarm();
      onGo();
    });
    btn.addEventListener('blur', disarm);
  }

  var undoSnapshot = null;

  function snapshot() {
    undoSnapshot = JSON.parse(JSON.stringify(model));
  }

  function offerUndo(message) {
    var n = document.getElementById('save-note');
    n.classList.remove('bad');
    n.textContent = message + ' ';
    var undo = el('button', 'ed-undo', 'Undo');
    undo.type = 'button';
    undo.addEventListener('click', function () {
      if (!undoSnapshot) return;
      model = undoSnapshot;
      undoSnapshot = null;
      document.getElementById('meta-title').value = model.title;
      document.getElementById('meta-subtitle').value = model.subtitle;
      markDirty();
      render();
      note('Restored. Save to keep it.');
    });
    n.appendChild(undo);
  }

  function markDirty() {
    dirty = true;
    document.getElementById('dirty').hidden = false;
    note('');
  }

  function markClean() {
    dirty = false;
    document.getElementById('dirty').hidden = true;
  }

  function slugId(name, taken) {
    var base = String(name || 'person').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';
    var id = base;
    var n = 2;
    while (taken.indexOf(id) > -1) id = base + '-' + n++;
    return id;
  }

  // Whole years only - the live site does the second-by-second version.
  function yearsOld(birthdate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate || ''));
    if (!m) return null;
    var birth = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(birth.getTime())) return null;
    var now = new Date();
    var years = now.getFullYear() - birth.getFullYear();
    var anniv = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (anniv > now) years -= 1;
    return years;
  }

  // A person cannot report to their own descendant, or the tree would loop.
  function descendantsOf(family, id) {
    var out = [];
    var frontier = [id];
    var guard = 0;
    while (frontier.length && guard++ < 500) {
      var current = frontier.pop();
      family.members.forEach(function (m) {
        if (String(m.parent) === String(current) && out.indexOf(m.id) === -1) {
          out.push(m.id);
          frontier.push(m.id);
        }
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- render */

  function renderMemberRow(family, member, index) {
    var tr = el('tr');

    var tdName = el('td');
    var name = el('input');
    name.type = 'text';
    name.value = member.name || '';
    name.placeholder = 'Full name';
    name.addEventListener('input', function () {
      member.name = name.value;
      markDirty();
    });
    // Give the row a readable id once it has a name, keeping any children attached.
    name.addEventListener('change', function () {
      if (!member.name || !/^person(-\d+)?$/.test(member.id)) return;
      var taken = family.members.filter(function (o) { return o !== member; }).map(function (o) { return o.id; });
      var oldId = member.id;
      var newId = slugId(member.name, taken);
      if (newId === oldId) return;
      member.id = newId;
      family.members.forEach(function (o) {
        if (String(o.parent) === String(oldId)) o.parent = newId;
      });
      render();
    });
    tdName.appendChild(name);
    tr.appendChild(tdName);

    var tdRole = el('td');
    var role = el('input');
    role.type = 'text';
    role.value = member.role || '';
    role.placeholder = 'Chief Executive Dad';
    role.addEventListener('input', function () {
      member.role = role.value;
      markDirty();
    });
    tdRole.appendChild(role);
    tr.appendChild(tdRole);

    var tdDate = el('td');
    var date = el('input');
    date.type = 'date';
    date.value = (member.birthdate || '').slice(0, 10);
    date.addEventListener('input', function () {
      member.birthdate = date.value;
      markDirty();
      paintAge();
    });
    tdDate.appendChild(date);
    tr.appendChild(tdDate);

    var tdAge = el('td', 'ed-age');
    tr.appendChild(tdAge);
    function paintAge() {
      var y = yearsOld(member.birthdate);
      tdAge.textContent = y == null ? 'set a date' : y + ' yrs';
      tdAge.classList.toggle('bad', y == null);
    }
    paintAge();

    var tdParent = el('td');
    var parent = el('select');
    var blocked = descendantsOf(family, member.id).concat([member.id]);
    var opt0 = el('option', null, 'Top of the family');
    opt0.value = '';
    parent.appendChild(opt0);
    family.members.forEach(function (other) {
      if (blocked.indexOf(other.id) > -1) return;
      var opt = el('option', null, other.name || '(unnamed)');
      opt.value = other.id;
      parent.appendChild(opt);
    });
    parent.value = member.parent || '';
    parent.addEventListener('change', function () {
      if (parent.value) member.parent = parent.value;
      else delete member.parent;
      markDirty();
      render();
    });
    tdParent.appendChild(parent);
    tr.appendChild(tdParent);

    var tdTools = el('td');
    var tools = el('div', 'ed-row-tools');

    var up = el('button', 'icon-btn', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', function () {
      family.members.splice(index - 1, 0, family.members.splice(index, 1)[0]);
      markDirty();
      render();
    });
    tools.appendChild(up);

    var down = el('button', 'icon-btn', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.disabled = index === family.members.length - 1;
    down.addEventListener('click', function () {
      family.members.splice(index + 1, 0, family.members.splice(index, 1)[0]);
      markDirty();
      render();
    });
    tools.appendChild(down);

    var del = el('button', 'icon-btn danger', 'Remove');
    del.type = 'button';
    del.title = 'Remove this person (asks for a second click)';
    armConfirm(del, 'Click to confirm', function () {
      var who = member.name || 'that person';
      snapshot();
      // Anyone who reported to them moves up a level rather than vanishing.
      family.members.forEach(function (other) {
        if (String(other.parent) === String(member.id)) {
          if (member.parent) other.parent = member.parent;
          else delete other.parent;
        }
      });
      family.members.splice(index, 1);
      markDirty();
      render();
      offerUndo('Removed ' + who + '.');
    });
    tools.appendChild(del);

    tdTools.appendChild(tools);
    tr.appendChild(tdTools);
    return tr;
  }

  function renderDept(family, dIndex) {
    var wrap = el('section', 'ed-dept');

    var head = el('div', 'ed-dept-head');
    var name = el('input', 'dept-name-input');
    name.type = 'text';
    name.value = family.name || '';
    name.placeholder = 'Family or group name';
    name.addEventListener('input', function () {
      family.name = name.value;
      markDirty();
    });
    head.appendChild(name);

    var tagline = el('input');
    tagline.type = 'text';
    tagline.value = family.tagline || '';
    tagline.placeholder = 'Optional tagline (e.g. West Coast Branch)';
    tagline.addEventListener('input', function () {
      family.tagline = tagline.value;
      markDirty();
    });
    head.appendChild(tagline);

    var upDept = el('button', 'icon-btn', '↑');
    upDept.type = 'button';
    upDept.title = 'Move department up';
    upDept.disabled = dIndex === 0;
    upDept.addEventListener('click', function () {
      model.families.splice(dIndex - 1, 0, model.families.splice(dIndex, 1)[0]);
      markDirty();
      render();
    });
    head.appendChild(upDept);

    var downDept = el('button', 'icon-btn', '↓');
    downDept.type = 'button';
    downDept.title = 'Move department down';
    downDept.disabled = dIndex === model.families.length - 1;
    downDept.addEventListener('click', function () {
      model.families.splice(dIndex + 1, 0, model.families.splice(dIndex, 1)[0]);
      markDirty();
      render();
    });
    head.appendChild(downDept);

    var delDept = el('button', 'icon-btn danger', 'Delete');
    delDept.type = 'button';
    delDept.title = 'Delete this department and everyone in it';
    armConfirm(delDept, 'Delete ' + family.members.length + ' people?', function () {
      var what = family.name || 'that department';
      snapshot();
      model.families.splice(dIndex, 1);
      markDirty();
      render();
      offerUndo('Deleted ' + what + '.');
    });
    head.appendChild(delDept);
    wrap.appendChild(head);

    var rows = el('div', 'ed-rows');
    if (!family.members.length) {
      rows.appendChild(el('div', 'ed-empty', 'Nobody here yet.'));
    } else {
      var table = el('table', 'ed-table');
      var thead = el('thead');
      var htr = el('tr');
      ['Name', 'Role', 'Birthdate', 'Age', 'Reports to', ''].forEach(function (h) {
        htr.appendChild(el('th', null, h));
      });
      thead.appendChild(htr);
      table.appendChild(thead);
      var tbody = el('tbody');
      family.members.forEach(function (m, i) {
        tbody.appendChild(renderMemberRow(family, m, i));
      });
      table.appendChild(tbody);
      rows.appendChild(table);
    }
    wrap.appendChild(rows);

    var foot = el('div', 'ed-dept-foot');
    var add = el('button', 'ghost', '+ Add a person');
    add.type = 'button';
    add.addEventListener('click', function () {
      var taken = family.members.map(function (m) { return m.id; });
      family.members.push({ id: slugId('person', taken), name: '', role: '', birthdate: '' });
      markDirty();
      render();
      var inputs = wrap.querySelectorAll('tbody tr:last-child input');
      if (inputs.length) inputs[0].focus();
    });
    foot.appendChild(add);
    wrap.appendChild(foot);

    return wrap;
  }

  function render() {
    var host = document.getElementById('depts');
    var scrollY = window.scrollY;
    host.textContent = '';
    if (!model.families.length) {
      host.appendChild(el('div', 'ed-empty', 'No departments yet. Add one below to get started.'));
    }
    model.families.forEach(function (family, i) {
      family.members = family.members || [];
      var taken = [];
      family.members.forEach(function (m) {
        if (!m.id || taken.indexOf(m.id) > -1) m.id = slugId(m.name, taken);
        taken.push(m.id);
      });
      host.appendChild(renderDept(family, i));
    });
    window.scrollTo(0, scrollY);
  }

  /* ------------------------------------------------------------------- I/O */

  function load() {
    return fetch('/api/people')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        model = {
          title: data.title || '',
          subtitle: data.subtitle || '',
          families: (data.families || []).map(function (f) {
            return { name: f.name || '', tagline: f.tagline || '', members: f.members || [] };
          })
        };
        document.getElementById('meta-title').value = model.title;
        document.getElementById('meta-subtitle').value = model.subtitle;
        render();
        markClean();
      })
      .catch(function (err) {
        note('Could not load people.json: ' + err.message, true);
      });
  }

  function cleaned() {
    return {
      title: model.title,
      subtitle: model.subtitle,
      families: model.families.map(function (f) {
        var out = { name: f.name, members: f.members.map(function (m) {
          var person = { id: m.id, name: m.name, birthdate: m.birthdate };
          if (m.role) person.role = m.role;
          if (m.parent) person.parent = m.parent;
          return person;
        }) };
        if (f.tagline) out.tagline = f.tagline;
        return out;
      })
    };
  }

  function save() {
    return fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleaned())
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) throw new Error(res.error);
        markClean();
        note(res.problems && res.problems.length
          ? 'Saved, but: ' + res.problems[0]
          : 'Saved ' + res.people + ' people to people.json');
        return true;
      })
      .catch(function (err) {
        note(err.message, true);
        return false;
      });
  }

  /* ---------------------------------------------------------------- wiring */

  document.getElementById('meta-title').addEventListener('input', function (e) {
    model.title = e.target.value;
    markDirty();
  });
  document.getElementById('meta-subtitle').addEventListener('input', function (e) {
    model.subtitle = e.target.value;
    markDirty();
  });
  document.getElementById('add-dept').addEventListener('click', function () {
    model.families.push({ name: '', tagline: '', members: [] });
    markDirty();
    render();
    var inputs = document.querySelectorAll('.ed-dept .dept-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  document.getElementById('save').addEventListener('click', save);

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  var dialog = document.getElementById('publish-dialog');
  document.getElementById('publish').addEventListener('click', function () {
    document.getElementById('pub-status').textContent = '';
    document.getElementById('pub-status').className = 'ed-status';
    dialog.showModal();
    document.getElementById('pub-pass').focus();
  });

  document.getElementById('pub-go').addEventListener('click', function () {
    var status = document.getElementById('pub-status');
    var pass = document.getElementById('pub-pass').value;
    var go = document.getElementById('pub-go');
    if (pass.length < 6) {
      status.className = 'ed-status bad';
      status.textContent = 'Passphrase must be at least 6 characters.';
      return;
    }
    go.disabled = true;
    status.className = 'ed-status';
    status.textContent = 'Saving, encrypting, pushing...';

    save().then(function (ok) {
      if (!ok) {
        go.disabled = false;
        status.className = 'ed-status bad';
        status.textContent = 'Could not save people.json - nothing was published.';
        return;
      }
      return fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase: pass,
          message: document.getElementById('pub-msg').value || 'Update the org chart',
          encryptOnly: document.getElementById('pub-encrypt-only').checked
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          go.disabled = false;
          document.getElementById('pub-pass').value = '';
          if (res.error) {
            status.className = 'ed-status bad';
            status.textContent = res.error;
          } else {
            status.className = 'ed-status good';
            status.textContent = res.log;
          }
        })
        .catch(function (err) {
          go.disabled = false;
          status.className = 'ed-status bad';
          status.textContent = err.message;
        });
    });
  });

  load();
})();
