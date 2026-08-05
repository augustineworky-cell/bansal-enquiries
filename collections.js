// ============================================================
// COLLECTIONS — Kaccha / Pakka receivables tracking
//
// All ageing, escalation and conversion logic lives in the
// Postgres views (v_collection_pakka / v_collection_kaccha /
// v_collection_dealer_summary). This file only renders what the
// database computes — the rules are deliberately NOT duplicated
// here, so the numbers can never disagree between screens.
// ============================================================
(function () {
  'use strict';

  var sb = function () { return window.supabaseClient; };
  var state = { tab: 'summary', pakka: [], kaccha: [], summary: [], logs: [] };

  // ── helpers ───────────────────────────────────────────────
  function inr(n) {
    var v = Number(n || 0);
    if (v === 0) return '-';
    var s = Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return v < 0 ? '(₹' + s + ')' : '₹' + s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fdate(d) {
    if (!d) return '-';
    var dt = new Date(d);
    if (isNaN(dt)) return '-';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
             .replace(/ /g, '-');
  }

  function bucketPill(b) {
    var cls = { 'Cleared': 'cl-ok', '0-15': 'cl-a', '16-30': 'cl-b', '31-45': 'cl-c', '45+': 'cl-d' }[b] || 'cl-a';
    return '<span class="cl-pill ' + cls + '">' + esc(b) + '</span>';
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'success');
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function addDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ── data ──────────────────────────────────────────────────
  async function loadAll() {
    var body = document.getElementById('clBody');
    if (body) body.innerHTML = '<div class="cl-empty">Loading…</div>';

    try {
      var r = await Promise.all([
        sb().from('v_collection_pakka').select('*').order('days_overdue', { ascending: false }),
        sb().from('v_collection_kaccha').select('*').order('days_overdue', { ascending: false }),
        sb().from('v_collection_dealer_summary').select('*').order('total_outstanding', { ascending: false }),
        sb().from('collection_followups').select('*').order('followup_date', { ascending: false }).limit(200)
      ]);

      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;

      state.pakka = r[0].data || [];
      state.kaccha = r[1].data || [];
      state.summary = r[2].data || [];
      state.logs = r[3].data || [];
      render();
    } catch (e) {
      console.error('Collections load failed:', e);
      if (body) {
        body.innerHTML = '<div class="cl-empty">Could not load collections.<br><small>' +
                         esc(e.message || e) + '</small></div>';
      }
    }
  }

  // ── KPI strip ─────────────────────────────────────────────
  function kpis() {
    var pak = 0, kac = 0, conv = 0, crit = 0;
    state.pakka.forEach(function (r) {
      pak += Number(r.balance || 0);
      if (r.ageing_bucket === '45+') crit += Number(r.balance || 0);
    });
    state.kaccha.forEach(function (r) {
      kac += Number(r.balance || 0);
      if (r.convert_to_pakka === 'YES - raise invoice') conv++;
      if (r.ageing_bucket === '45+') crit += Number(r.balance || 0);
    });

    return '<div class="cl-kpis">' +
      '<div class="cl-kpi"><span>Pakka Outstanding</span><b>' + inr(pak) + '</b></div>' +
      '<div class="cl-kpi"><span>Kaccha Outstanding</span><b>' + inr(kac) + '</b></div>' +
      '<div class="cl-kpi cl-kpi-total"><span>Total Outstanding</span><b>' + inr(pak + kac) + '</b></div>' +
      '<div class="cl-kpi ' + (conv > 0 ? 'cl-kpi-warn' : '') + '"><span>Need Invoicing</span><b>' + conv + '</b></div>' +
      '<div class="cl-kpi ' + (crit > 0 ? 'cl-kpi-bad' : '') + '"><span>45+ Days At Risk</span><b>' + inr(crit) + '</b></div>' +
      '</div>';
  }

  // ── tables ────────────────────────────────────────────────
  function summaryTable() {
    if (!state.summary.length) return '<div class="cl-empty">No dealers yet. Add an entry in Pakka or Kaccha.</div>';
    var h = '<table class="cl-table"><thead><tr>' +
      '<th>Dealer</th><th class="r">Pakka</th><th class="r">Kaccha</th><th class="r">Total</th>' +
      '<th class="r">Oldest (P)</th><th class="r">Oldest (K)</th><th>Escalation</th><th>Next Follow-up</th>' +
      '</tr></thead><tbody>';
    state.summary.forEach(function (d) {
      var stage = String(d.escalation_stage || '');
      var sc = stage.indexOf('Stage 4') === 0 ? 'cl-d'
             : stage.indexOf('Stage 3') === 0 ? 'cl-c'
             : stage.indexOf('Stage 2') === 0 ? 'cl-b'
             : stage.indexOf('Stage 1') === 0 ? 'cl-a' : 'cl-ok';
      h += '<tr><td><b>' + esc(d.dealer_name) + '</b>' +
           (d.pending_conversions > 0 ? ' <span class="cl-flag">' + d.pending_conversions + ' to invoice</span>' : '') +
           '</td>' +
           '<td class="r">' + inr(d.pakka_balance) + '</td>' +
           '<td class="r">' + inr(d.kaccha_balance) + '</td>' +
           '<td class="r"><b>' + inr(d.total_outstanding) + '</b></td>' +
           '<td class="r">' + (d.pakka_oldest_overdue || 0) + 'd</td>' +
           '<td class="r">' + (d.kaccha_oldest_overdue || 0) + 'd</td>' +
           '<td><span class="cl-pill ' + sc + '">' + esc(stage) + '</span></td>' +
           '<td>' + fdate(d.next_followup_date) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function pakkaTable() {
    if (!state.pakka.length) return '<div class="cl-empty">No pakka invoices yet.</div>';
    var h = '<table class="cl-table"><thead><tr>' +
      '<th>Dealer</th><th>Invoice</th><th>Date</th><th>Due</th><th class="r">Amount</th>' +
      '<th class="r">Received</th><th class="r">Balance</th><th class="r">Overdue</th>' +
      '<th>Bucket</th><th>Next Action</th><th></th></tr></thead><tbody>';
    state.pakka.forEach(function (r) {
      h += '<tr><td>' + esc(r.dealer_name) + '</td><td>' + esc(r.invoice_no) + '</td>' +
           '<td>' + fdate(r.invoice_date) + '</td><td>' + fdate(r.due_date) + '</td>' +
           '<td class="r">' + inr(r.invoice_amount) + '</td>' +
           '<td class="r">' + inr(r.amount_received) + '</td>' +
           '<td class="r"><b>' + inr(r.balance) + '</b></td>' +
           '<td class="r">' + (r.days_overdue || 0) + 'd</td>' +
           '<td>' + bucketPill(r.ageing_bucket) + '</td>' +
           '<td><small>' + esc(r.next_action) + '</small></td>' +
           '<td><button class="cl-mini" onclick="clReceive(\'pakka\',' + r.id + ')">Receive</button></td></tr>';
    });
    return h + '</tbody></table>';
  }

  function kacchaTable() {
    if (!state.kaccha.length) return '<div class="cl-empty">No kaccha entries yet.</div>';
    var h = '<table class="cl-table"><thead><tr>' +
      '<th>Dealer</th><th>Entry</th><th>Reference</th><th>Expected</th><th class="r">Amount</th>' +
      '<th class="r">Received</th><th class="r">Balance</th><th class="r">Overdue</th>' +
      '<th>Bucket</th><th>Convert?</th><th></th></tr></thead><tbody>';
    state.kaccha.forEach(function (r) {
      var needs = r.convert_to_pakka === 'YES - raise invoice';
      h += '<tr class="' + (needs ? 'cl-row-warn' : '') + '">' +
           '<td>' + esc(r.dealer_name) + '</td><td>' + fdate(r.entry_date) + '</td>' +
           '<td><small>' + esc(r.reference) + '</small></td>' +
           '<td>' + fdate(r.expected_settlement_date) + '</td>' +
           '<td class="r">' + inr(r.amount) + '</td>' +
           '<td class="r">' + inr(r.amount_received) + '</td>' +
           '<td class="r"><b>' + inr(r.balance) + '</b></td>' +
           '<td class="r">' + (r.days_overdue || 0) + 'd</td>' +
           '<td>' + bucketPill(r.ageing_bucket) + '</td>' +
           '<td>' + (needs
              ? '<span class="cl-pill cl-d">' + esc(r.convert_to_pakka) + '</span>'
              : '<small>' + esc(r.convert_to_pakka) + '</small>') + '</td>' +
           '<td><button class="cl-mini" onclick="clReceive(\'kaccha\',' + r.id + ')">Receive</button>' +
           (needs ? ' <button class="cl-mini cl-mini-warn" onclick="clConvert(' + r.id + ')">Invoice</button>' : '') +
           '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function logTable() {
    if (!state.logs.length) return '<div class="cl-empty">No follow-ups logged yet.</div>';
    var h = '<table class="cl-table"><thead><tr>' +
      '<th>Date</th><th>Dealer</th><th>Type</th><th class="r">Amount</th><th>Mode</th>' +
      '<th>Response / Promise</th><th>Next</th></tr></thead><tbody>';
    state.logs.forEach(function (r) {
      h += '<tr><td>' + fdate(r.followup_date) + '</td><td>' + esc(r.dealer_name) + '</td>' +
           '<td>' + esc(r.ledger_type) + '</td><td class="r">' + inr(r.amount_discussed) + '</td>' +
           '<td>' + esc(r.mode) + '</td><td><small>' + esc(r.response) + '</small></td>' +
           '<td>' + fdate(r.next_followup_date) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function render() {
    var el = document.getElementById('clBody');
    if (!el) return;
    var t = state.tab;
    var table = t === 'summary' ? summaryTable()
              : t === 'pakka'   ? pakkaTable()
              : t === 'kaccha'  ? kacchaTable()
              : logTable();

    var addBtn = t === 'pakka'  ? '<button class="btn btn-primary" onclick="clAdd(\'pakka\')">+ Add Invoice</button>'
               : t === 'kaccha' ? '<button class="btn btn-primary" onclick="clAdd(\'kaccha\')">+ Add Kaccha Entry</button>'
               : t === 'log'    ? '<button class="btn btn-primary" onclick="clAdd(\'log\')">+ Log Follow-up</button>'
               : '';

    el.innerHTML = kpis() +
      '<div class="cl-bar">' +
        '<div class="cl-tabs">' +
          ['summary', 'pakka', 'kaccha', 'log'].map(function (k) {
            var label = { summary: 'Dealer Summary', pakka: 'Pakka Ledger', kaccha: 'Kaccha Ledger', log: 'Follow-up Log' }[k];
            return '<button class="cl-tab' + (t === k ? ' active' : '') + '" onclick="clTab(\'' + k + '\')">' + label + '</button>';
          }).join('') +
        '</div>' + addBtn +
      '</div>' +
      '<div class="cl-scroll">' + table + '</div>';
  }

  // ── actions ───────────────────────────────────────────────
  function clTab(t) { state.tab = t; render(); }

  function dealerList() {
    var seen = {}, out = [];
    state.summary.forEach(function (d) { if (!seen[d.dealer_name]) { seen[d.dealer_name] = 1; out.push(d.dealer_name); } });
    return out.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  function openModal(title, inner, onSave) {
    var wrap = document.createElement('div');
    wrap.className = 'cl-modal-wrap';
    wrap.innerHTML =
      '<div class="cl-modal">' +
        '<div class="cl-modal-head"><h3>' + esc(title) + '</h3>' +
        '<button class="cl-x" type="button">&times;</button></div>' +
        '<div class="cl-modal-body">' + inner + '</div>' +
        '<div class="cl-modal-foot">' +
          '<button class="btn btn-secondary cl-cancel" type="button">Cancel</button>' +
          '<button class="btn btn-primary cl-save" type="button">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { wrap.remove(); }
    wrap.querySelector('.cl-x').onclick = close;
    wrap.querySelector('.cl-cancel').onclick = close;
    wrap.onclick = function (e) { if (e.target === wrap) close(); };

    wrap.querySelector('.cl-save').onclick = async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await onSave(wrap);
        close();
        await loadAll();
      } catch (e) {
        console.error(e);
        toast(e.message || 'Save failed', 'error');
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    };
    return wrap;
  }

  function val(w, id) { var e = w.querySelector('#' + id); return e ? e.value.trim() : ''; }
  function num(w, id) { return Number(val(w, id) || 0); }

  function who() {
    try { return (window.currentUser && window.currentUser.name) || 'Unknown'; } catch (e) { return 'Unknown'; }
  }

  function clAdd(kind) {
    var dl = '<datalist id="clDealers">' + dealerList() + '</datalist>';

    if (kind === 'pakka') {
      openModal('Add Pakka Invoice',
        dl +
        '<div class="cl-grid">' +
        '<label>Dealer Name *<input id="f_dealer" list="clDealers" class="form-input"></label>' +
        '<label>Invoice No. *<input id="f_inv" class="form-input"></label>' +
        '<label>Invoice Date *<input id="f_date" type="date" class="form-input" value="' + today() + '"></label>' +
        '<label>Credit Terms (Days)<input id="f_terms" type="number" class="form-input" value="30"></label>' +
        '<label>Invoice Amount (₹) *<input id="f_amt" type="number" class="form-input" value="0"></label>' +
        '<label>Amount Received (₹)<input id="f_recv" type="number" class="form-input" value="0"></label>' +
        '<label class="cl-full">Remarks<input id="f_rem" class="form-input"></label>' +
        '</div>',
        async function (w) {
          if (!val(w, 'f_dealer') || !val(w, 'f_inv')) throw new Error('Dealer and Invoice No. are required');
          var { error } = await sb().from('collection_pakka').insert({
            dealer_name: val(w, 'f_dealer'), invoice_no: val(w, 'f_inv'),
            invoice_date: val(w, 'f_date'), credit_terms_days: num(w, 'f_terms') || 30,
            invoice_amount: num(w, 'f_amt'), amount_received: num(w, 'f_recv'),
            remarks: val(w, 'f_rem'), created_by: who()
          });
          if (error) throw error;
          toast('Invoice added');
        });

    } else if (kind === 'kaccha') {
      openModal('Add Kaccha Entry',
        dl +
        '<div class="cl-grid">' +
        '<label>Dealer Name *<input id="f_dealer" list="clDealers" class="form-input"></label>' +
        '<label>Entry Date *<input id="f_date" type="date" class="form-input" value="' + today() + '"></label>' +
        '<label class="cl-full">Reference (WhatsApp / verbal note)<input id="f_ref" class="form-input" placeholder="e.g. WhatsApp 12 Jun"></label>' +
        '<label>Expected Settlement *<input id="f_exp" type="date" class="form-input" value="' + addDays(30) + '"></label>' +
        '<label>Amount (₹) *<input id="f_amt" type="number" class="form-input" value="0"></label>' +
        '<label>Amount Received (₹)<input id="f_recv" type="number" class="form-input" value="0"></label>' +
        '<label class="cl-full">Remarks<input id="f_rem" class="form-input"></label>' +
        '</div>' +
        '<p class="cl-note">Unbilled balances still open after 30 days are flagged for invoicing.</p>',
        async function (w) {
          if (!val(w, 'f_dealer')) throw new Error('Dealer name is required');
          var { error } = await sb().from('collection_kaccha').insert({
            dealer_name: val(w, 'f_dealer'), entry_date: val(w, 'f_date'),
            reference: val(w, 'f_ref'), expected_settlement_date: val(w, 'f_exp'),
            amount: num(w, 'f_amt'), amount_received: num(w, 'f_recv'),
            remarks: val(w, 'f_rem'), created_by: who()
          });
          if (error) throw error;
          toast('Kaccha entry added');
        });

    } else {
      openModal('Log Follow-up',
        dl +
        '<div class="cl-grid">' +
        '<label>Date *<input id="f_date" type="date" class="form-input" value="' + today() + '"></label>' +
        '<label>Dealer *<input id="f_dealer" list="clDealers" class="form-input"></label>' +
        '<label>Ledger Type<select id="f_type" class="form-input"><option>Pakka</option><option>Kaccha</option><option>Both</option></select></label>' +
        '<label>Mode<select id="f_mode" class="form-input"><option>Call</option><option>WhatsApp</option><option>Visit</option><option>Written Notice</option></select></label>' +
        '<label>Amount Discussed (₹)<input id="f_amt" type="number" class="form-input" value="0"></label>' +
        '<label>Next Follow-up<input id="f_next" type="date" class="form-input" value="' + addDays(7) + '"></label>' +
        '<label class="cl-full">Response / Promise<input id="f_resp" class="form-input"></label>' +
        '</div>',
        async function (w) {
          if (!val(w, 'f_dealer')) throw new Error('Dealer name is required');
          var { error } = await sb().from('collection_followups').insert({
            followup_date: val(w, 'f_date'), dealer_name: val(w, 'f_dealer'),
            ledger_type: val(w, 'f_type'), mode: val(w, 'f_mode'),
            amount_discussed: num(w, 'f_amt'), response: val(w, 'f_resp'),
            next_followup_date: val(w, 'f_next') || null, logged_by: who()
          });
          if (error) throw error;
          await sb().from('collection_dealers').upsert({
            dealer_name: val(w, 'f_dealer'),
            last_followup_date: val(w, 'f_date'),
            next_followup_date: val(w, 'f_next') || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'dealer_name' });
          toast('Follow-up logged');
        });
    }
  }

  // Record a payment against an existing row
  function clReceive(kind, id) {
    var list = kind === 'pakka' ? state.pakka : state.kaccha;
    var row = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { row = list[i]; break; }
    if (!row) return;

    openModal('Record Payment — ' + row.dealer_name,
      '<div class="cl-recv">' +
        '<div><span>Outstanding</span><b>' + inr(row.balance) + '</b></div>' +
      '</div>' +
      '<div class="cl-grid">' +
      '<label class="cl-full">Payment Received Now (₹) *<input id="f_pay" type="number" class="form-input" value="0"></label>' +
      '</div>' +
      '<p class="cl-note">This is added to the amount already received. Enter only the new payment.</p>',
      async function (w) {
        var pay = num(w, 'f_pay');
        if (pay <= 0) throw new Error('Enter an amount greater than zero');
        var table = kind === 'pakka' ? 'collection_pakka' : 'collection_kaccha';
        var { error } = await sb().from(table).update({
          amount_received: Number(row.amount_received || 0) + pay,
          updated_at: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
        toast('Payment recorded');
      });
  }

  // Mark a kaccha entry as now formally invoiced
  function clConvert(id) {
    var row = null;
    for (var i = 0; i < state.kaccha.length; i++) if (state.kaccha[i].id === id) { row = state.kaccha[i]; break; }
    if (!row) return;

    openModal('Convert to Pakka Invoice',
      '<p class="cl-note">Raises a pakka invoice for the outstanding <b>' + inr(row.balance) +
      '</b> against <b>' + esc(row.dealer_name) + '</b>, and marks this kaccha entry as converted.</p>' +
      '<div class="cl-grid">' +
      '<label>Invoice No. *<input id="f_inv" class="form-input"></label>' +
      '<label>Invoice Date *<input id="f_date" type="date" class="form-input" value="' + today() + '"></label>' +
      '<label>Credit Terms (Days)<input id="f_terms" type="number" class="form-input" value="30"></label>' +
      '</div>',
      async function (w) {
        if (!val(w, 'f_inv')) throw new Error('Invoice number is required');

        var ins = await sb().from('collection_pakka').insert({
          dealer_name: row.dealer_name, invoice_no: val(w, 'f_inv'),
          invoice_date: val(w, 'f_date'), credit_terms_days: num(w, 'f_terms') || 30,
          invoice_amount: Number(row.balance || 0), amount_received: 0,
          remarks: 'Converted from kaccha entry #' + row.id, created_by: who()
        });
        if (ins.error) throw ins.error;

        // Close the kaccha entry only after the invoice actually exists,
        // so a failure here can never lose the outstanding amount.
        var upd = await sb().from('collection_kaccha').update({
          converted_invoice_no: val(w, 'f_inv'),
          updated_at: new Date().toISOString()
        }).eq('id', row.id);
        if (upd.error) throw upd.error;

        toast('Converted to pakka invoice');
      });
  }

  function loadCollections() { loadAll(); }

  window.loadCollections = loadCollections;
  window.clTab = clTab;
  window.clAdd = clAdd;
  window.clReceive = clReceive;
  window.clConvert = clConvert;
})();
