// Sucka Free Collective site backend.
//
// Everything in ./public is served as-is by Cloudflare. This Worker only
// handles two kinds of requests:
//
//   POST /api/signup         email list sign-ups from the site's forms
//   POST /api/join           founding member sign-ups from the Membership page
//   GET  /api/founding       how many founding members so far (for the progress bar)
//   /admin ...               password-protected lists of members and sign-ups
//
// Sign-ups are stored in a Cloudflare D1 database (binding DB) and, when the
// SHEET_WEBHOOK_URL and SHEET_SECRET secrets are set, copied to the
// collective's Google Sheet through a small Apps Script (google-sheet/Code.gs).
//
// Secrets (Cloudflare dashboard > the Worker > Settings > Variables and Secrets):
//   ADMIN_PASSWORD     password for /admin (any username works)
//   SHEET_WEBHOOK_URL  the Apps Script web app URL
//   SHEET_SECRET       shared secret, same value as SECRET in Code.gs
// Optional variables:
//   FOUNDING_GOAL_MONTHLY   dollars a month, defaults to 3000
//   FOUNDING_OFFSET         founding members who joined offline, added to the count
//   FOUNDING_OFFSET_MONTHLY their monthly dollars, added to the total

const SCHEMA = `CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  skills TEXT,
  member TEXT,
  source TEXT,
  page TEXT,
  created_at TEXT NOT NULL,
  sheet_status TEXT
)`;

const MEMBERS_SCHEMA = `CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first TEXT, last TEXT, phone TEXT, org TEXT,
  tier TEXT NOT NULL, amount INTEGER NOT NULL,
  wall TEXT, skills TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'signed up',
  created_at TEXT NOT NULL,
  sheet_status TEXT
)`;

const TIERS = {
  rider: { name: 'Rider', amount: 15 },
  daytripper: { name: 'Day Tripper', amount: 45 },
  nightowl: { name: 'Night Owl', amount: 95 },
  partner: { name: 'Partner Org', amount: 150 },
  supporter: { name: 'Founding Supporter', amount: null, min: 100 },
  pwyc: { name: 'Rider (pay what you can)', amount: null, min: 5 },
};
const STATUSES = ['signed up', 'paying', 'cancelled'];

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const TZ = 'America/Los_Angeles';

// Columns added after the first version; older databases get them on the fly.
const LATER_COLUMNS = ['skills', 'member'];

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.prepare(SCHEMA).run();
      await env.DB.prepare(MEMBERS_SCHEMA).run();
      const { results } = await env.DB.prepare('PRAGMA table_info(signups)').all();
      const have = new Set(results.map((c) => c.name));
      for (const col of LATER_COLUMNS) {
        if (!have.has(col)) await env.DB.prepare(`ALTER TABLE signups ADD COLUMN ${col} TEXT`).run();
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/api/signup') {
        if (request.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405, { Allow: 'POST' });
        return await handleSignup(request, env, ctx);
      }
      if (path === '/api/join') {
        if (request.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405, { Allow: 'POST' });
        return await handleJoin(request, env, ctx);
      }
      if (path === '/api/founding') {
        await ensureSchema(env);
        return json(await foundingStats(env), 200, { 'Cache-Control': 'public, max-age=30' });
      }
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await handleAdmin(request, env, ctx, url, path);
      }
    } catch (err) {
      console.error('request failed', path, err && err.stack || err);
      if (path.startsWith('/api/')) return json({ ok: false, error: 'server error' }, 500);
      return new Response('Something went wrong. Check the Worker logs in Cloudflare.', { status: 500 });
    }

    // Anything else is a regular page or file.
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------- sign-ups

async function handleSignup(request, env, ctx) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'bad origin' }, 403);

  let data;
  const type = request.headers.get('Content-Type') || '';
  try {
    if (type.includes('application/json')) data = await request.json();
    else data = Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Bots fill in the hidden "website" field. Pretend it worked.
  if (clean(data.website, 200)) return json({ ok: true, already: false });

  const email = clean(data.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid email' }, 400);

  const row = {
    email,
    name: clean(data.name, 80),
    skills: clean(data.skills, 300),
    member: data.member === true || data.member === 'yes' || data.member === 'on' ? 'yes' : '',
    source: clean(data.source, 40),
    page: clean(data.page, 40),
    created_at: new Date().toISOString(),
  };

  await ensureSchema(env);
  const result = await env.DB.prepare(
    `INSERT INTO signups (email, name, skills, member, source, page, created_at, sheet_status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')
     ON CONFLICT(email) DO NOTHING`
  ).bind(row.email, row.name, row.skills, row.member, row.source, row.page, row.created_at).run();

  const isNew = result.meta && result.meta.changes > 0;
  if (isNew) ctx.waitUntil(sendToSheet(env, row));
  return json({ ok: true, already: !isNew });
}

// --------------------------------------------------------- founding members

function foundingGoal(env) { return Number(env.FOUNDING_GOAL_MONTHLY) > 0 ? Number(env.FOUNDING_GOAL_MONTHLY) : 3000; }

async function foundingStats(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM members WHERE status != 'cancelled'").first();
  const extraN = Number(env.FOUNDING_OFFSET) > 0 ? Math.floor(Number(env.FOUNDING_OFFSET)) : 0;
  const extra$ = Number(env.FOUNDING_OFFSET_MONTHLY) > 0 ? Math.floor(Number(env.FOUNDING_OFFSET_MONTHLY)) : 0;
  return { ok: true, count: r.n + extraN, monthly: r.total + extra$, goal_monthly: foundingGoal(env) };
}

async function foundingCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE status != 'cancelled'").first();
  return r.n + (Number(env.FOUNDING_OFFSET) > 0 ? Math.floor(Number(env.FOUNDING_OFFSET)) : 0);
}

async function handleJoin(request, env, ctx) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'bad origin' }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  if (clean(data.website, 200)) return json({ ok: true });

  const email = clean(data.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid email' }, 400);
  const tierKey = clean(data.tier, 20);
  const tier = TIERS[tierKey];
  if (!tier) return json({ ok: false, error: 'invalid level' }, 400);
  let amount = tier.amount;
  if (amount == null) {
    amount = Math.round(Number(data.amount));
    if (!(amount >= tier.min && amount <= 10000)) return json({ ok: false, error: 'invalid amount' }, 400);
  }
  const first = clean(data.first, 80), last = clean(data.last, 80);
  if (!first || !last) return json({ ok: false, error: 'missing name' }, 400);

  const row = {
    email, first, last,
    phone: clean(data.phone, 40), org: clean(data.org, 120),
    tier: tierKey, tier_name: tier.name, amount,
    wall: clean(data.wall, 80), skills: clean(data.skills, 300), notes: clean(data.notes, 2000),
    created_at: new Date().toISOString(),
  };

  await ensureSchema(env);
  const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?1').bind(email).first();
  if (existing) {
    // Same person signing up again: keep their original date, update their choices.
    await env.DB.prepare(
      `UPDATE members SET first=?2, last=?3, phone=?4, org=?5, tier=?6, amount=?7, wall=?8, skills=?9, notes=?10,
         status = CASE WHEN status = 'cancelled' THEN 'signed up' ELSE status END, sheet_status='pending'
       WHERE email = ?1`
    ).bind(email, row.first, row.last, row.phone, row.org, row.tier, row.amount, row.wall, row.skills, row.notes).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO members (email, first, last, phone, org, tier, amount, wall, skills, notes, created_at, sheet_status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending')`
    ).bind(email, row.first, row.last, row.phone, row.org, row.tier, row.amount, row.wall, row.skills, row.notes, row.created_at).run();
  }

  // Founding members also go on the email list.
  const listRow = { email, name: first, skills: row.skills, member: 'yes', source: 'membership', page: 'membership', created_at: row.created_at };
  const listed = await env.DB.prepare(
    `INSERT INTO signups (email, name, skills, member, source, page, created_at, sheet_status)
     VALUES (?1, ?2, ?3, 'yes', 'membership', 'membership', ?4, 'pending') ON CONFLICT(email) DO NOTHING`
  ).bind(email, first, row.skills, row.created_at).run();

  ctx.waitUntil((async () => {
    await sendMemberToSheet(env, { ...row, status: 'signed up', updated: Boolean(existing) });
    if (listed.meta && listed.meta.changes > 0) await sendToSheet(env, listRow);
  })());

  return json({ ...(await foundingStats(env)), updated: Boolean(existing) });
}

async function postToSheet(env, payload) {
  if (!env.SHEET_WEBHOOK_URL || !env.SHEET_SECRET) return 'not set up';
  try {
    const res = await fetch(env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.SHEET_SECRET, ...payload }),
      redirect: 'follow',
    });
    const text = await res.text();
    let reply = null;
    try { reply = JSON.parse(text); } catch { /* Apps Script error pages are HTML */ }
    return res.ok && reply && reply.ok ? 'sent' : 'error: ' + (reply && reply.error || 'HTTP ' + res.status);
  } catch (err) {
    return 'error: ' + String(err && err.message || err).slice(0, 120);
  }
}

async function sendMemberToSheet(env, row) {
  const status = await postToSheet(env, { kind: 'member', ...row });
  await env.DB.prepare('UPDATE members SET sheet_status = ?1 WHERE email = ?2').bind(status, row.email).run();
  return status;
}

async function sendToSheet(env, row) {
  const status = await postToSheet(env, { ...row, status: row.member ? 'Interested' : 'Lead' });
  await env.DB.prepare('UPDATE signups SET sheet_status = ?1 WHERE email = ?2').bind(status, row.email).run();
  return status;
}

// ------------------------------------------------------------------- admin

async function handleAdmin(request, env, ctx, url, path) {
  if (!env.ADMIN_PASSWORD) {
    return page('Admin is not set up yet',
      '<p>Add a secret named <b>ADMIN_PASSWORD</b> to this Worker in the Cloudflare dashboard, then reload.</p>', 503);
  }
  if (!(await checkPassword(request, env.ADMIN_PASSWORD))) {
    return new Response('Password needed.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Sucka Free admin", charset="UTF-8"', 'Cache-Control': 'no-store' },
    });
  }
  await ensureSchema(env);

  if (request.method === 'POST') {
    if (!sameOrigin(request)) return new Response('Bad origin', { status: 403 });
    const form = await request.formData();
    if (path === '/admin/delete') {
      const id = Number(form.get('id'));
      if (Number.isInteger(id)) await env.DB.prepare('DELETE FROM signups WHERE id = ?1').bind(id).run();
      return redirect('/admin?msg=deleted');
    }
    if (path === '/admin/member-status') {
      const id = Number(form.get('id')), st = String(form.get('status') || '');
      if (Number.isInteger(id) && STATUSES.includes(st)) await env.DB.prepare('UPDATE members SET status = ?1 WHERE id = ?2').bind(st, id).run();
      return redirect('/admin?msg=updated#members');
    }
    if (path === '/admin/member-delete') {
      const id = Number(form.get('id'));
      if (Number.isInteger(id)) await env.DB.prepare('DELETE FROM members WHERE id = ?1').bind(id).run();
      return redirect('/admin?msg=deleted#members');
    }
    if (path === '/admin/resend') {
      const { results } = await env.DB.prepare(
        "SELECT email, name, skills, member, source, page, created_at FROM signups WHERE sheet_status IS NULL OR sheet_status != 'sent' ORDER BY id LIMIT 40"
      ).all();
      let sent = 0;
      for (const row of results) if ((await sendToSheet(env, row)) === 'sent') sent++;
      const mem = await env.DB.prepare(
        "SELECT * FROM members WHERE sheet_status IS NULL OR sheet_status != 'sent' ORDER BY id LIMIT 40"
      ).all();
      for (const m of mem.results) {
        if ((await sendMemberToSheet(env, { ...m, tier_name: (TIERS[m.tier] || {}).name || m.tier })) === 'sent') sent++;
      }
      results.push(...mem.results);
      return redirect('/admin?msg=resent-' + sent + '-of-' + results.length);
    }
    return new Response('Not found', { status: 404 });
  }

  if (path === '/admin/members.csv') {
    const { results } = await env.DB.prepare('SELECT * FROM members ORDER BY id').all();
    const header = ['signed_up', 'first', 'last', 'email', 'phone', 'level', 'monthly', 'status', 'founders_wall', 'organization', 'skills', 'notes'];
    const lines = [header.join(',')].concat(results.map((r) =>
      [r.created_at, r.first, r.last, r.email, r.phone, (TIERS[r.tier] || {}).name || r.tier, r.amount, r.status, r.wall, r.org, r.skills, r.notes].map(csvCell).join(',')));
    return new Response(lines.join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="suckafree-founding-members.csv"', 'Cache-Control': 'no-store' },
    });
  }

  if (path === '/admin/signups.csv') {
    const { results } = await env.DB.prepare('SELECT * FROM signups ORDER BY id').all();
    const header = ['signed_up', 'name', 'email', 'wants_membership', 'skills', 'source', 'page', 'sheet_status'];
    const lines = [header.join(',')].concat(results.map((r) =>
      [r.created_at, r.name, r.email, r.member, r.skills, r.source, r.page, r.sheet_status].map(csvCell).join(',')));
    return new Response(lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="suckafree-signups.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (path !== '/admin') return new Response('Not found', { status: 404 });

  const { results } = await env.DB.prepare('SELECT * FROM signups ORDER BY id DESC LIMIT 1000').all();
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM signups').first()).n;
  const members = (await env.DB.prepare("SELECT COUNT(*) AS n FROM signups WHERE member = 'yes'").first()).n;
  const waiting = results.filter((r) => r.sheet_status !== 'sent').length;
  const sheetReady = Boolean(env.SHEET_WEBHOOK_URL && env.SHEET_SECRET);
  const mem = (await env.DB.prepare('SELECT * FROM members ORDER BY id DESC').all()).results;
  const live = mem.filter((m) => m.status !== 'cancelled');
  const pledged = live.reduce((t, m) => t + (m.amount || 0), 0);
  const paying = live.filter((m) => m.status === 'paying');
  const payingSum = paying.reduce((t, m) => t + (m.amount || 0), 0);
  const stats = await foundingStats(env);
  const memWaiting = mem.filter((m) => m.sheet_status !== 'sent').length;
  const msg = url.searchParams.get('msg') || '';
  const note = msg === 'updated' ? 'Updated.' : msg === 'deleted' ? 'Removed.'
    : msg.startsWith('resent-') ? 'Sent ' + msg.split('-')[1] + ' of ' + msg.split('-')[3] + ' to the sheet.' : '';

  const rows = results.map((r) => `<tr>
      <td>${esc(fmtDate(r.created_at))}</td>
      <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
      <td>${esc(r.name || '')}</td>
      <td>${r.member ? 'Yes' : ''}</td>
      <td>${esc(r.skills || '')}</td>
      <td>${esc(r.source || '')}${r.page ? ' · ' + esc(r.page) : ''}</td>
      <td class="${r.sheet_status === 'sent' ? 'ok' : 'warn'}">${esc(r.sheet_status || 'pending')}</td>
      <td><form method="post" action="/admin/delete" onsubmit="return confirm('Remove ${esc(r.email)}?')"><input type="hidden" name="id" value="${r.id}"><button class="x" type="submit">Remove</button></form></td>
    </tr>`).join('');

  const memRows = mem.map((m) => `<tr class="${m.status === 'cancelled' ? 'off' : ''}">
      <td>${esc(fmtDate(m.created_at))}</td>
      <td>${esc(m.first + ' ' + m.last)}${m.org ? '<br><small>' + esc(m.org) + '</small>' : ''}</td>
      <td><a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.phone ? '<br><small>' + esc(m.phone) + '</small>' : ''}</td>
      <td>${esc((TIERS[m.tier] || {}).name || m.tier)}</td>
      <td class="num">$${m.amount}</td>
      <td><form method="post" action="/admin/member-status"><input type="hidden" name="id" value="${m.id}">
        <select name="status" onchange="this.form.submit()">${STATUSES.map((st) => `<option${st === m.status ? ' selected' : ''}>${st}</option>`).join('')}</select>
        <noscript><button class="x">Save</button></noscript></form></td>
      <td>${esc(m.wall || '')}</td>
      <td>${esc(m.skills || '')}${m.notes ? '<br><small>' + esc(m.notes) + '</small>' : ''}</td>
      <td class="${m.sheet_status === 'sent' ? 'ok' : 'warn'}">${esc(m.sheet_status || 'pending')}</td>
      <td><form method="post" action="/admin/member-delete" onsubmit="return confirm('Remove ${esc(m.email)} completely?')"><input type="hidden" name="id" value="${m.id}"><button class="x" type="submit">Remove</button></form></td>
    </tr>`).join('');

  return page('Members and sign-ups', `
    <h2 id="members">Founding members</h2>
    <div class="bar">
      <p class="big">$${stats.monthly.toLocaleString('en-US')} of $${stats.goal_monthly.toLocaleString('en-US')}/month signed up · ${stats.count} members · ${paying.length} paying ($${payingSum.toLocaleString('en-US')}/month)</p>
      <div class="actions"><a class="btn" href="/admin/members.csv">Download members CSV</a></div>
    </div>
    <p class="hint">Set someone to <b>paying</b> once their monthly payment is set up. <b>Cancelled</b> takes them off the count on the site.</p>
    ${mem.length ? `<div class="scroll"><table>
      <thead><tr><th>Joined</th><th>Name</th><th>Contact</th><th>Level</th><th>Monthly</th><th>Status</th><th>Founders wall</th><th>Skills / notes</th><th>Sheet</th><th></th></tr></thead>
      <tbody>${memRows}</tbody></table></div>` : '<p>No founding members yet.</p>'}
    <h2 id="list">Email list</h2>
    <div class="bar">
      <p class="big">${total} ${total === 1 ? 'person' : 'people'} on the list · ${members} interested in membership</p>
      <div class="actions">
        <a class="btn" href="/admin/signups.csv">Download email list CSV</a>
        ${sheetReady && (waiting + memWaiting) ? `<form method="post" action="/admin/resend"><button class="btn" type="submit">Send ${waiting + memWaiting} missing to the sheet</button></form>` : ''}
      </div>
    </div>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    ${sheetReady ? '' : '<p class="note">The Google Sheet copy is not set up yet. Sign-ups are still saved here.</p>'}
    ${results.length ? `<div class="scroll"><table>
      <thead><tr><th>Signed up</th><th>Email</th><th>Name</th><th>Member?</th><th>Skills</th><th>From</th><th>Sheet</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p>No sign-ups yet.</p>'}
  `);
}

async function checkPassword(request, expected) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const given = decoded.slice(decoded.indexOf(':') + 1);
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// ----------------------------------------------------------------- helpers

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients and older browsers
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet formulas from running
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function redirect(to) {
  return new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

function page(title, body, status = 200) {
  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Sucka Free admin</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
:root{--cream:#fbf8ef;--ink:#0b0b0b;--green:#2f9e5b;--mustard:#e6b95c;--tomato:#ee5a35}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:Archivo,Arial,sans-serif;line-height:1.5}
header{display:flex;align-items:center;gap:16px;padding:16px clamp(16px,4vw,48px);border-bottom:3px solid var(--ink)}
header a{font-weight:800;font-stretch:66%;text-transform:uppercase;font-size:1.5rem;text-decoration:none;color:inherit}
main{padding:clamp(20px,4vw,48px);max-width:1200px;margin:0 auto;display:grid;gap:18px}
h1{margin:0;font-stretch:62%;font-weight:800;text-transform:uppercase;font-size:clamp(2.6rem,7vw,4.5rem);line-height:.9}
.bar{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between}
.big{margin:0;font-stretch:70%;font-weight:700;text-transform:uppercase;font-size:1.5rem}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.actions form{margin:0}
.btn{display:inline-block;font:inherit;font-stretch:70%;font-weight:700;text-transform:uppercase;font-size:1.05rem;padding:10px 16px;border:2px solid var(--ink);background:var(--ink);color:var(--cream);text-decoration:none;cursor:pointer}
.btn:hover{background:var(--cream);color:var(--ink)}
.note{margin:0;background:var(--mustard);padding:10px 14px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{text-align:left;padding:10px 12px;border-bottom:2px solid var(--ink);vertical-align:top}
th{font-stretch:72%;text-transform:uppercase;font-size:.9rem}
td.ok{color:var(--green);font-weight:700}
td.warn{color:var(--tomato);font-weight:700}
td form{margin:0}
h2{margin:18px 0 0;font-stretch:66%;font-weight:800;text-transform:uppercase;font-size:clamp(1.8rem,4vw,2.6rem);line-height:.95}
.hint{margin:0;font-size:.95rem}
td.num{font-variant-numeric:tabular-nums;font-weight:700}
tr.off td{opacity:.45}
small{font-size:.85rem;opacity:.8}
select{font:inherit;font-size:.9rem;padding:4px 6px;border:1px solid var(--ink);background:#fff}
.x{font:inherit;font-size:.85rem;background:none;border:1px solid var(--ink);padding:4px 8px;cursor:pointer}
a{color:inherit}
</style></head>
<body><header><a href="/">Sucka Free</a><span>Admin</span></header>
<main><h1>${esc(title)}</h1>${body}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
