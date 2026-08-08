// ============================================================
// main.js - Initialization, Routing, Sidebar, and Global UI Logic
// ============================================================

const PRICE_CATALOG_URL = 'https://mulyaa.netlify.app/?embed=1';

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;

  populatePipelineDropdowns();
  populateUserDropdowns();

  initAgentSwitcher();
  applyRoleAccess();
  
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
  
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const dashPage = document.getElementById('page-dashboard');
  if (dashPage) dashPage.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const dashNav = document.querySelector('.nav-item[onclick*="dashboard"]');
  if (dashNav) dashNav.classList.add('active');
  
  if (typeof loadDashboard === 'function') {
    await loadDashboard();
  }
});

const populatePipelineDropdowns = () => {
  apiCall('getPipelineNames', {}, (names) => {
    let opts = '<option value="">Select Pipeline...</option>';
    names.forEach(nm => { opts += `<option value="${nm}">${nm}</option>`; });
    ['lPipeline', 'ePipeline', 'pipelineSelector'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  });
};

const populateUserDropdowns = () => {
  apiCall('getUsers', {}, (users) => {
    let opts = '<option value="">Unassigned</option>';
    users.forEach(u => {
      if (u.STATUS === 'ACTIVE') {
        opts += `<option value="${u.NAME}">${u.NAME}</option>`;
      }
    });
    ['lAssigned', 'eAssigned', 'lrUser'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  });
};

const populateCampaignDropdowns = () => {
  apiCall('getCampaigns', {}, (camps) => {
    let opts = '<option value="">Select Campaign...</option>'; 
    camps.forEach(c => { opts += `<option value="${c.CAMPAIGN_NAME}">${c.CAMPAIGN_NAME}</option>`; });
    const formSelect = document.getElementById('formCampaignSelect');
    if (formSelect) formSelect.innerHTML = opts;
  });
};

const applyRoleAccess = () => {
  if (currentUser.role === 'AGENT') {
    document.querySelectorAll('.nav-admin, .admin-only').forEach(el => { 
      el.style.display = 'none'; 
    });
  }
};

const filterLeadsByRole = (leads) => {
  if (!leads) return [];
  const isAdminOrManager = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  if (isAdminOrManager && viewAsAgent) {
    return leads.filter(l => l.ASSIGNED_TO === viewAsAgent);
  }
  if (isAdminOrManager) return leads;
  return leads.filter(l => l.ASSIGNED_TO === currentUser.name);
};

const toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
};

const showPage = (pageId, navElement) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');
  if (navElement) navElement.classList.add('active');
  
  const titles = { 
    dashboard: 'Dashboard', contacts: 'Contacts', mytasks: 'My Tasks', 
    calendar: 'Calendar', orders: 'Orders', quotations: 'Quotations', 
    pipeline: 'Pipeline', campaigns: 'Campaigns', knowledge: 'Knowledge Base', 
    reports: 'Reports', leaderboard: 'Leaderboard', settings: 'Settings', collections: 'Collections', vasooli: 'Vasooli' 
  };
  
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[pageId] || '';
  
  if (typeof staggerElements === 'function') {
    staggerElements(`#page-${pageId}`, '.stagger-item');
  }

  switch (pageId) {
    case 'dashboard': if (typeof loadDashboard === 'function') loadDashboard(); break;
    case 'contacts': 
      if (!window.contactsFiltersLoaded && typeof populateContactFilters === 'function') {
        populateContactFilters();
        window.contactsFiltersLoaded = true;
      }
      if (typeof loadContacts === 'function') loadContacts(); 
      break;
    case 'mytasks': if (typeof loadMyTasks === 'function') loadMyTasks(); break;
    case 'calendar': if (typeof loadCalendar === 'function') loadCalendar(); break;
    case 'orders': if (typeof loadOrders === 'function') loadOrders(); break;
    case 'collections': if (typeof loadCollections === 'function') loadCollections(); break;
    case 'quotations': if (typeof loadQuotations === 'function') loadQuotations(); break;
    case 'pipeline': if (typeof loadPipeline === 'function') loadPipeline(); break;
    case 'campaigns': if (typeof loadCampaigns === 'function') loadCampaigns(); break;
    case 'reports': if (typeof loadReports === 'function') loadReports(); break;
    case 'leaderboard': if (typeof loadLeaderboard === 'function') loadLeaderboard(); break;
    case 'knowledge': if (typeof loadKnowledge === 'function') loadKnowledge(); break;
    case 'settings': if (typeof loadSettings === 'function') loadSettings(); break;
  }

  if (window.innerWidth <= 768) toggleSidebar();
};

const initAgentSwitcher = () => {
  if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER')) {
    const switcher = document.querySelector('.agent-switcher');
    if (switcher) switcher.style.display = 'none';
    return;
  }
  
  apiCall('getUsers', {}, (users) => {
    const listEl = document.getElementById('agentSwitcherList');
    if (!listEl) return;
    
    let html = '';
    users.forEach(u => {
      if (u.STATUS === 'ACTIVE' && (u.ROLE === 'AGENT' || u.ROLE === 'MANAGER')) {
        const safeName = u.NAME || 'Unknown Agent';
        const initial = safeName.charAt(0).toUpperCase();
        html += `
          <div class="agent-switcher-item" data-agent="${safeName}" onclick="setViewAsAgent('${safeName}', this)">
            <div class="agent-switcher-avatar">${initial}</div>
            <div>
              <div class="agent-name">${safeName}</div>
              <div class="agent-role">${u.ROLE}</div>
            </div>
          </div>
        `;
      }
    });
    
    listEl.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  });
};

const toggleAgentSwitcher = (e) => {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('agentSwitcherDropdown');
  if (!dropdown) return;
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
};

const setViewAsAgent = (agentName, itemEl) => {
  viewAsAgent = agentName || '';
  
  const labelEl = document.getElementById('agentSwitcherLabel');
  if (labelEl) labelEl.textContent = agentName || 'All Agents';
  
  const btn = document.getElementById('agentSwitcherBtn');
  if (btn) {
    agentName ? btn.classList.add('agent-switcher-active') : btn.classList.remove('agent-switcher-active');
  }
  
  const banner = document.getElementById('agentViewBanner');
  const bannerName = document.getElementById('bannerAgentName');
  if (banner && bannerName) {
    if (agentName) {
      banner.style.display = 'block';
      bannerName.textContent = agentName.toUpperCase();
    } else {
      banner.style.display = 'none';
    }
  }
  
  document.querySelectorAll('.agent-switcher-item').forEach(item => item.classList.remove('active'));
  if (itemEl) {
    itemEl.classList.add('active');
  } else {
    const allAgentsItem = document.querySelector('.agent-switcher-item[data-agent=""]');
    if (allAgentsItem) allAgentsItem.classList.add('active');
  }
  
  const dropdown = document.getElementById('agentSwitcherDropdown');
  if (dropdown) dropdown.style.display = 'none';
  
  if (typeof showToast === 'function') {
    showToast(agentName ? `Viewing as: ${agentName}` : 'Team view restored');
  }
  
  refreshCurrentPage();
};

const refreshCurrentPage = () => {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  
  const pageId = activePage.id.replace('page-', '');
  
  switch (pageId) {
    case 'dashboard': if (typeof loadDashboard === 'function') loadDashboard(); break;
    case 'contacts': if (typeof loadContacts === 'function') loadContacts(true); break;
    case 'mytasks': if (typeof loadMyTasks === 'function') loadMyTasks(); break;
    case 'calendar': if (typeof loadCalendar === 'function') loadCalendar(); break;
    case 'orders': if (typeof loadOrders === 'function') loadOrders(); break;
    case 'collections': if (typeof loadCollections === 'function') loadCollections(); break;
    case 'pipeline': if (typeof loadPipeline === 'function') loadPipeline(); break;
    case 'quotations': if (typeof loadQuotations === 'function') loadQuotations(); break;
  }
};

document.addEventListener('click', (e) => {
  const switcher = document.querySelector('.agent-switcher');
  const dropdown = document.getElementById('agentSwitcherDropdown');
  if (switcher && dropdown && !switcher.contains(e.target) && dropdown.style.display !== 'none') {
    dropdown.style.display = 'none';
  }
});

const toggleBreak = () => {
  var btn = document.getElementById('breakBtn');
  if (!btn) return;
  var isOnBreak = btn.classList.toggle('on-break');
  btn.innerHTML = isOnBreak
    ? '<i data-lucide="play"></i> End Break'
    : '<i data-lucide="coffee"></i> Take Break';
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
  if (typeof showToast === 'function') {
    showToast(isOnBreak ? 'Break started' : 'Break ended');
  }
};

const toggleNotifications = () => {
  var panel = document.getElementById('notificationsPanel');
  if (panel) {
    panel.classList.toggle('open');
  } else {
    if (typeof showToast === 'function') {
      showToast('No new notifications', 'info');
    }
  }
};

const openCreateCampaignModal = () => {
  // Reset fields
  var nameEl = document.getElementById('cName');
  var retryMaxEl = document.getElementById('cRetryMax');
  var retryIntEl = document.getElementById('cRetryInterval');
  var distEl = document.getElementById('cDist');
  if (nameEl) nameEl.value = '';
  if (retryMaxEl) retryMaxEl.value = '';
  if (retryIntEl) retryIntEl.value = '';
  if (distEl) distEl.value = 'MANUAL';
  
  // Populate Pipeline dropdown
  apiCall('getPipelineNames', {}, function(names) {
    var pipeOpts = '<option value="">Select pipeline...</option>';
    (names || []).forEach(function(n) { pipeOpts += '<option value="' + n + '">' + n + '</option>'; });
    var pipeEl = document.getElementById('cPipeline');
    if (pipeEl) pipeEl.innerHTML = pipeOpts;
  });
  
  // Populate Manager dropdown + Agents checkbox list
  apiCall('getUsers', {}, function(users) {
    var activeUsers = (users || []).filter(function(u) { return u.STATUS === 'ACTIVE'; });
    
    // Manager dropdown — show ADMIN + MANAGER roles
    var managers = activeUsers.filter(function(u) { return u.ROLE === 'ADMIN' || u.ROLE === 'MANAGER'; });
    var mgrOpts = '<option value="">Select manager...</option>';
    managers.forEach(function(u) { mgrOpts += '<option value="' + u.NAME + '">' + u.NAME + ' (' + u.ROLE + ')</option>'; });
    var mgrEl = document.getElementById('cManager');
    if (mgrEl) mgrEl.innerHTML = mgrOpts;
    
    // Agents checkboxes — show AGENT + MANAGER roles
    var agents = activeUsers.filter(function(u) { return u.ROLE === 'AGENT' || u.ROLE === 'MANAGER'; });
    var cbContainer = document.getElementById('cAgentsCheckboxes');
    if (cbContainer) {
      if (agents.length === 0) {
        cbContainer.innerHTML = '<div style="color:var(--text-secondary); font-size:12px;">No active agents found.</div>';
      } else {
        var cbHtml = '';
        agents.forEach(function(u) {
          var safeName = String(u.NAME || '').replace(/"/g, '&quot;');
          cbHtml += '<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:var(--bg); border-radius:6px; cursor:pointer; font-size:13px;">' +
                      '<input type="checkbox" class="campaign-agent-cb" value="' + safeName + '" style="accent-color:var(--primary); cursor:pointer;">' +
                      '<span>' + safeName + '</span>' +
                      '<span style="font-size:10px; color:var(--text-secondary); margin-left:auto;">' + u.ROLE + '</span>' +
                    '</label>';
        });
        cbContainer.innerHTML = cbHtml;
      }
    }
  });
  
  if (typeof openModal === 'function') {
    openModal('modal-createCampaign');
  }
};

const exportReports = () => {
  if (typeof currentReportData !== 'undefined' && currentReportData && currentReportData.length > 0) {
    var d = new Date();
    var year = d.getFullYear();
    var month = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    var filename = 'BMH_Report_' + year + '-' + month + '-' + day + '.csv';
    if (typeof exportToCSV === 'function') {
      exportToCSV(currentReportData, filename);
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('No report data to export. Generate a report first.', 'warning');
    }
  }
};

const openAddCustomFieldForm = () => {
  var modal = document.getElementById('addCustomFieldModal');
  if (modal) {
    modal.classList.add('show');
  } else {
    if (typeof showToast === 'function') {
      showToast('Custom field form coming soon', 'info');
    }
  }
};

const confirmDeleteArticle = (articleId) => {
  if (!articleId) {
    if (typeof showToast === 'function') {
      showToast('Error: No article ID provided', 'error');
    }
    return;
  }
  var isConfirmed = confirm('Delete this article permanently? This cannot be undone.');
  if (isConfirmed) {
    if (typeof deleteKnowledgeArticle === 'function') {
      deleteKnowledgeArticle(articleId);
    } else {
      if (typeof showToast === 'function') {
        showToast('Delete handler not implemented yet', 'error');
      }
    }
  }
};

const openPriceCatalog = () => {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pcPage = document.getElementById('page-pricecatalog');
  if (pcPage) {
    pcPage.classList.add('active');
    pcPage.style.display = 'block';
  }
  
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = 'Price Catalog';
  
  const iframe = document.getElementById('priceCatalogFrame');
  if (iframe) {
    const currentSrc = iframe.getAttribute('src');
    if (!currentSrc || currentSrc === 'about:blank') {
      let loader = document.getElementById('priceCatalogLoader');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'priceCatalogLoader';
        loader.style.cssText = 'padding: 40px; text-align: center; color: #666; font-weight: 500; font-size: 1.1rem;';
        loader.textContent = 'Loading Price Catalog...';
        iframe.parentNode.insertBefore(loader, iframe);
      }
      
      loader.style.display = 'block';
      iframe.style.opacity = '0';
      iframe.style.transition = 'opacity 0.3s ease';
      
      iframe.onload = () => {
        if (loader) loader.style.display = 'none';
        iframe.style.opacity = '1';
      };
      
      iframe.src = PRICE_CATALOG_URL;
    }
  }
};

const closePriceCatalog = () => {
  const pcPage = document.getElementById('page-pricecatalog');
  if (pcPage) {
    pcPage.classList.remove('active');
    pcPage.style.display = 'none';
  }

  const dashboardNav = document.querySelector('[data-page="dashboard"]') || document.querySelector('.nav-item[onclick*="dashboard"]');
  showPage('dashboard', dashboardNav);
};

// ============================================
// PRICE CALCULATOR SUBMENU LOGIC
// ============================================
function togglePriceCalcMenu(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var group = document.getElementById('navPriceCalcGroup');
  if (group) group.classList.toggle('expanded');
}

function openPriceCalcPage(targetPage, linkEl) {
  // Mark this sub-item as active visually
  document.querySelectorAll('.nav-subitem').forEach(function(el) {
    el.classList.remove('active');
  });
  if (linkEl) linkEl.classList.add('active');

  // Mark the parent group as active too
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
  });
  var parent = document.getElementById('navPriceCalcParent');
  if (parent) parent.classList.add('active');

  // Show the price catalog page (existing #page-pricecatalog section)
  if (typeof showPage === 'function') {
    showPage('pricecatalog', null);
  } else {
    // Manual fallback if showPage signature differs
    document.querySelectorAll('.page').forEach(function(p) {
      p.classList.remove('active');
    });
    var target = document.getElementById('page-pricecatalog');
    if (target) target.classList.add('active');
  }

  // Load the iframe with the requested page in URL hash
  var frame = document.getElementById('priceCatalogFrame');
  if (frame) {
    var baseUrl = 'https://mulyaa.netlify.app/?embed=1';
    frame.src = baseUrl + '#' + targetPage;
  }

  // Update page title
  var titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    var titles = {
      'dashboard': 'Price Calculator — Dashboard',
      'calculator': 'Price Calculator — Sales Lookup',
      'slab-view': 'Price Calculator — Full Slab View',
      'catalog': 'Price Calculator — Sales Price List',
      'profit-rules': 'Price Calculator — Profit Rules',
      'catalog-guide': 'Price Calculator — Catalog Guide',
      'users': 'Price Calculator — Users',
      'mousepad-calc': 'Price Calculator — Mousepad Calc'
    };
    titleEl.textContent = titles[targetPage] || 'Price Calculator';
  }

  // Close mobile sidebar if open
  if (typeof toggleSidebar === 'function' && window.innerWidth < 1024) {
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      toggleSidebar();
    }
  }
}

// ============================================
// PRICE CALCULATOR LANDING + IFRAME LOGIC
// ============================================

var PRICECALC_PAGES = {
  'dashboard':     { title: 'Dashboard',        icon: 'bar-chart-2' },
  'calculator':    { title: 'Sales Lookup',     icon: 'search' },
  'slab-view':     { title: 'Full Slab View',   icon: 'trending-up' },
  'catalog':       { title: 'Sales Price List', icon: 'list' },
  'profit-rules':  { title: 'Profit Rules',     icon: 'pie-chart' },
  'catalog-guide': { title: 'Catalog Guide',    icon: 'book' },
  'users':         { title: 'Users',            icon: 'users' },
  'mousepad-calc': { title: 'Mousepad Calc',    icon: 'calculator' }
};

function showPricecalcLanding(linkEl) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  var landing = document.getElementById('page-pricecalc-landing');
  if (landing) landing.classList.add('active');

  var iframePage = document.getElementById('page-pricecatalog');
  if (iframePage) iframePage.classList.remove('active');

  var frame = document.getElementById('priceCatalogFrame');
  if (frame) frame.src = 'about:blank';

  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
  });
  if (linkEl) {
    linkEl.classList.add('active');
  } else {
    var sidebarLink = document.querySelector('.nav-item[data-page="pricecalc"]');
    if (sidebarLink) sidebarLink.classList.add('active');
  }

  var titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = 'Price Calculator';

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  if (window.innerWidth < 1024) {
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open') && typeof toggleSidebar === 'function') {
      toggleSidebar();
    }
  }
}

function openPricecalcPage(pageKey) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  var landing = document.getElementById('page-pricecalc-landing');
  if (landing) landing.classList.remove('active');

  var iframePage = document.getElementById('page-pricecatalog');
  if (iframePage) iframePage.classList.add('active');

  var frame = document.getElementById('priceCatalogFrame');
  if (frame) frame.src = 'https://mulyaa.netlify.app/?embed=1#' + pageKey;

  var pageInfo = PRICECALC_PAGES[pageKey] || { title: 'Page', icon: 'tag' };

  var titleEl = document.getElementById('pricecalcPageTitle');
  if (titleEl) {
    titleEl.innerHTML = '<i data-lucide="' + pageInfo.icon + '" style="width:18px; vertical-align:middle;"></i> ' + pageInfo.title;
  }

  var extLink = document.getElementById('pricecalcExternalLink');
  if (extLink) extLink.href = 'https://mulyaa.netlify.app/#' + pageKey;

  var topbarTitle = document.getElementById('pageTitle');
  if (topbarTitle) topbarTitle.textContent = 'Price Calculator — ' + pageInfo.title;

  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
  });
  var sidebarLink = document.querySelector('.nav-item[data-page="pricecalc"]');
  if (sidebarLink) sidebarLink.classList.add('active');

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}