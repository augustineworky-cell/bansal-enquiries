// ============================================================
// leads.js — Leads, Contacts, Kanban, Drawer, and Bulk Actions
// ============================================================

// ──────────────────────────────────────────────────────────
// GLOBALS
// ──────────────────────────────────────────────────────────
var contactsState = {
  page: 1,
  pageSize: 50,
  totalCount: 0,
  search: '',
  sourceFilter: '',
  pipelineFilter: '',
  stageFilter: '',
  dateFrom: '',
  dateTo: '',
  viewAsAgent: null
};

var parsedBulkLeads = [];
var currentFilteredLeads = [];
var activeTagFilter = '';
var currentDrawerLeadId = '';

// Contacts Pagination Globals
var contactsCurrentPage = 1;
var contactsPageSize = 50;
var contactsTotalPages = 1;
var contactsTotalRecords = 0;
var searchDebounceTimer = null;

var selectedLeadIds = [];

// ──────────────────────────────────────────────────────────
// CONTACTS TABLE LOGIC
// ──────────────────────────────────────────────────────────
function renderContactsTable(leads, highlightNewId = null) {
  const tbody = document.getElementById('contactsTableBody');
  if (!leads || leads.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:24px; color:var(--text-secondary);">No leads found.</td></tr>'; 
    return; 
  }
  
  let html = '';
  leads.forEach(function(l, i) {
    const sn = (l.CONTACT_NAME || 'Unknown').replace(/'/g, "\\'");
    const score = l.PRIORITY_SCORE || 0;
    const scoreHtml = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${score}%; background:${getScoreColor(score)};"></div>
        </div>
        <span style="font-size:11px; font-weight:600;">${score}</span>
      </div>`;
      
    const tagsArr = String(l.TAGS || '').split(',');
    let tagHtml = '';
    tagsArr.forEach(function(tg) {
      const tgT = tg.trim();
      if (tgT) tagHtml += `<span class="tag-chip" onclick="filterByTag('${tgT.replace(/'/g, "\\'")}')">${tgT}</span>`;
    });
    
    const rowClass = l.LEAD_ID === highlightNewId ? 'flash-new' : '';
    const delay = Math.min(i * 0.03, 0.5);
    
    var productCell = l.PRODUCT_INTEREST ? `<span class="badge" style="background:#EEF2FF; color:#4F46E5; font-size:11px;">${l.PRODUCT_INTEREST}</span>` : '<span style="color:var(--text-secondary); font-size:11px;">—</span>';
    var stateCell = l.STATE ? `<span class="badge" style="background:#ECFDF5; color:#059669; font-size:11px;">${l.STATE}</span>` : '<span style="color:var(--text-secondary); font-size:11px;">—</span>';
    var buyerCell = l.BUYER_TYPE ? `<span class="badge" style="background:#FFFBEB; color:#B45309; font-size:11px;">${l.BUYER_TYPE}</span>` : '<span style="color:var(--text-secondary); font-size:11px;">—</span>';
    html += `
      <tr class="${rowClass}" data-lead-id="${l.LEAD_ID || ''}" style="animation: fadeInUp 0.3s var(--ease-spring) ${delay}s both;">
        <td><input type="checkbox" class="bulk-checkbox" onchange="toggleLeadSelection('${l.LEAD_ID || ''}', this)"></td>
       <td style="font-size:12px; color:var(--text-secondary);">${l.LEAD_ID ? (String(l.LEAD_ID).split('-').pop() || l.LEAD_ID) : '-'}</td>
        <td>
          <div style="font-weight:600;">
            <a href="#" onclick="openLeadDrawer('${l.LEAD_ID || ''}'); return false;">${l.CONTACT_NAME || 'Unknown'}</a>
          </div>
          ${tagHtml ? `<div class="lead-row-tags">${tagHtml}</div>` : ''}
        </td>
        <td>${productCell}</td>
        <td>${l.MOBILE || '-'}</td>
        <td>${stateCell}</td>
        <td>${buyerCell}</td>
        <td>${l.LEAD_SOURCE || '-'}</td>

        <td>${l.CAMPAIGN || '-'}</td>
        <td>${l.ASSIGNED_TO || '-'}</td>
        <td><span class="badge ${getStageBadgeClass(l.STAGE)}">${l.STAGE || 'NEW'}</span></td>
        <td>${getLeadTypeBadge(l.LEAD_TYPE)}</td>
        <td>${scoreHtml}</td>
        <td>${formatFollowupDate(l.NEXT_FOLLOWUP).display}</td>
        <td>
          <div style="display:flex; gap:8px;">
            <button class="icon-btn call-btn" onclick="event.stopPropagation(); generatePhoneCallLink('${l.MOBILE || ''}', '${sn}', '${l.LEAD_ID || ''}', '${l.STAGE || ''}')"><i data-lucide="phone"></i></button>
            <button class="icon-btn wa-btn" onclick="event.stopPropagation(); generateWhatsAppLink('${l.MOBILE || ''}', '${sn}')"><i data-lucide="message-circle"></i></button>
            <button class="icon-btn" onclick="event.stopPropagation(); openFollowUpModal('${l.LEAD_ID || ''}', '${sn}', '${l.STAGE || ''}')"><i data-lucide="edit-3"></i></button>
            <button class="icon-btn" onclick="event.stopPropagation(); openEditLeadModal('${l.LEAD_ID || ''}')"><i data-lucide="edit-2"></i></button>
          </div>
        </td>
      </tr>`;
  });
tbody.innerHTML = html; 
  lucide.createIcons();
  if (typeof setupColumnFilters === 'function') setupColumnFilters();
}

async function loadContacts() {
  try {
    var tbody = document.getElementById('contactsTableBody');
    if (!tbody) {
      console.error('Contacts table not found');
      return;
    }

    tbody.innerHTML = '<tr><td colspan="10" style="padding:40px; text-align:center; color:#9CA3AF;">Loading leads...</td></tr>';

    var query = supabaseClient.from('leads').select('*', { count: 'estimated' });

    // --- NEW SALESPERSON FILTER LOGIC ---
    if (viewAsAgent) {
      // If Admin selected a specific Salesperson from the top dropdown, filter by their Name
      query = query.ilike('assigned_to', viewAsAgent);
    } else if (currentUser.role === 'AGENT') {
      // If a regular Agent is logged in, ONLY show their own leads
      query = query.ilike('assigned_to', currentUser.name);
    }
    // ------------------------------------

    if (contactsState.search && contactsState.search.trim()) {
      var s = contactsState.search.trim();
      query = query.or('contact_name.ilike.%' + s + '%,mobile.ilike.%' + s + '%,company.ilike.%' + s + '%,email.ilike.%' + s + '%');
    }

 if (contactsState.sourceFilter) query = query.eq('lead_source', contactsState.sourceFilter);
    if (contactsState.pipelineFilter) query = query.eq('pipeline', contactsState.pipelineFilter);
    if (contactsState.stageFilter) query = query.eq('stage', contactsState.stageFilter);
    if (contactsState.dateFrom) query = query.gte('lead_date', contactsState.dateFrom);
    if (contactsState.dateTo) query = query.lte('lead_date', contactsState.dateTo + 'T23:59:59');

    var offset = (contactsState.page - 1) * contactsState.pageSize;
    query = query.order('updated_at', { ascending: false }).range(offset, offset + contactsState.pageSize - 1);

    var result = await query;
if (result.error) throw result.error;

    var leads = result.data || [];
    contactsState.totalCount = result.count || 0;

    if (leads.length === 0) {
      currentFilteredLeads = [];
      tbody.innerHTML = '<tr><td colspan="11" style="padding:40px; text-align:center; color:#9CA3AF;">No leads found</td></tr>';
    } else {
      // Map lowercase Supabase data to UPPERCASE so the robust table renderer can read it properly!
      var upperLeads = leads.map(function(l) {
        var u = {};
        Object.keys(l).forEach(function(k) { u[k.toUpperCase()] = l[k]; });
        return u;
      });
      // CRITICAL: Store leads globally so export functions can access them.
      currentFilteredLeads = upperLeads;
      // Call the correct function that draws the action buttons!
      renderContactsTable(upperLeads);
    }

    var countEl = document.getElementById('leadCount') || document.getElementById('contactCount') || document.getElementById('contactsCount');
    if (countEl) {
      var startNum = offset + 1;
      var endNum = Math.min(offset + contactsState.pageSize, contactsState.totalCount);
      countEl.textContent = `Showing ${startNum}-${endNum} of ${contactsState.totalCount.toLocaleString()}`;
    }

    renderPagination();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  } catch (err) {
    console.error('❌ Contacts load failed:', err);
    var tbody = document.getElementById('contactsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="padding:40px; text-align:center; color:#DC2626;">Error: ${err.message}</td></tr>`;
  }
}

function renderLeadRow(lead) {
  var stageColor = getStageColor(lead.stage);
  var statusColor = lead.status === 'WON' ? '#10B981' : lead.status === 'LOST' ? '#EF4444' : '#7C3AED';
  var assignedShort = (lead.assigned_to || '—').split('@')[0];

  return `
    <tr style="border-bottom:1px solid #E5E7EB; cursor:pointer;" onclick="openLead('${lead.lead_id || ''}')">
      <td style="padding:12px;"><input type="checkbox" class="lead-checkbox" data-lead-id="${lead.lead_id || ''}" onclick="event.stopPropagation();"></td>
      <td style="padding:12px; font-weight:500;">${lead.contact_name || '—'}</td>
      <td style="padding:12px;">${lead.mobile || '—'}</td>
      <td style="padding:12px; color:#6B7280;">${lead.company || '—'}</td>
      <td style="padding:12px;">${lead.lead_source || '—'}</td>
      <td style="padding:12px;"><span style="background:${stageColor}; color:white; padding:2px 8px; border-radius:4px; font-size:11px;">${lead.stage || 'NEW'}</span></td>
      <td style="padding:12px;"><span style="background:${statusColor}; color:white; padding:2px 8px; border-radius:4px; font-size:11px;">${lead.status || 'OPEN'}</span></td>
      <td style="padding:12px; color:#6B7280; font-size:13px;">${assignedShort}</td>
      <td style="padding:12px; color:#6B7280; font-size:13px;">${formatDate(lead.next_followup)}</td>
      <td style="padding:12px;">
        <button onclick="event.stopPropagation(); window.open('tel:${lead.mobile || ''}')" style="background:#7C3AED; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">Call</button>
      </td>
    </tr>`;
}

function renderPagination() {
  var container = document.getElementById('paginationContainer') || document.getElementById('contactsPagination') || document.querySelector('.pagination');
  if (!container) return;

  var totalPages = Math.ceil(contactsState.totalCount / contactsState.pageSize);
  var currentPage = contactsState.page;

  if (totalPages <= 1) { container.innerHTML = ''; return; }

  var html = '';
  html += `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding:6px 12px; border:1px solid #E5E7EB; background:white; border-radius:6px; cursor:${currentPage === 1 ? 'not-allowed':'pointer'}; opacity:${currentPage === 1 ? '0.5':'1'};">‹ Prev</button>`;

  var startPage = Math.max(1, currentPage - 2);
  var endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    html += `<button onclick="goToPage(1)" style="padding:6px 12px; border:1px solid #E5E7EB; background:white; border-radius:6px; cursor:pointer; margin:0 2px;">1</button>`;
    if (startPage > 2) html += `<span style="padding:6px;">...</span>`;
  }

  for (var p = startPage; p <= endPage; p++) {
    var isActive = p === currentPage;
    html += `<button onclick="goToPage(${p})" style="padding:6px 12px; border:1px solid ${isActive ? '#7C3AED':'#E5E7EB'}; background:${isActive ? '#7C3AED':'white'}; color:${isActive ? 'white':'#374151'}; border-radius:6px; cursor:pointer; margin:0 2px; font-weight:${isActive ? '600':'400'};">${p}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span style="padding:6px;">...</span>`;
    html += `<button onclick="goToPage(${totalPages})" style="padding:6px 12px; border:1px solid #E5E7EB; background:white; border-radius:6px; cursor:pointer; margin:0 2px;">${totalPages}</button>`;
  }

  html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding:6px 12px; border:1px solid #E5E7EB; background:white; border-radius:6px; cursor:${currentPage === totalPages ? 'not-allowed':'pointer'}; opacity:${currentPage === totalPages ? '0.5':'1'};">Next ›</button>`;

  container.innerHTML = html;
}

function goToPage(pageNum) {
  var totalPages = Math.ceil(contactsState.totalCount / contactsState.pageSize);
  if (pageNum < 1 || pageNum > totalPages) return;
  contactsState.page = pageNum;
  loadContacts();
}

function handleContactSearch(value) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function() {
    contactsState.search = value;
    contactsState.page = 1;
    loadContacts();
  }, 400);
}

function handleSourceFilterChange(value) {
  contactsState.sourceFilter = value;
  contactsState.page = 1;
  loadContacts();
}

function handlePipelineFilterChange(value) {
  contactsState.pipelineFilter = value;
  contactsState.page = 1;
  loadContacts();
}

function handleStageFilterChange(value) {
  contactsState.stageFilter = value;
  contactsState.page = 1;
  loadContacts();
}

async function switchToAgent(agentEmail) {
  if (currentUser.role !== 'ADMIN') return;
  contactsState.viewAsAgent = agentEmail || null;
  contactsState.page = 1;
  await loadContacts();
}

async function populateContactFilters() {
  try {
    var srcRes = await supabaseClient.from('leads').select('lead_source').not('lead_source', 'is', null);
    if (srcRes.data) {
      var uniqueSources = [];
      srcRes.data.forEach(function(s) {
        if (s.lead_source && uniqueSources.indexOf(s.lead_source) === -1) uniqueSources.push(s.lead_source);
      });
      uniqueSources.sort();
      var sourceSelect = document.getElementById('contactSourceFilter');
      if (sourceSelect) {
        var html = '<option value="">All Sources</option>';
        uniqueSources.forEach(function(src) { html += `<option value="${src}">${src}</option>`; });
        sourceSelect.innerHTML = html;
      }
    }

    var pipeRes = await supabaseClient.from('pipelines').select('pipeline_name');
    if (pipeRes.data) {
      var uniquePipelines = [];
      pipeRes.data.forEach(function(p) {
        if (p.pipeline_name && uniquePipelines.indexOf(p.pipeline_name) === -1) uniquePipelines.push(p.pipeline_name);
      });
      uniquePipelines.sort();
      var pipelineSelect = document.getElementById('contactPipelineFilter');
      if (pipelineSelect) {
        var html = '<option value="">All Pipelines</option>';
        uniquePipelines.forEach(function(p) { html += `<option value="${p}">${p}</option>`; });
        pipelineSelect.innerHTML = html;
      }
    }

    var stageSelect = document.getElementById('contactStageFilter');
    if (stageSelect) {
      var stages = ['NEW','CONTACTED','QUALIFIED','NEGOTIATION','WON','LOST'];
      var html = '<option value="">All Stages</option>';
      stages.forEach(function(s) { html += `<option value="${s}">${s}</option>`; });
      stageSelect.innerHTML = html;
    }

    if (currentUser && currentUser.role === 'ADMIN') {
      var userRes = await supabaseClient.from('users').select('name, email, role').eq('role', 'AGENT');
      var agentSelect = document.getElementById('agentSwitcher');
      if (agentSelect && userRes.data) {
        var html = '<option value="">All Agents (Admin View)</option>';
        userRes.data.forEach(function(u) { html += `<option value="${u.email}">${u.name}</option>`; });
        agentSelect.innerHTML = html;
      }
    }
  } catch (err) {
    console.error('Filter population failed:', err);
  }
}

async function openLead(leadId) {
  try {
    var result = await supabaseClient.from('leads').select('*').eq('lead_id', leadId).single();
    if (result.error) throw result.error;
    var lead = result.data;

    var drawer = document.getElementById('leadDrawer') || document.getElementById('drawer');
    if (drawer) drawer.classList.add('open');

    var fields = ['contact_name','mobile','email','company','city','state','lead_source','campaign','assigned_to','pipeline','stage','status','notes'];
    fields.forEach(function(field) {
      var el = document.getElementById('drawer_' + field) || document.getElementById('drawer-' + field) || document.querySelector(`[data-field="${field}"]`);
      if (el) el.textContent = lead[field] || '—';
    });

  } catch (err) {
    console.error('Failed to open lead:', err);
    alert('Could not load lead details');
  }
}

function loadAllTags() {
  const tagSet = {};
  currentFilteredLeads.forEach(function(l) {
    const tags = String(l.TAGS || '').split(',');
    tags.forEach(function(t) { const tag = t.trim(); if (tag) tagSet[tag] = (tagSet[tag] || 0) + 1; });
  });
  const container = document.getElementById('activeTagFilters');
  const tagKeys = Object.keys(tagSet);
  if (tagKeys.length === 0) { container.innerHTML = ''; return; }
  
  let html = `<span class="tag-chip${activeTagFilter === '' ? ' active' : ''}" onclick="filterByTag('')">All</span>`;
  tagKeys.forEach(function(k) {
    html += `<span class="tag-chip${activeTagFilter === k ? ' active' : ''}" onclick="filterByTag('${k.replace(/'/g, "\\'")}')">${k} (${tagSet[k]})</span>`;
  });
  container.innerHTML = html;
}

function filterLeadsClient() {
  var searchEl = document.getElementById('contactSearch');
  var sourceEl = document.getElementById('contactSourceFilter');
  var pipelineEl = document.getElementById('contactPipelineFilter');
  var stageEl = document.getElementById('contactStageFilter');
  var dateFromEl = document.getElementById('contactDateFrom');
  var dateToEl = document.getElementById('contactDateTo');
  contactsState.search = searchEl ? searchEl.value : '';
  contactsState.sourceFilter = sourceEl ? sourceEl.value : '';
  contactsState.pipelineFilter = pipelineEl ? pipelineEl.value : '';
  contactsState.stageFilter = stageEl ? stageEl.value : '';
  contactsState.dateFrom = dateFromEl ? dateFromEl.value : '';
  contactsState.dateTo = dateToEl ? dateToEl.value : '';
  contactsState.page = 1;
  contactsCurrentPage = 1;
  loadContacts(true);
}

function clearDateFilter() {
  var dateFromEl = document.getElementById('contactDateFrom');
  var dateToEl = document.getElementById('contactDateTo');
  if (dateFromEl) dateFromEl.value = '';
  if (dateToEl) dateToEl.value = '';
  contactsState.dateFrom = '';
  contactsState.dateTo = '';
  contactsState.page = 1;
  contactsCurrentPage = 1;
  loadContacts(true);
}

function filterByTag(tag) {
  activeTagFilter = tag;
  contactsState.page = 1;
  contactsCurrentPage = 1;
  loadContacts(true);
}

function renderContactsPagination() {
  var container = document.getElementById('contactsPagination');
  if (!container) return;
  
  if (contactsTotalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  var html = `
    <div class="pagination-wrap">
      <div class="pagination-size">
        <label>Per page:</label>
        <select onchange="changeContactsPageSize(this.value)">
          <option value="25"${contactsPageSize === 25 ? ' selected' : ''}>25</option>
          <option value="50"${contactsPageSize === 50 ? ' selected' : ''}>50</option>
          <option value="100"${contactsPageSize === 100 ? ' selected' : ''}>100</option>
          <option value="200"${contactsPageSize === 200 ? ' selected' : ''}>200</option>
        </select>
      </div>
      <div class="pagination-controls">`;
      
  var firstDisabled = contactsCurrentPage === 1;
  html += `
    <button class="pg-btn" ${firstDisabled ? 'disabled' : ''} onclick="goToContactsPage(1)" title="First"><i data-lucide="chevrons-left" style="width:14px;"></i></button>
    <button class="pg-btn" ${firstDisabled ? 'disabled' : ''} onclick="goToContactsPage(${contactsCurrentPage - 1})" title="Previous"><i data-lucide="chevron-left" style="width:14px;"></i></button>`;
  
  var startPage = Math.max(1, contactsCurrentPage - 2);
  var endPage = Math.min(contactsTotalPages, contactsCurrentPage + 2);
  
  if (startPage > 1) {
    html += `<button class="pg-btn" onclick="goToContactsPage(1)">1</button>`;
    if (startPage > 2) html += `<span class="pg-dots">...</span>`;
  }
  
  for (var p = startPage; p <= endPage; p++) {
    var activeCls = p === contactsCurrentPage ? 'pg-btn pg-active' : 'pg-btn';
    html += `<button class="${activeCls}" onclick="goToContactsPage(${p})">${p}</button>`;
  }
  
  if (endPage < contactsTotalPages) {
    if (endPage < contactsTotalPages - 1) html += `<span class="pg-dots">...</span>`;
    html += `<button class="pg-btn" onclick="goToContactsPage(${contactsTotalPages})">${contactsTotalPages}</button>`;
  }
  
  var lastDisabled = contactsCurrentPage === contactsTotalPages;
  html += `
    <button class="pg-btn" ${lastDisabled ? 'disabled' : ''} onclick="goToContactsPage(${contactsCurrentPage + 1})" title="Next"><i data-lucide="chevron-right" style="width:14px;"></i></button>
    <button class="pg-btn" ${lastDisabled ? 'disabled' : ''} onclick="goToContactsPage(${contactsTotalPages})" title="Last"><i data-lucide="chevrons-right" style="width:14px;"></i></button>
    </div>
    <div class="pagination-jump">
      <label>Page:</label>
      <input type="number" id="pgJumpInput" min="1" max="${contactsTotalPages}" value="${contactsCurrentPage}" onkeydown="if(event.key==='Enter'){jumpToContactsPage()}">
      <button class="pg-jump-btn" onclick="jumpToContactsPage()">Go</button>
      <span class="pg-info">of ${contactsTotalPages}</span>
    </div>
  </div>`;
  
  container.innerHTML = html;
  lucide.createIcons();
}

function goToContactsPage(page) {
  page = parseInt(page);
  if (page < 1 || page > contactsTotalPages) return;
  contactsCurrentPage = page;
  loadContacts(false);
  var tbl = document.getElementById('contactsTableBody');
  if (tbl && tbl.parentElement) tbl.parentElement.scrollTop = 0;
}

function changeContactsPageSize(size) {
  contactsPageSize = parseInt(size);
  contactsCurrentPage = 1;
  loadContacts(false);
}

function jumpToContactsPage() {
  var input = document.getElementById('pgJumpInput');
  if (!input) return;
  var page = parseInt(input.value);
  if (page >= 1 && page <= contactsTotalPages) {
    goToContactsPage(page);
  }
}

function debouncedSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(function() {
    var searchEl = document.getElementById('contactSearch');
    contactsState.search = searchEl ? searchEl.value : '';
    contactsState.page = 1;
    contactsCurrentPage = 1;
    loadContacts(true);
  }, 400);
}

function exportContacts() {
  if (!currentFilteredLeads || currentFilteredLeads.length === 0) {
    showToast('No leads to export. Wait for page to load or adjust filters.', 'warning');
    return;
  }
  var dateStr = new Date().toISOString().slice(0, 10);
  exportToCSV(currentFilteredLeads, 'BMH_Leads_' + dateStr + '.csv');
}

// ──────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────
// LEAD ADD / EDIT MODALS
// ──────────────────────────────────────────────────────────
function resetAddLeadForm() {
  // Text inputs
var textFields = ['lName', 'lMobile', 'lProduct', 'lCompany', 'lCity', 'lCampaign', 'lNotes'];
  textFields.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (document.getElementById('lParentLeadId')) document.getElementById('lParentLeadId').value = '';
  // Number/value field
  var valueEl = document.getElementById('lValue');
  if (valueEl) valueEl.value = '0';
  // Reset dropdowns to first option
  var dropdowns = ['lBuyerType', 'lState', 'lSource', 'lPipeline', 'lAssigned'];
  dropdowns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  // Reset lead type radios — default COLD
  var coldRadio = document.querySelector('input[name="lType"][value="COLD"]');
  if (coldRadio) coldRadio.checked = true;
  // Remove any error shake/highlight classes
  document.querySelectorAll('#modal-addLead .error-shake').forEach(function(el) {
    el.classList.remove('error-shake');
  });
}

function openAddLeadModal() {
  resetAddLeadForm();
  // 1. Tell the app to go fetch the dropdown data
  if (typeof populatePipelineDropdowns === 'function') populatePipelineDropdowns();
  if (typeof populateUserDropdowns === 'function') populateUserDropdowns();
  if (typeof populateCampaignDropdowns === 'function') populateCampaignDropdowns();

  // 2. Clear the form fields so it's fresh
  const form = document.querySelector('#modal-addLead form');
  if (form) form.reset();

  // 3. Finally, open the modal
  openModal('modal-addLead');
}

function saveLead(btn) {
  const typeEl = document.querySelector('input[name="lType"]:checked');
  const data = { 
    contactName: document.getElementById('lName').value, 
    mobile: document.getElementById('lMobile').value, 
    email: '', 
    company: document.getElementById('lCompany').value, 
    city: document.getElementById('lCity').value, 
    state: document.getElementById('lState').value, 
    leadSource: document.getElementById('lSource').value, 
    pipeline: document.getElementById('lPipeline').value, 
    campaign: document.getElementById('lCampaign').value, 
    assignedTo: document.getElementById('lAssigned').value, 
    expectedValue: document.getElementById('lValue').value, 
    leadType: typeEl ? typeEl.value : 'COLD', 
    notes: document.getElementById('lNotes').value, 
 productInterest: document.getElementById('lProduct').value, 
    buyerType: document.getElementById('lBuyerType').value,
    parentLeadId: document.getElementById('lParentLeadId') ? document.getElementById('lParentLeadId').value : null
  };
  
  if (!data.contactName || !data.mobile) { 
    if(!data.contactName) document.getElementById('lName').classList.add('error-shake');
    if(!data.mobile) document.getElementById('lMobile').classList.add('error-shake');
    setTimeout(function() {
      document.getElementById('lName').classList.remove('error-shake');
      document.getElementById('lMobile').classList.remove('error-shake');
    }, 400);
    showToast('Name and Mobile required', 'error'); 
    return; 
  }
  
  if(btn) btn.classList.add('loading');
  apiCall('checkDuplicateLead', { mobile: data.mobile }, function(dup) {
    if (dup && dup.isDuplicate) { 
      if (!confirm('Lead already exists: ' + (dup.existingLead.CONTACT_NAME || '-') + ' (' + (dup.existingLead.LEAD_ID || '-') + '). Add anyway?')) { 
        if(btn) btn.classList.remove('loading'); 
        return; 
      } 
    }
    
    apiCall('addLead', { leadData: data }, function(res) { 
      showToast('Lead added successfully!'); 
      closeModal('modal-addLead');
      resetAddLeadForm();
      if (document.getElementById('page-contacts').classList.contains('active')) {
        loadContacts(true); 
      } else if (typeof loadDashboard === 'function') {
        loadDashboard(); 
      }
      if(btn) btn.classList.remove('loading');
    }, function(err) { 
      showToast('Failed to add lead: ' + (err || 'unknown error'), 'error');
      if(btn) btn.classList.remove('loading'); 
    });
  });
}

function openEditLeadModal(leadId) {
  showSpinner();
  apiCall('getLeadById', { leadId: leadId }, function(lead) {
    hideSpinner();
    if (!lead) return;
    document.getElementById('eLeadId').value = lead.LEAD_ID || '';
    document.getElementById('editLeadTitle').textContent = `Edit Lead — ${lead.LEAD_ID || '-'}`;
    document.getElementById('eName').value = lead.CONTACT_NAME || '';
    document.getElementById('eMobile').value = lead.MOBILE || '';
    document.getElementById('eEmail').value = lead.EMAIL || '';
    document.getElementById('eCompany').value = lead.COMPANY || '';
    document.getElementById('ePipeline').value = lead.PIPELINE || '';
    document.getElementById('eStage').value = lead.STAGE || '';
    document.getElementById('eStatus').value = lead.STATUS || '';
document.getElementById('eAssigned').value = lead.ASSIGNED_TO || '';
document.getElementById('eProduct').value = lead.PRODUCT_INTEREST || '';
    document.getElementById('eState').value = lead.STATE || '';
    document.getElementById('eBuyerType').value = lead.BUYER_TYPE || '';
    document.getElementById('eValue').value = lead.EXPECTED_VALUE || 0;
    openModal('modal-editLead');
  });
}

function saveEditLead(btn) {
  const leadId = document.getElementById('eLeadId').value;
const updates = { CONTACT_NAME: document.getElementById('eName').value, MOBILE: document.getElementById('eMobile').value, EMAIL: document.getElementById('eEmail').value, COMPANY: document.getElementById('eCompany').value, PIPELINE: document.getElementById('ePipeline').value, STAGE: document.getElementById('eStage').value, STATUS: document.getElementById('eStatus').value, ASSIGNED_TO: document.getElementById('eAssigned').value, PRODUCT_INTEREST: document.getElementById('eProduct').value, STATE: document.getElementById('eState').value, BUYER_TYPE: document.getElementById('eBuyerType').value, EXPECTED_VALUE: Number(document.getElementById('eValue').value) || 0 };
  if(btn) btn.classList.add('loading');
  apiCall('updateLead', { leadId: leadId, updates: updates }, function() { 
    showToast('Lead updated!'); 
    closeModal('modal-editLead'); 
    loadContacts(false); 
    if(btn) btn.classList.remove('loading');
  }, function() { if(btn) btn.classList.remove('loading'); });
}

// ──────────────────────────────────────────────────────────
// KANBAN PIPELINE
// ──────────────────────────────────────────────────────────

// Pipeline filter state
var pipelineFilterState = {
  search: '',
  agent: '',
  source: '',
  type: '',
  dateFrom: '',
  dateTo: ''
};

var pipelineSearchTimer = null;

function debouncedPipelineFilter() {
  if (pipelineSearchTimer) clearTimeout(pipelineSearchTimer);
  pipelineSearchTimer = setTimeout(filterPipelineClient, 350);
}

function filterPipelineClient() {
  var searchEl = document.getElementById('pipelineSearch');
  var agentEl = document.getElementById('pipelineAgentFilter');
  var sourceEl = document.getElementById('pipelineSourceFilter');
  var typeEl = document.getElementById('pipelineTypeFilter');
  var dateFromEl = document.getElementById('pipelineDateFrom');
  var dateToEl = document.getElementById('pipelineDateTo');
  
  pipelineFilterState.search = searchEl ? searchEl.value.toLowerCase().trim() : '';
  pipelineFilterState.agent = agentEl ? agentEl.value : '';
  pipelineFilterState.source = sourceEl ? sourceEl.value : '';
  pipelineFilterState.type = typeEl ? typeEl.value : '';
  pipelineFilterState.dateFrom = dateFromEl ? dateFromEl.value : '';
  pipelineFilterState.dateTo = dateToEl ? dateToEl.value : '';
  
  loadPipeline();
}

function clearPipelineFilters() {
  var ids = ['pipelineSearch', 'pipelineAgentFilter', 'pipelineSourceFilter', 'pipelineTypeFilter', 'pipelineDateFrom', 'pipelineDateTo'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  pipelineFilterState = { search: '', agent: '', source: '', type: '', dateFrom: '', dateTo: '' };
  loadPipeline();
}

function populatePipelineFilterDropdowns() {
  // Populate Agent dropdown
  apiCall('getUsers', {}, function(users) {
    var activeUsers = (users || []).filter(function(u) { return u.STATUS === 'ACTIVE' && (u.ROLE === 'AGENT' || u.ROLE === 'MANAGER'); });
    var opts = '<option value="">All Agents</option>';
    activeUsers.forEach(function(u) { opts += '<option value="' + u.NAME + '">' + u.NAME + '</option>'; });
    var agentEl = document.getElementById('pipelineAgentFilter');
    if (agentEl) {
      var currentVal = agentEl.value;
      agentEl.innerHTML = opts;
      if (currentVal) agentEl.value = currentVal;
    }
  });
  
  // Populate Source dropdown (use predefined list — fast)
  var sourceEl = document.getElementById('pipelineSourceFilter');
  if (sourceEl && sourceEl.options.length <= 1) {
    var sources = ['FACEBOOK', 'INDIAMART', 'WALK_IN', 'WEBSITE', 'JUSTDIAL', 'WHATSAPP', 'REFERRAL', 'GOOGLE_SHEET', 'BULK_UPLOAD'];
    var opts = '<option value="">All Sources</option>';
    sources.forEach(function(s) { opts += '<option value="' + s + '">' + s + '</option>'; });
    sourceEl.innerHTML = opts;
  }
}

function loadPipeline() {
  document.getElementById('kanbanBoard').innerHTML = `
    <div class="kanban-col">
      <div class="skeleton" style="height:20px; width:50%; margin-bottom:12px;"></div>
      ${getListSkeletons(3)}
    </div>
    <div class="kanban-col">
      <div class="skeleton" style="height:20px; width:50%; margin-bottom:12px;"></div>
      ${getListSkeletons(2)}
    </div>`;
    
  apiCall('getPipelines', {}, function(pipelinesObj) {
    const pipeNames = Object.keys(pipelinesObj);
    const selector = document.getElementById('pipelineSelector');

    // 1. Auto-fill the dropdown if it is empty!
    if (selector && selector.options.length <= 1 && pipeNames.length > 0) {
      let opts = '';
      pipeNames.forEach(n => opts += `<option value="${n}">${n}</option>`);
      selector.innerHTML = opts;
    }

    // 2. Grab the selected value, or default to the first pipeline (e.g. 'SALES')
    let selPipeline = selector ? selector.value : '';
    if (!selPipeline && pipeNames.length > 0) {
      selPipeline = pipeNames[0];
      if (selector) selector.value = selPipeline;
    }

    // 3. Get the stages and sort them by stage_order
    let stages = pipelinesObj[selPipeline] || [];
    stages.sort((a,b) => (Number(a.STAGE_ORDER) || 0) - (Number(b.STAGE_ORDER) || 0));

    // 4. Fetch leads and draw the Kanban board
// Populate filter dropdowns (Agent + Source) on first load
    populatePipelineFilterDropdowns();
    
    apiCall('getLeads', { filters: { pipeline: selPipeline } }, function(allLeads) {
      var roleFilteredLeads = filterLeadsByRole(allLeads);
      pipelineFullLeadsCache = roleFilteredLeads;
      
      // Apply user-selected filters
      var leads = roleFilteredLeads.filter(function(l) {
        // Search filter
        if (pipelineFilterState.search) {
          var hay = String(l.CONTACT_NAME || '').toLowerCase() + ' ' + String(l.MOBILE || '').toLowerCase() + ' ' + String(l.COMPANY || '').toLowerCase();
          if (hay.indexOf(pipelineFilterState.search) === -1) return false;
        }
        // Agent filter
        if (pipelineFilterState.agent && l.ASSIGNED_TO !== pipelineFilterState.agent) return false;
        // Source filter
        if (pipelineFilterState.source && l.LEAD_SOURCE !== pipelineFilterState.source) return false;
        // Type filter
        if (pipelineFilterState.type && l.LEAD_TYPE !== pipelineFilterState.type) return false;
        // Date filters
        if (pipelineFilterState.dateFrom) {
          var leadDate = String(l.LEAD_DATE || '').substring(0, 10);
          if (leadDate < pipelineFilterState.dateFrom) return false;
        }
        if (pipelineFilterState.dateTo) {
          var leadDate2 = String(l.LEAD_DATE || '').substring(0, 10);
          if (leadDate2 > pipelineFilterState.dateTo) return false;
        }
        return true;
      });
      
      // Show filter count
      var countEl = document.getElementById('pipelineFilterCount');
      if (countEl) {
        var hasFilters = pipelineFilterState.search || pipelineFilterState.agent || pipelineFilterState.source || pipelineFilterState.type || pipelineFilterState.dateFrom || pipelineFilterState.dateTo;
        if (hasFilters) {
          countEl.textContent = 'Showing ' + leads.length + ' of ' + roleFilteredLeads.length + ' leads';
        } else {
          countEl.textContent = '';
        }
      }
      
      const board = document.getElementById('kanbanBoard'); 
      let html = '';
      
var PIPELINE_CARDS_LIMIT = 50;
      stages.forEach(function(stage, i) {
        const stageLeads = leads.filter(function(l) { return l.STAGE === stage.STAGE_NAME; });
        const sColor = stage.STAGE_COLOR || 'var(--primary)';
        let totalVal = 0, cardsHtml = '';
        
        // Calculate total value across ALL leads (even hidden ones)
        stageLeads.forEach(function(l) { totalVal += Number(l.EXPECTED_VALUE) || 0; });
        
        // Only render the first 50 cards (sorted newest-first)
        var sortedLeads = stageLeads.slice().sort(function(a, b) {
          var dateA = new Date(a.UPDATED_AT || a.LEAD_DATE || 0);
          var dateB = new Date(b.UPDATED_AT || b.LEAD_DATE || 0);
          return dateB - dateA;
        });
        var visibleLeads = sortedLeads.slice(0, PIPELINE_CARDS_LIMIT);
        var hiddenCount = stageLeads.length - visibleLeads.length;
        
        visibleLeads.forEach(function(l, j) {
          totalVal += Number(l.EXPECTED_VALUE) || 0;
          const sn = (l.CONTACT_NAME || 'Unknown').replace(/'/g, "\\'");
          const valHtml = (Number(l.EXPECTED_VALUE) > 0) ? `<div style="font-size:12px; font-weight:600; color:var(--success); margin-top:4px;">${formatINR(l.EXPECTED_VALUE)}</div>` : '';
          const dotHtml = `<div style="width:8px; height:8px; border-radius:50%; background:${getScoreColor(l.PRIORITY_SCORE || 0)}; margin-right:6px;"></div>`;
          
          cardsHtml += `
            <div class="kanban-card" draggable="true" ondragstart="dragStart(event, '${l.LEAD_ID || ''}', '${stage.STAGE_NAME || ''}')" ondragend="dragEnd(event)" style="border-left-color:${sColor}; animation: scaleIn 0.3s var(--ease-spring) ${j*0.05}s both;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center;">
                  ${dotHtml}
                  <span style="font-weight:600; font-size:14px;">
                    <a href="#" onclick="openLeadDrawer('${l.LEAD_ID || ''}'); return false;" style="color:inherit; text-decoration:none;">${l.CONTACT_NAME || 'Unknown'}</a>
                  </span>
                </div>
                ${getLeadTypeBadge(l.LEAD_TYPE)}
              </div>
              <div style="font-size:12px; color:var(--text-secondary);">
                ${l.MOBILE || 'No Mobile'} ${l.COMPANY ? ' | ' + l.COMPANY : ''}
              </div>
              ${valHtml}
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                <div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px;">
                  <i data-lucide="clock" style="width:12px;"></i> ${l.LAST_CONTACTED ? String(l.LAST_CONTACTED).substring(0, 10) : 'Never'}
                </div>
                <div>
                  <button class="icon-btn call-btn" style="padding:4px;" onclick="event.stopPropagation(); generatePhoneCallLink('${l.MOBILE || ''}', '${sn}', '${l.LEAD_ID || ''}', '${stage.STAGE_NAME || ''}')"><i data-lucide="phone" style="width:14px;height:14px;"></i></button>
                  <button class="icon-btn wa-btn" style="padding:4px;" onclick="generateWhatsAppLink('${l.MOBILE || ''}', '${sn}')"><i data-lucide="message-circle" style="width:14px;height:14px;"></i></button>
                </div>
              </div>
            </div>`;
        });
        
        // Show "load more" button if there are hidden cards
        if (hiddenCount > 0) {
          cardsHtml += '<button class="btn btn-secondary" style="width:100%; margin-top:8px; padding:10px; font-size:13px;" onclick="showAllKanbanCards(this, \'' + (stage.STAGE_NAME || '').replace(/'/g, "\\'") + '\')">Show all ' + stageLeads.length + ' (' + hiddenCount + ' more) →</button>';
        }
        
        html += `
          <div class="kanban-col" data-stage="${stage.STAGE_NAME || ''}" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, '${stage.STAGE_NAME || ''}')" style="animation: slideInRight 0.4s var(--ease-spring) ${i*0.1}s both;">
            <div class="kanban-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:10px; height:10px; border-radius:50%; background:${sColor}"></div>
                ${stage.STAGE_NAME || 'Unnamed'}
              </div>
              <span class="kanban-count">${stageLeads.length}</span>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">
              ${formatINR(totalVal)}
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; overflow-y:auto; flex:1;">
              ${cardsHtml}
            </div>
          </div>`;
      });
      
      board.innerHTML = html || '<div style="padding:24px; color:var(--text-secondary);">No stages defined.</div>'; 
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  });
}

// Track currently-dragged card for reliable styling
var currentDragCard = null;
// Cache all pipeline leads (full unfiltered list) so "Show more" can expand columns
var pipelineFullLeadsCache = [];

function showAllKanbanCards(btn, stageName) {
  if (!pipelineFullLeadsCache || pipelineFullLeadsCache.length === 0) {
    showToast('Pipeline data not cached. Reload the page.', 'warning');
    return;
  }
  var col = btn.closest('.kanban-col');
  if (!col) return;
  var cardList = col.querySelector('div[style*="flex-direction:column"]');
  if (!cardList) return;
  
  // Get all leads for this stage
  var stageLeads = pipelineFullLeadsCache.filter(function(l) { return l.STAGE === stageName; });
  var sortedLeads = stageLeads.slice().sort(function(a, b) {
    var dateA = new Date(a.UPDATED_AT || a.LEAD_DATE || 0);
    var dateB = new Date(b.UPDATED_AT || b.LEAD_DATE || 0);
    return dateB - dateA;
  });
  
  // Currently visible
  var visibleCount = col.querySelectorAll('.kanban-card').length;
  var hidden = sortedLeads.slice(visibleCount);
  
  // Confirm if large
  if (hidden.length > 200) {
    if (!confirm('This column has ' + hidden.length + ' more leads. Loading all may slow your browser. Continue?')) return;
  }
  
  // Show loading
  btn.textContent = 'Loading ' + hidden.length + ' cards...';
  btn.disabled = true;
  
  // Defer with setTimeout so browser can update UI first
  setTimeout(function() {
    var extraHtml = '';
    hidden.forEach(function(l) {
      var sn = (l.CONTACT_NAME || 'Unknown').replace(/'/g, "\\'");
      var sColor = '#3B82F6';
      var valHtml = (Number(l.EXPECTED_VALUE) > 0) ? '<div style="font-size:12px; font-weight:600; color:var(--success); margin-top:4px;">' + formatINR(l.EXPECTED_VALUE) + '</div>' : '';
      var dotHtml = '<div style="width:8px; height:8px; border-radius:50%; background:' + getScoreColor(l.PRIORITY_SCORE || 0) + '; margin-right:6px;"></div>';
      
      extraHtml += '<div class="kanban-card" draggable="true" ondragstart="dragStart(event, \'' + (l.LEAD_ID || '') + '\', \'' + (l.STAGE || '') + '\')" ondragend="dragEnd(event)" style="border-left-color:' + sColor + ';">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<div style="display:flex; align-items:center;">' + dotHtml +
            '<span style="font-weight:600; font-size:14px;"><a href="#" onclick="openLeadDrawer(\'' + (l.LEAD_ID || '') + '\'); return false;" style="color:inherit; text-decoration:none;">' + (l.CONTACT_NAME || 'Unknown') + '</a></span>' +
          '</div>' + getLeadTypeBadge(l.LEAD_TYPE) +
        '</div>' +
        '<div style="font-size:12px; color:var(--text-secondary);">' + (l.MOBILE || 'No Mobile') + (l.COMPANY ? ' | ' + l.COMPANY : '') + '</div>' + valHtml +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">' +
          '<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px;"><i data-lucide="clock" style="width:12px;"></i> ' + (l.LAST_CONTACTED ? String(l.LAST_CONTACTED).substring(0, 10) : 'Never') + '</div>' +
          '<div>' +
            '<button class="icon-btn call-btn" style="padding:4px;" onclick="event.stopPropagation(); generatePhoneCallLink(\'' + (l.MOBILE || '') + '\', \'' + sn + '\', \'' + (l.LEAD_ID || '') + '\', \'' + (l.STAGE || '') + '\')"><i data-lucide="phone" style="width:14px;height:14px;"></i></button>' +
            '<button class="icon-btn wa-btn" style="padding:4px;" onclick="generateWhatsAppLink(\'' + (l.MOBILE || '') + '\', \'' + sn + '\')"><i data-lucide="message-circle" style="width:14px;height:14px;"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    
    btn.remove();
    cardList.insertAdjacentHTML('beforeend', extraHtml);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    showToast('Loaded ' + hidden.length + ' more leads', 'success');
  }, 50);
}

function dragStart(e, leadId, currentStage) {
  e.dataTransfer.setData('leadId', leadId);
  e.dataTransfer.setData('sourceStage', currentStage);
  e.dataTransfer.effectAllowed = 'move';
  // Capture the card element immediately — not in setTimeout (which is fragile)
  currentDragCard = e.target.closest('.kanban-card');
  if (currentDragCard) {
    setTimeout(function() {
      if (currentDragCard) currentDragCard.classList.add('is-dragging');
    }, 0);
  }
}

function dragEnd(e) {
  if (currentDragCard) currentDragCard.classList.remove('is-dragging');
  currentDragCard = null;
  // Defensive cleanup — remove drag-over from all columns
  document.querySelectorAll('.kanban-col').forEach(function(c) {
    c.classList.remove('drag-over');
  });
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
  // Only remove if we actually left the column (not just moved over a child)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function drop(e, newStage) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(function(c) {
    c.classList.remove('drag-over');
  });
  
  var leadId = e.dataTransfer.getData('leadId');
  var sourceStage = e.dataTransfer.getData('sourceStage');
  
  if (!leadId) return;
  if (sourceStage === newStage) return;  // dropped in same column, no action
  
  // Find the dragged card (use captured reference, fallback to query)
  var card = currentDragCard;
  if (!card) {
    var cards = document.querySelectorAll('.kanban-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].innerHTML.indexOf("'" + leadId + "'") > -1) {
        card = cards[i];
        break;
      }
    }
  }
  
  // Find the target column's card container
  var targetCol = e.currentTarget;
  var targetCardList = targetCol.querySelector('div[style*="flex-direction:column"]');
  
  // OPTIMISTIC UI: move the card visually FIRST
  if (card && targetCardList) {
    targetCardList.appendChild(card);
    card.classList.remove('is-dragging');
    
    // Update column counts AND totals instantly
    updateKanbanColumnStats();
  }
  
  // Save to database in BACKGROUND (no spinner — feels instant)
  apiCall('updateLead', { leadId: leadId, updates: { STAGE: newStage } }, function() {
    showToast('Moved to ' + newStage, 'success');
  }, function(err) {
    // ROLLBACK on failure
    showToast('Failed to move lead: ' + (err || 'try again'), 'error');
    loadPipeline();  // full reload only on error
  });
  
  currentDragCard = null;
}

// Recalculates column counts and totals after a drop
function updateKanbanColumnStats() {
  document.querySelectorAll('.kanban-col').forEach(function(col) {
    var cards = col.querySelectorAll('.kanban-card');
    var countBadge = col.querySelector('.kanban-count');
    if (countBadge) countBadge.textContent = cards.length;
    
    // Recalculate total value
    var total = 0;
    cards.forEach(function(card) {
      var valEl = card.querySelector('[style*="color:var(--success)"]');
      if (valEl) {
        var num = parseFloat(String(valEl.textContent).replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) total += num;
      }
    });
    
    // Update the total display under header
    var totalEl = col.querySelector('.kanban-header + div');
    if (totalEl && typeof formatINR === 'function') {
      totalEl.textContent = formatINR(total);
    }
  });
}

// ──────────────────────────────────────────────────────────
// BULK ACTIONS
// ──────────────────────────────────────────────────────────
function openBulkUploadModal() { 
  document.getElementById('csvFileInput').value = ''; 
  document.getElementById('bulkPreviewTable').style.display = 'none'; 
  parsedBulkLeads = []; 
  openModal('modal-bulkUpload');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function downloadLeadTemplate() {
  var headers = [
    'Name',
    'Mobile',
    'Email',
    'Company',
    'City',
    'State',
    'Product',
    'Buyer Type',
    'Source',
    'Campaign',
    'Assigned To',
    'Expected Value',
    'Notes'
  ];

  var exampleRows = [
    [
      'Rajesh Kumar',
      '9876543210',
      'rajesh@gmail.com',
      'Kumar Enterprises',
      'Mumbai',
      'Maharashtra',
      'DTF Printer',
      'Bulk',
      'INDIAMART',
      '',
      'Shreya',
      '85000',
      'Interested in complete DTF setup'
    ],
    [
      'Priya Sharma',
      '9123456789',
      'priya@designhub.in',
      'Design Hub',
      'Delhi',
      'Delhi',
      'Sublimation Printer',
      'Retail',
      'WEBSITE',
      'Sales FY2026 - Shreya',
      'Akash',
      '45000',
      'First-time buyer, needs guidance'
    ],
    [
      'Mohan Rao',
      '9988776655',
      '',
      'Rao Printing Works',
      'Hyderabad',
      'Telangana',
      'Heat Press Machine',
      'Reseller',
      'JUSTDIAL',
      '',
      'Vandana',
      '120000',
      ''
    ]
  ];

  var csvLines = [];
  csvLines.push(headers.join(','));

  exampleRows.forEach(function(row) {
    var cells = row.map(function(val) {
      var s = String(val == null ? '' : val);
      if (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    csvLines.push(cells.join(','));
  });

  var csv = csvLines.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'BMH_Leads_Template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (typeof showToast === 'function') {
    showToast('Template downloaded! Open in Excel, fill rows, then upload.', 'success');
  }
}

function handleFileSelect(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = function(evt) {
    var rawText = evt.target.result;
    // Strip BOM if present (Excel-saved CSVs often have one)
    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.substring(1);
    // Normalize line endings
    rawText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Proper CSV parser: walks character by character, respects quotes
    var rows = parseCSV(rawText);
    if (rows.length === 0) {
      parsedBulkLeads = [];
      renderBulkPreview();
      return;
    }
    
    var headers = rows[0].map(function(h) { return String(h || '').trim(); });
    parsedBulkLeads = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      // Skip totally empty rows
      var hasAny = row.some(function(c) { return c && String(c).trim() !== ''; });
      if (!hasAny) continue;
      
      var obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = (row[idx] !== undefined && row[idx] !== null) ? String(row[idx]).trim() : '';
      });
      parsedBulkLeads.push(obj);
    }
    renderBulkPreview();
  };
  r.readAsText(f);
}

function parseCSV(text) {
  var rows = [];
  var current = [];
  var field = '';
  var inQuotes = false;
  var i = 0;
  while (i < text.length) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { current.push(field); field = ''; i++; continue; }
    if (ch === '\n') { 
      current.push(field); 
      rows.push(current); 
      current = []; 
      field = ''; 
      i++; 
      continue; 
    }
    field += ch; i++;
  }
  if (field !== '' || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

function renderBulkPreview() {
  const t = document.getElementById('bulkPreviewTable'); if (parsedBulkLeads.length === 0) return;
  const h = Object.keys(parsedBulkLeads[0]); 
  let hHtml = '<tr>';
  h.forEach(function(k) { hHtml += `<th>${k}</th>`; }); 
  hHtml += '</tr>';
  document.getElementById('bulkPreviewHead').innerHTML = hHtml;
  
  let bHtml = ''; const limit = Math.min(5, parsedBulkLeads.length);
  for (let j = 0; j < limit; j++) { 
    const row = parsedBulkLeads[j]; 
    bHtml += `<tr style="animation: fadeInUp 0.3s var(--ease-out) ${j*0.05}s both;">`; 
    h.forEach(function(k) { bHtml += `<td>${row[k] || ''}</td>`; }); 
    bHtml += `</tr>`; 
  }
  document.getElementById('bulkPreviewBody').innerHTML = bHtml;
  t.style.display = 'table';
}

function submitBulkImport(btn) { 
  if (parsedBulkLeads.length === 0) return; 
  if(btn) btn.classList.add('loading'); 
  apiCall('bulkAddLeads', { leadsArray: parsedBulkLeads }, function(res) { 
    var msg = 'Imported ' + res.count + ' leads!';
    if (res.skipped && res.skipped > 0) {
      msg += ' (' + res.skipped + ' skipped: missing Name or Mobile)';
    }
    showToast(msg); 
    closeModal('modal-bulkUpload'); 
    if (typeof loadContacts === 'function') loadContacts();
    else if (typeof loadDashboard === 'function') loadDashboard(); 
    if(btn) btn.classList.remove('loading'); 
  }, function(err) { 
    showToast('Bulk import failed: ' + err, 'error');
    if(btn) btn.classList.remove('loading'); 
  }); 
}

function toggleLeadSelection(leadId, checkbox) {
  if (checkbox.checked) {
    if (selectedLeadIds.indexOf(leadId) === -1) selectedLeadIds.push(leadId);
    checkbox.closest('tr').classList.add('row-selected');
  } else {
    selectedLeadIds = selectedLeadIds.filter(function(id) { return id !== leadId; });
    checkbox.closest('tr').classList.remove('row-selected');
    var sa = document.getElementById('bulkSelectAll');
    if (sa) sa.checked = false;
  }
  updateBulkActionBar();
}

function toggleSelectAll(checkbox) {
  selectedLeadIds = [];
  document.querySelectorAll('#contactsTableBody tr').forEach(function(row) {
    var cb = row.querySelector('.bulk-checkbox');
    if (!cb) return;
    cb.checked = checkbox.checked;
    var leadId = row.getAttribute('data-lead-id');
    if (checkbox.checked && leadId) {
      selectedLeadIds.push(leadId);
      row.classList.add('row-selected');
    } else {
      row.classList.remove('row-selected');
    }
  });
  updateBulkActionBar();
}

function updateBulkActionBar() {
  var bar = document.getElementById('bulkActionBar');
  if (!bar) return;
  var count = selectedLeadIds.length;
  if (count > 0) {
    bar.style.display = 'flex';
    var cnt = document.getElementById('bulkSelectedCount');
    if (cnt) cnt.textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

function clearBulkSelection() {
  selectedLeadIds = [];
  document.querySelectorAll('#contactsTableBody .bulk-checkbox').forEach(function(cb) {
    cb.checked = false;
    var tr = cb.closest('tr');
    if (tr) tr.classList.remove('row-selected');
  });
  var sa = document.getElementById('bulkSelectAll');
  if (sa) sa.checked = false;
  updateBulkActionBar();
}

function openBulkReassignModal() {
  if (selectedLeadIds.length === 0) { showToast('Select at least one lead', 'warning'); return; }
  var countEl = document.getElementById('bulkReassignCount');
  if (countEl) countEl.textContent = selectedLeadIds.length;
  apiCall('getUsers', {}, function(users) {
    var opts = '<option value="">Select agent...</option>';
    users.forEach(function(u) {
      if (u.STATUS === 'ACTIVE' && (u.ROLE === 'AGENT' || u.ROLE === 'MANAGER')) {
        opts += `<option value="${u.NAME}">${u.NAME} (${u.ROLE})</option>`;
      }
    });
    document.getElementById('bulkReassignAgent').innerHTML = opts;
    openModal('modal-bulkReassign');
  });
}

function confirmBulkReassign(btn) {
  var newAgent = document.getElementById('bulkReassignAgent').value;
  if (!newAgent) { showToast('Select an agent', 'error'); return; }
  if (btn) btn.classList.add('loading');
  apiCall('bulkReassignLeads', {
    leadIds: selectedLeadIds,
    newAssignedTo: newAgent,
    userName: currentUser.name
  }, function(res) {
    if (res && res.success) {
      showToast(`Reassigned ${res.updated} leads to ${newAgent}`);
      closeModal('modal-bulkReassign');
      clearBulkSelection();
      loadContacts(false);
    } else {
      showToast((res && res.error) ? res.error : 'Reassign failed', 'error');
    }
    if (btn) btn.classList.remove('loading');
  }, function(err) {
    showToast(`Error: ${err}`, 'error');
    if (btn) btn.classList.remove('loading');
  });
}

function openBulkTagModal() {
  if (selectedLeadIds.length === 0) { showToast('Select at least one lead', 'warning'); return; }
  var countEl = document.getElementById('bulkTagCount');
  if (countEl) countEl.textContent = selectedLeadIds.length;
  document.getElementById('bulkTagName').value = '';
  openModal('modal-bulkTag');
}

function confirmBulkAddTag(btn) {
  var tag = document.getElementById('bulkTagName').value.trim();
  if (!tag) { showToast('Enter a tag name', 'error'); return; }
  if (btn) btn.classList.add('loading');
  apiCall('bulkAddTagToLeads', {
    leadIds: selectedLeadIds,
    tagName: tag,
    userName: currentUser.name
  }, function(res) {
    if (res && res.success) {
      showToast(`Tag "${tag}" added to ${res.updated} leads`);
      closeModal('modal-bulkTag');
      clearBulkSelection();
      loadContacts(false);
    } else {
      showToast((res && res.error) ? res.error : 'Tag add failed', 'error');
    }
    if (btn) btn.classList.remove('loading');
  });
}

function openBulkStageModal() {
  if (selectedLeadIds.length === 0) { showToast('Select at least one lead', 'warning'); return; }
  var countEl = document.getElementById('bulkStageCount');
  if (countEl) countEl.textContent = selectedLeadIds.length;
  apiCall('getPipelines', {}, function(pipelinesObj) {
    var stageSet = {};
    Object.keys(pipelinesObj).forEach(function(pname) {
      pipelinesObj[pname].forEach(function(s) { stageSet[s.STAGE_NAME] = true; });
    });
    var opts = '<option value="">Select stage...</option>';
    Object.keys(stageSet).forEach(function(s) { opts += `<option value="${s}">${s}</option>`; });
    document.getElementById('bulkNewStage').innerHTML = opts;
    openModal('modal-bulkStage');
  });
}

function confirmBulkChangeStage(btn) {
  var newStage = document.getElementById('bulkNewStage').value;
  if (!newStage) { showToast('Select a stage', 'error'); return; }
  if (btn) btn.classList.add('loading');
  apiCall('bulkChangeStageForLeads', {
    leadIds: selectedLeadIds,
    newStage: newStage,
    userName: currentUser.name
  }, function(res) {
    if (res && res.success) {
      showToast(`Updated ${res.updated} leads to ${newStage}`);
      closeModal('modal-bulkStage');
      clearBulkSelection();
      loadContacts(false);
    } else {
      showToast((res && res.error) ? res.error : 'Stage update failed', 'error');
    }
    if (btn) btn.classList.remove('loading');
  });
}

function bulkExportSelected() {
  if (selectedLeadIds.length === 0) {
    showToast('Select at least one lead', 'warning');
    return;
  }
  if (!currentFilteredLeads || currentFilteredLeads.length === 0) {
    showToast('Leads still loading. Wait and try again.', 'warning');
    return;
  }
  var selected = currentFilteredLeads.filter(function(l) {
    return selectedLeadIds.indexOf(l.LEAD_ID) > -1;
  });
  if (selected.length === 0) {
    showToast('Selected leads not found in current view. Refresh and retry.', 'error');
    return;
  }
  var dateStr = new Date().toISOString().slice(0, 10);
  exportToCSV(selected, 'BMH_Selected_Leads_' + dateStr + '.csv');
}

function bulkDeleteSelected() {  if (selectedLeadIds.length === 0) { showToast('Select at least one lead', 'warning'); return; }
  if (currentUser.role !== 'ADMIN') {
    showToast('Only ADMIN can delete leads', 'error');
    return;
  }
  if (!confirm(`Delete ${selectedLeadIds.length} leads permanently? This cannot be undone.`)) return;
  showSpinner();
  apiCall('bulkDeleteLeads', {
    leadIds: selectedLeadIds,
    userName: currentUser.name,
    userRole: currentUser.role
  }, function(res) {
    hideSpinner();
    if (res && res.success) {
      showToast(`Deleted ${res.deleted} leads`);
      clearBulkSelection();
      loadContacts(false);
    } else {
      showToast((res && res.error) ? res.error : 'Delete failed', 'error');
    }
  });
}

// ──────────────────────────────────────────────────────────
// LEAD DRAWER
// ──────────────────────────────────────────────────────────
function openLeadDrawer(leadId) {
  currentDrawerLeadId = leadId;
  document.getElementById('drawTimeline').innerHTML = getListSkeletons(2);
  document.getElementById('drawFormResponses').innerHTML = '';
  document.getElementById('leadDrawer').classList.add('open');
  
  apiCall('getLeadById', { leadId: leadId }, function(l) {
    const sn = (l.CONTACT_NAME || 'Unknown').replace(/'/g, "\\'"); const score = l.PRIORITY_SCORE || 0;
    document.getElementById('drawName').textContent = l.CONTACT_NAME || '-';
    document.getElementById('drawId').textContent = l.LEAD_ID || '-';
    
    const statusBadgeCls = l.STATUS === 'WON' ? 'badge-won' : (l.STATUS === 'LOST' ? 'badge-lost' : 'badge-new');
    document.getElementById('drawBadges').innerHTML = `
      ${getLeadTypeBadge(l.LEAD_TYPE)} 
      <span class="badge ${getStageBadgeClass(l.STAGE)}">${l.STAGE || '-'}</span> 
      <span class="badge ${statusBadgeCls}">${l.STATUS || '-'}</span>`;
      
    document.getElementById('drawScoreBar').innerHTML = `
      <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Priority Score: <span id="drawScoreVal">0</span>/100</div>
      <div style="width:100%; height:8px; background:var(--surface); border-radius:4px; overflow:hidden;">
        <div style="height:100%; width:0%; background:${getScoreColor(score)}; transition: width 1s var(--ease-spring);" id="drawScoreFill"></div>
      </div>`;
      
setTimeout(function() {
      animateValue(document.getElementById('drawScoreVal'), 0, score, 800);
      document.getElementById('drawScoreFill').style.width = `${score}%`;
    }, 50);

    // Show Repeat Order button ONLY if CONVERTED or WON
    const btnRepeat = document.getElementById('btnRepeatOrder');
    if (btnRepeat) {
      if (l.STATUS === 'WON' || l.STAGE === 'CONVERTED') {
        btnRepeat.style.display = 'flex';
      } else {
        btnRepeat.style.display = 'none';
      }
    }
    
    document.getElementById('drawMobile').textContent = l.MOBILE || '-';
    document.getElementById('drawEmail').textContent = l.EMAIL || '-';
    document.getElementById('drawCompany').textContent = l.COMPANY || '-';
    document.getElementById('drawValue').textContent = formatINR(l.EXPECTED_VALUE);
    document.getElementById('drawSource').textContent = l.LEAD_SOURCE || '-';
    document.getElementById('drawCampaign').textContent = l.CAMPAIGN || '-';
    document.getElementById('drawAssigned').textContent = l.ASSIGNED_TO || '-';
    document.getElementById('drawCreated').textContent = l.LEAD_DATE ? String(l.LEAD_DATE).substring(0, 10) : '-';
var drawNextFu = document.getElementById('drawNextFollowup');
    if (drawNextFu) drawNextFu.innerHTML = formatFollowupDate(l.NEXT_FOLLOWUP).display;
    var drawProd = document.getElementById('drawProduct');
    if (drawProd) drawProd.textContent = l.PRODUCT_INTEREST || '-';
    var drawSt = document.getElementById('drawState');
    if (drawSt) drawSt.textContent = l.STATE || '-';
    var drawBt = document.getElementById('drawBuyerType');
    if (drawBt) drawBt.textContent = l.BUYER_TYPE || '-';
    document.getElementById('drawBtnCall').onclick = function() { generatePhoneCallLink(l.MOBILE, sn, l.LEAD_ID, l.STAGE); };
    document.getElementById('drawBtnFollow').onclick = function() { openFollowUpModal(l.LEAD_ID, sn, l.STAGE); closeLeadDrawer(); };
    document.getElementById('drawBtnWa').onclick = function() { generateWhatsAppLink(l.MOBILE, sn); };

    apiCall('getFormResponses', { leadId: leadId }, function(resp) {
      const rDiv = document.getElementById('drawFormResponses');
      if (resp.length === 0) rDiv.innerHTML = '<div style="font-size:13px; color:var(--text-secondary);">No responses.</div>';
      else { 
        let fh = ''; 
        resp.forEach(function(r, i) { 
          fh += `
            <div style="background:var(--surface); padding:12px; border-radius:6px; border:1px solid var(--border); margin-bottom:8px; animation: slideInRight 0.3s var(--ease-spring) ${i*0.05}s both;">
              <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">${String(r.TIMESTAMP || '').substring(0, 10)} | ${r.CAMPAIGN_NAME || '-'}</div>
              <div style="font-weight:600; font-size:13px;">${r.FIELD_LABEL || '-'}</div>
              <div style="font-size:14px; margin-top:4px;">${r.RESPONSE_VALUE || '-'}</div>
            </div>`; 
        }); 
        rDiv.innerHTML = fh; 
      }
    });

    apiCall('getFollowUpHistory', { leadId: leadId }, function(h) {
      const t = document.getElementById('drawTimeline');
      if (h.length === 0) t.innerHTML = '<div style="font-size:13px; color:var(--text-secondary);">No history.</div>';
      else { 
        let hh = ''; 
        h.forEach(function(log, j) { 
          const nH = log.NOTES ? `<div style="background:var(--surface); padding:8px; border-radius:4px; margin-top:4px;">${log.NOTES}</div>` : ''; 
          hh += `
            <div style="margin-bottom:12px; font-size:13px; animation: fadeInUp 0.3s var(--ease-spring) ${j*0.05}s both;">
              <div style="color:var(--text-secondary); font-size:12px;">${String(log.LOG_DATE || '').substring(0, 10)} by ${(log.AGENT || 'Unknown').split('@')[0]}</div>
              <div style="font-weight:600;">${log.ACTION || '-'} - ${log.OUTCOME || '-'}</div>
              ${nH}
            </div>`; 
        }); 
        t.innerHTML = hh; 
      }
      
      loadLeadDocuments(leadId);
    });
  });
}

function closeLeadDrawer() { 
  document.getElementById('leadDrawer').classList.remove('open'); 
}

function editCurrentDrawerLead() {
  if (!currentDrawerLeadId) { 
    showToast('No lead is currently open', 'error'); 
    return; 
  }
  closeLeadDrawer();
  setTimeout(function() {
    openEditLeadModal(currentDrawerLeadId);
  }, 300);
}

// ──────────────────────────────────────────────────────────
// REPEAT ORDER / CLONE LEAD LOGIC
// ──────────────────────────────────────────────────────────
function createRepeatLeadFromDrawer() {
  if (!currentDrawerLeadId) return;
  
  showSpinner();
  apiCall('getLeadById', { leadId: currentDrawerLeadId }, function(lead) {
    hideSpinner();
    closeLeadDrawer();
    
    // Open the Add Lead modal
    openAddLeadModal();

    // Small delay to ensure the modal and dropdowns are fully loaded
    setTimeout(function() {
      // Pre-fill all contact info
      document.getElementById('lName').value = lead.CONTACT_NAME || '';
      document.getElementById('lMobile').value = lead.MOBILE || '';
      document.getElementById('lCompany').value = lead.COMPANY || '';
      document.getElementById('lCity').value = lead.CITY || '';
      document.getElementById('lState').value = lead.STATE || '';
      document.getElementById('lBuyerType').value = lead.BUYER_TYPE || '';
      document.getElementById('lSource').value = lead.LEAD_SOURCE || '';
      
// Add a helpful note automatically
      document.getElementById('lNotes').value = "Cloned/Repeat Order! Previous product was: " + (lead.PRODUCT_INTEREST || 'Unknown');
      
      // Link to the parent lead
      if (document.getElementById('lParentLeadId')) document.getElementById('lParentLeadId').value = lead.LEAD_ID;

      // Leave Product, Pipeline, Campaign, and Value blank for the new deal
      document.getElementById('lProduct').value = '';
      document.getElementById('lValue').value = '0';
      
      showToast('Lead cloned successfully! Update details and save.', 'info');
    }, 200);
  });
}
// ──────────────────────────────────────────────────────────
// COLUMN FILTERS — Google-Sheets-style header dropdowns
// ──────────────────────────────────────────────────────────
var columnFilters = {};
var currentFilterDropdown = null;
var columnFilterRawCache = [];

// Friendly column labels for the dropdown title
var COLUMN_FILTER_LABELS = {
  STATE: 'State',
  BUYER_TYPE: 'Buyer Type',
  LEAD_SOURCE: 'Source',
  ASSIGNED_TO: 'Assigned To',
  STAGE: 'Stage',
  LEAD_TYPE: 'Type'
};

function setupColumnFilters() {
  var buttons = document.querySelectorAll('.th-filter-btn');
  buttons.forEach(function(btn) {
    // Avoid double-binding
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      var th = btn.closest('th');
      if (!th) return;
      openColumnFilterDropdown(th);
    });
  });
}

function openColumnFilterDropdown(thElement) {
  // Close any existing dropdown
  closeColumnFilterDropdown();
  
  var columnKey = thElement.getAttribute('data-column-key');
  if (!columnKey) return;
  
  // Cache the raw (unfiltered) leads on first open, so re-opening shows ALL values
  // not just currently-visible filtered subset
  if (columnFilterRawCache.length === 0 || !hasActiveFilters()) {
    columnFilterRawCache = currentFilteredLeads.slice();
  }
  
  // Get unique values + counts for this column
  var valueCounts = {};
  columnFilterRawCache.forEach(function(lead) {
    var val = lead[columnKey];
    var key = (val === null || val === undefined || val === '') ? '(Empty)' : String(val);
    valueCounts[key] = (valueCounts[key] || 0) + 1;
  });
  
  var uniqueValues = Object.keys(valueCounts).sort(function(a, b) {
    if (a === '(Empty)') return 1;
    if (b === '(Empty)') return -1;
    return a.localeCompare(b);
  });
  
  if (uniqueValues.length === 0) {
    showToast('No data available to filter', 'warning');
    return;
  }
  
  // Currently selected values for this column (if any)
  var selected = columnFilters[columnKey] || [];
  
  // Build dropdown HTML
  var labelText = COLUMN_FILTER_LABELS[columnKey] || columnKey;
  var html = 
    '<div class="column-filter-header">' +
      '<div class="column-filter-header-title">' + labelText + '</div>' +
      '<button class="column-filter-header-close" type="button" onclick="closeColumnFilterDropdown()"><i data-lucide="x" style="width:14px;height:14px;"></i></button>' +
    '</div>' +
    '<input type="text" class="column-filter-search" placeholder="Search ' + labelText.toLowerCase() + '..." oninput="filterColumnDropdownList(this)">' +
    '<div class="column-filter-quick">' +
      '<a onclick="selectAllColumnFilter(true)">Select all</a><span>·</span>' +
      '<a onclick="selectAllColumnFilter(false)">Clear</a>' +
    '</div>' +
    '<div class="column-filter-list">';
  
  uniqueValues.forEach(function(val) {
    var isChecked = selected.length === 0 || selected.indexOf(val) > -1;
    var safeVal = val.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    html += 
      '<label class="column-filter-item">' +
        '<input type="checkbox" value="' + safeVal + '" ' + (isChecked ? 'checked' : '') + '>' +
        '<span class="column-filter-item-label">' + val + '</span>' +
        '<span class="column-filter-item-count">' + valueCounts[val] + '</span>' +
      '</label>';
  });
  
  html += 
    '</div>' +
    '<div class="column-filter-actions">' +
      '<button class="column-filter-btn" type="button" onclick="clearColumnFilter(\'' + columnKey + '\')">Clear filter</button>' +
      '<button class="column-filter-btn primary" type="button" onclick="applyColumnFilterFromDropdown(\'' + columnKey + '\')">Apply</button>' +
    '</div>';
  
  // Create dropdown element
  var dropdown = document.createElement('div');
  dropdown.className = 'column-filter-dropdown';
  dropdown.innerHTML = html;
  document.body.appendChild(dropdown);
  
  // Position below the th
  var rect = thElement.getBoundingClientRect();
  var dropdownWidth = 260;
  var leftPos = rect.left + window.scrollX;
  // Prevent dropdown going off right edge
  if (leftPos + dropdownWidth > window.innerWidth) {
    leftPos = window.innerWidth - dropdownWidth - 12;
  }
  dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  dropdown.style.left = leftPos + 'px';
  
  currentFilterDropdown = dropdown;
  
  // Re-render lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeColumnFilterDropdown() {
  if (currentFilterDropdown && currentFilterDropdown.parentNode) {
    currentFilterDropdown.parentNode.removeChild(currentFilterDropdown);
  }
  currentFilterDropdown = null;
}

function filterColumnDropdownList(searchInput) {
  var search = searchInput.value.toLowerCase().trim();
  var items = currentFilterDropdown.querySelectorAll('.column-filter-item');
  items.forEach(function(item) {
    var label = item.querySelector('.column-filter-item-label').textContent.toLowerCase();
    item.style.display = (search === '' || label.indexOf(search) > -1) ? 'flex' : 'none';
  });
}

function selectAllColumnFilter(check) {
  if (!currentFilterDropdown) return;
  var visible = currentFilterDropdown.querySelectorAll('.column-filter-item');
  visible.forEach(function(item) {
    if (item.style.display !== 'none') {
      item.querySelector('input[type="checkbox"]').checked = check;
    }
  });
}

function applyColumnFilterFromDropdown(columnKey) {
  if (!currentFilterDropdown) return;
  var checkboxes = currentFilterDropdown.querySelectorAll('.column-filter-item input[type="checkbox"]');
  var allItems = currentFilterDropdown.querySelectorAll('.column-filter-item');
  var totalCount = allItems.length;
  var checkedValues = [];
  checkboxes.forEach(function(cb) { 
    if (cb.checked) checkedValues.push(cb.value); 
  });
  
  // If all values are checked, treat as "no filter"
  if (checkedValues.length === 0) {
    showToast('Please select at least one value', 'warning');
    return;
  }
  if (checkedValues.length === totalCount) {
    delete columnFilters[columnKey];
  } else {
    columnFilters[columnKey] = checkedValues;
  }
  
  closeColumnFilterDropdown();
  applyColumnFilters();
}

function clearColumnFilter(columnKey) {
  delete columnFilters[columnKey];
  closeColumnFilterDropdown();
  applyColumnFilters();
}

function clearAllColumnFilters() {
  columnFilters = {};
  columnFilterRawCache = [];
  applyColumnFilters();
}

function hasActiveFilters() {
  return Object.keys(columnFilters).length > 0;
}

function applyColumnFilters() {
  // Get the source data
  var source = columnFilterRawCache.length > 0 ? columnFilterRawCache : currentFilteredLeads;
  
  // Apply all active filters
  var filtered = source.filter(function(lead) {
    for (var col in columnFilters) {
      var allowedValues = columnFilters[col];
      if (!allowedValues || allowedValues.length === 0) continue;
      var leadVal = lead[col];
      var key = (leadVal === null || leadVal === undefined || leadVal === '') ? '(Empty)' : String(leadVal);
      if (allowedValues.indexOf(key) === -1) return false;
    }
    return true;
  });
  
  // Update has-filter class on column headers
  document.querySelectorAll('th[data-column-key]').forEach(function(th) {
    var key = th.getAttribute('data-column-key');
    if (columnFilters[key]) {
      th.classList.add('has-filter');
    } else {
      th.classList.remove('has-filter');
    }
  });
  
  // Update the active-filters banner
  renderColumnFilterBanner(source.length, filtered.length);
  
  // Re-render table with filtered rows
  renderContactsTable(filtered);
  
  // Update count display
  var countEl = document.getElementById('contactsCount');
  if (countEl && hasActiveFilters()) {
    countEl.textContent = 'Showing ' + filtered.length + ' filtered from ' + source.length + ' on this page (of ' + contactsState.totalCount.toLocaleString() + ' total)';
  }
}

function renderColumnFilterBanner(total, filtered) {
  var banner = document.getElementById('columnFilterBanner');
  if (!banner) return;
  
  var activeKeys = Object.keys(columnFilters);
  if (activeKeys.length === 0) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  
  var summary = activeKeys.map(function(key) {
    var label = COLUMN_FILTER_LABELS[key] || key;
    var vals = columnFilters[key];
    if (vals.length === 1) {
      return label + ': <b>' + vals[0] + '</b>';
    } else {
      return label + ': <b>' + vals.length + ' selected</b>';
    }
  }).join(' &nbsp;·&nbsp; ');
  
  banner.innerHTML = 
    '<div class="column-filter-banner">' +
      '<i data-lucide="filter" class="column-filter-banner-icon"></i>' +
      '<div class="column-filter-banner-text">' + summary + ' — showing <b>' + filtered + '</b> of ' + total + ' rows on this page</div>' +
      '<button class="column-filter-banner-clear" type="button" onclick="clearAllColumnFilters()">Clear all filters</button>' +
    '</div>';
  banner.style.display = 'block';
  
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!currentFilterDropdown) return;
  if (currentFilterDropdown.contains(e.target)) return;
  if (e.target.closest('.th-filter-btn')) return;
  closeColumnFilterDropdown();
});

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && currentFilterDropdown) {
    closeColumnFilterDropdown();
  }
});