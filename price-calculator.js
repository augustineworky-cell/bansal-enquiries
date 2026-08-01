// ============================================================
// MOUSEPAD PRICE CALCULATOR — NEO DOVE CRM
// Ported from PriceV3 (MakeMyClicks Price Catalog)
// ============================================================
// Tables required in Neo Dove Supabase (tfxkcujcfelovxowdhis):
//   - mousepad_calc_settings
//   - mousepad_thickness_options
// See: supabase-setup.sql for CREATE TABLE statements
// ============================================================

(function () {
  'use strict';

  // ── STATE ──────────────────────────────────────────────────
  const mc = {
    initialized: false,
    thicknesses: [],
    activeThicknessId: null,
    fields: [
      'padW', 'padH', 'margin',
      'rollW', 'rollLen', 'rollPrice', 'edgeWaste',
      'tech', 'die', 'dieCutPc',
      'ink', 'paper', 'printLabor', 'pack',
      'overhead', 'waste', 'orderQty', 'profit'
    ],
    fieldToDb: {
      padW: 'pad_width', padH: 'pad_height', margin: 'cutting_margin',
      rollW: 'roll_width', rollLen: 'roll_length_m', rollPrice: 'roll_price',
      edgeWaste: 'edge_waste_in',
      tech: 'technician_cost', die: 'die_making_cost', dieCutPc: 'die_cut_per_pc',
      ink: 'ink_per_sqft', paper: 'paper_per_sqft', printLabor: 'print_labor_per_pc',
      pack: 'packaging_per_pc',
      overhead: 'overhead_pct', waste: 'waste_pct',
      orderQty: 'default_order_qty', profit: 'default_profit_margin_pct'
    }
  };

  // ── HELPERS ────────────────────────────────────────────────
  const fmt = (n) => '₹' + Number(n || 0).toFixed(2);
  const fmtBig = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function getSupabase() {
    // Neo Dove uses global supabaseClient (set in api.js)
    if (window.supabaseClient) return window.supabaseClient;
    // Fallback: create using MMC_CONFIG
    if (window.MMC_CONFIG && window.supabase) {
      return window.supabase.createClient(window.MMC_CONFIG.SUPABASE_URL, window.MMC_CONFIG.SUPABASE_ANON_KEY);
    }
    throw new Error('Supabase client not available');
  }

  function mcToast(msg, type) {
    // Use Neo Dove's showToast if available, else fallback
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    if (typeof showNotification === 'function') { showNotification(msg, type); return; }
    alert(msg);
  }

  // ── SUPABASE API FUNCTIONS ──────────────────────────────────
  async function calcGetSettings() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('mousepad_calc_settings')
      .select('*')
      .eq('singleton', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function calcSaveSettings(payload) {
    const sb = getSupabase();
    const userId = window.currentUser?.id || null;
    const { error } = await sb
      .from('mousepad_calc_settings')
      .update({ ...payload, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('singleton', true);
    if (error) throw error;
    return true;
  }

  async function calcListActiveThicknesses() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('mousepad_thickness_options')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function calcListAllThicknesses() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('mousepad_thickness_options')
      .select('*')
      .order('is_active', { ascending: false })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function calcUpdateThickness(id, patch) {
    const sb = getSupabase();
    const { error } = await sb.from('mousepad_thickness_options').update(patch).eq('id', id);
    if (error) throw error;
    return true;
  }

  async function calcAddThickness(payload) {
    const sb = getSupabase();
    const { data, error } = await sb.from('mousepad_thickness_options').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  // ── CORE CALCULATION ENGINE (pure, no DOM) ──────────────────
  function mcCompute(i) {
    const cutW = i.padW + i.margin;
    const cutH = i.padH + i.margin;
    const rollLenInches = i.rollLen_m * 39.3701;
    const usableW = Math.max(0, i.rollW - (2 * i.edgeWaste));
    const usableL = Math.max(0, rollLenInches - (2 * i.edgeWaste));

    let colsA = 0, rowsA = 0, colsB = 0, rowsB = 0;
    if (cutW > 0 && cutH > 0) {
      colsA = Math.floor(usableW / cutW); rowsA = Math.floor(usableL / cutH);
      colsB = Math.floor(usableW / cutH); rowsB = Math.floor(usableL / cutW);
    }
    const pcsA = colsA * rowsA;
    const pcsB = colsB * rowsB;
    const theoretical = Math.max(pcsA, pcsB);
    const orientation = pcsA >= pcsB ? 'Normal (A)' : 'Rotated (B)';
    const wasteLoss = Math.ceil(theoretical * i.wastePct / 100);
    const practical = Math.max(0, theoretical - wasteLoss);

    const rollArea = i.rollW * rollLenInches;
    const utilization = rollArea > 0 ? (i.padW * i.padH * practical) / rollArea : 0;

    const rollMaterial = practical > 0 ? i.rollPrice / practical : 0;
    const techPerPc = practical > 0 ? i.technician / practical : 0;
    const dieAmortized = i.orderQty > 0 ? i.dieMaking / i.orderQty : 0;
    const padSqFt = (i.padW * i.padH) / 144;
    const printing = (i.inkPerSqFt + i.paperPerSqFt) * padSqFt + i.printLabor;
    const subtotal = rollMaterial + techPerPc + dieAmortized + i.dieCutPerPc + printing + i.packaging;
    const overhead = subtotal * i.overheadPct / 100;
    const costPerPc = subtotal + overhead;
    const sellingPrice = costPerPc * (1 + i.profitMarginPct / 100);
    const profitPerPc = sellingPrice - costPerPc;
    const rollsNeeded = practical > 0 ? Math.ceil(i.orderQty / practical) : 0;

    return {
      theoretical, orientation, practical,
      utilization: utilization * 100,
      rollMaterial, techPerPc, dieAmortized,
      dieCutPerPc: i.dieCutPerPc, printing,
      packaging: i.packaging, subtotal, overhead,
      costPerPc, sellingPrice, profitPerPc,
      rollsNeeded,
      totalCost: costPerPc * i.orderQty,
      totalRevenue: sellingPrice * i.orderQty,
      totalProfit: profitPerPc * i.orderQty
    };
  }

  // ── DOM HELPERS ─────────────────────────────────────────────
  function getInputs() {
    const get = (id) => Number(document.getElementById('mc-' + id)?.value) || 0;
    return {
      padW: get('padW'), padH: get('padH'), margin: get('margin'),
      rollW: get('rollW'), rollLen_m: get('rollLen'), rollPrice: get('rollPrice'),
      edgeWaste: get('edgeWaste'),
      technician: get('tech'), dieMaking: get('die'), dieCutPerPc: get('dieCutPc'),
      inkPerSqFt: get('ink'), paperPerSqFt: get('paper'),
      printLabor: get('printLabor'), packaging: get('pack'),
      overheadPct: get('overhead'), wastePct: get('waste'),
      orderQty: get('orderQty'), profitMarginPct: get('profit')
    };
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── RECALCULATE & UPDATE UI ─────────────────────────────────
  function mcRecalculate() {
    const r = mcCompute(getInputs());
    setEl('mc-orientation',    'Layout: ' + r.orientation);
    setEl('mc-theoretical',    r.theoretical + ' pcs');
    setEl('mc-practical',      r.practical + ' pcs');
    setEl('mc-utilization',    r.utilization.toFixed(1) + '%');
    setEl('mc-material',       fmt(r.rollMaterial));
    setEl('mc-techPc',         fmt(r.techPerPc));
    setEl('mc-dieAmortized',   fmt(r.dieAmortized));
    setEl('mc-dieCutDisplay',  fmt(r.dieCutPerPc));
    setEl('mc-printing',       fmt(r.printing));
    setEl('mc-packDisplay',    fmt(r.packaging));
    setEl('mc-subtotal',       fmt(r.subtotal));
    setEl('mc-overheadVal',    fmt(r.overhead));
    setEl('mc-cost',           fmt(r.costPerPc));
    setEl('mc-selling',        fmt(r.sellingPrice));
    setEl('mc-profitPc',       fmt(r.profitPerPc));
    setEl('mc-rolls',          r.rollsNeeded + ' roll(s)');
    setEl('mc-totalCost',      fmtBig(r.totalCost));
    setEl('mc-totalRev',       fmtBig(r.totalRevenue));
    setEl('mc-totalProfit',    fmtBig(r.totalProfit));
  }

  // ── THICKNESS PILLS ─────────────────────────────────────────
  function renderThicknessPills() {
    const container = document.getElementById('mc-thickness-options');
    if (!container) return;
    if (!mc.thicknesses.length) {
      container.innerHTML = '<span style="color:var(--text-secondary);font-size:13px;">No thickness options. Add via Thickness Settings below.</span>';
      return;
    }
    container.innerHTML = mc.thicknesses.map((t, idx) => `
      <button type="button" class="mc-pill${idx === 0 ? ' active' : ''}" data-tid="${t.id}">
        ${t.display_name}
        <span style="font-weight:400;font-size:12px;opacity:0.8;">₹${Number(t.roll_price).toLocaleString('en-IN')}</span>
      </button>
    `).join('');
    container.querySelectorAll('.mc-pill').forEach(btn => {
      btn.addEventListener('click', () => selectThickness(btn.dataset.tid));
    });
    if (mc.thicknesses.length > 0 && !mc.activeThicknessId) {
      selectThickness(mc.thicknesses[0].id);
    }
  }

  function selectThickness(id) {
    const t = mc.thicknesses.find(x => x.id === id || x.id == id);
    if (!t) return;
    mc.activeThicknessId = id;
    document.querySelectorAll('#mc-thickness-options .mc-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.tid == id);
    });
    applyThicknessToInputs(t);
    mcRecalculate();
  }

  function applyThicknessToInputs(t) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    setVal('mc-rollPrice', t.roll_price);
    if (t.roll_width != null)    setVal('mc-rollW', t.roll_width);
    if (t.roll_length_m != null) setVal('mc-rollLen', t.roll_length_m);
  }

  // ── THICKNESS ADMIN PANEL ───────────────────────────────────
  async function renderThicknessAdminPanel() {
    const body = document.getElementById('mc-thickness-admin-body');
    if (!body) return;
    let all = [];
    try { all = await calcListAllThicknesses(); } catch (e) { return; }

    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--surface);">
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);">mm</th>
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);">Name</th>
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);">Roll Price (₹)</th>
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);">Active</th>
          </tr>
        </thead>
        <tbody>
          ${all.map(t => `
            <tr data-tid="${t.id}" style="${!t.is_active ? 'opacity:0.5;' : ''}">
              <td style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="number" class="mc-ta-mm form-input" value="${t.thickness_mm}" step="0.5" style="width:60px;padding:4px 8px;" /></td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="text" class="mc-ta-name form-input" value="${t.display_name}" style="width:80px;padding:4px 8px;" /></td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="number" class="mc-ta-price form-input" value="${t.roll_price}" step="100" style="width:90px;padding:4px 8px;" /></td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:center;"><input type="checkbox" class="mc-ta-active" ${t.is_active ? 'checked' : ''} style="width:16px;height:16px;" /></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;">
        <input type="number" id="mc-ta-new-mm" placeholder="mm" step="0.5" style="width:70px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;" />
        <input type="text" id="mc-ta-new-name" placeholder="e.g. 3mm" style="width:80px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;" />
        <input type="number" id="mc-ta-new-price" placeholder="Roll Price ₹" step="100" style="width:110px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;" />
        <button id="mc-ta-add-btn" class="btn btn-primary" style="padding:6px 16px;font-size:13px;">+ Add</button>
      </div>
    `;

    // Wire blur-to-save on each row
    body.querySelectorAll('tr[data-tid]').forEach(row => {
      const id = row.dataset.tid;
      const save = async () => {
        const patch = {
          thickness_mm: parseFloat(row.querySelector('.mc-ta-mm').value) || 0,
          display_name: row.querySelector('.mc-ta-name').value.trim(),
          roll_price: parseFloat(row.querySelector('.mc-ta-price').value) || 0,
          is_active: row.querySelector('.mc-ta-active').checked
        };
        try {
          await calcUpdateThickness(id, patch);
          mcToast('Thickness saved', 'success');
          mc.thicknesses = await calcListActiveThicknesses();
          renderThicknessPills();
        } catch (e) { mcToast('Save failed: ' + e.message, 'error'); }
      };
      row.querySelectorAll('input').forEach(inp => inp.addEventListener('change', save));
    });

    // Wire add button
    body.querySelector('#mc-ta-add-btn').addEventListener('click', async () => {
      const mm = parseFloat(document.getElementById('mc-ta-new-mm').value);
      const name = document.getElementById('mc-ta-new-name').value.trim();
      const price = parseFloat(document.getElementById('mc-ta-new-price').value);
      if (!mm || !name || !price) { mcToast('Fill mm, Name, Price to add', 'error'); return; }
      try {
        await calcAddThickness({ thickness_mm: mm, display_name: name, roll_price: price, is_active: true, sort_order: 99 });
        mcToast('Thickness added', 'success');
        mc.thicknesses = await calcListActiveThicknesses();
        renderThicknessPills();
        await renderThicknessAdminPanel();
      } catch (e) { mcToast('Add failed: ' + e.message, 'error'); }
    });
  }

  // ── WIRE INPUTS ─────────────────────────────────────────────
  function wireInputs() {
    mc.fields.forEach(f => {
      const el = document.getElementById('mc-' + f);
      if (el) el.addEventListener('input', mcRecalculate);
    });
  }

  // ── SAVE DEFAULTS (ADMIN only) ──────────────────────────────
  function wireSaveButton() {
    const btn = document.getElementById('mc-save-defaults');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const inputs = getInputs();
      const m = mc.fieldToDb;
      const payload = {
        [m.padW]: inputs.padW,        [m.padH]: inputs.padH,
        [m.margin]: inputs.margin,    [m.rollW]: inputs.rollW,
        [m.rollLen]: inputs.rollLen_m,[m.rollPrice]: inputs.rollPrice,
        [m.edgeWaste]: inputs.edgeWaste,
        [m.tech]: inputs.technician,  [m.die]: inputs.dieMaking,
        [m.dieCutPc]: inputs.dieCutPerPc,
        [m.ink]: inputs.inkPerSqFt,   [m.paper]: inputs.paperPerSqFt,
        [m.printLabor]: inputs.printLabor, [m.pack]: inputs.packaging,
        [m.overhead]: inputs.overheadPct, [m.waste]: inputs.wastePct,
        [m.orderQty]: inputs.orderQty,[m.profit]: inputs.profitMarginPct
      };
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Saving…';
      try {
        await calcSaveSettings(payload);
        mcToast('Defaults saved ✓', 'success');
      } catch (e) {
        mcToast('Save failed: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  // ── ROLE CHECK ──────────────────────────────────────────────
  function isAdmin() {
    const role = window.currentUser?.role || '';
    return role === 'ADMIN' || role === 'EA';
  }

  // ── MAIN LOAD FUNCTION (called by Neo Dove showPage) ────────
  window.loadPriceCalculator = async function () {
    if (!mc.initialized) {
      wireInputs();
      if (isAdmin()) {
        wireSaveButton();
        document.querySelectorAll('.mc-admin-only').forEach(el => el.style.display = '');
      }
      mc.initialized = true;
    }

    // Apply role visibility
    document.querySelectorAll('.mc-admin-only').forEach(el => {
      el.style.display = isAdmin() ? '' : 'none';
    });

    try {
      // Load saved settings
      const settings = await calcGetSettings();
      if (settings) {
        Object.entries(mc.fieldToDb).forEach(([uiKey, dbCol]) => {
          const el = document.getElementById('mc-' + uiKey);
          if (el && settings[dbCol] != null) el.value = settings[dbCol];
        });
      }

      // Load thickness options
      mc.thicknesses = await calcListActiveThicknesses();
      renderThicknessPills();

      // Admin panel
      if (isAdmin()) await renderThicknessAdminPanel();

      mcRecalculate();
    } catch (e) {
      mcToast('Price Calculator load failed: ' + e.message, 'error');
      console.error('[PriceCalc]', e);
    }
  };

})();
