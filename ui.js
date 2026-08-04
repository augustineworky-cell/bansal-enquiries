// ──────────────────────────────────────────────────────────
// ANIMATION & UI UTILS
// ──────────────────────────────────────────────────────────

// Ripple effect for buttons
document.addEventListener('mousedown', function(e) {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled || btn.classList.contains('loading')) return;
  const rect = btn.getBoundingClientRect();
  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - rect.left - radius}px`;
  circle.style.top = `${e.clientY - rect.top - radius}px`;
  circle.classList.add('ripple');
  const existing = btn.querySelector('.ripple');
  if (existing) existing.remove();
  btn.appendChild(circle);
  setTimeout(function() { circle.remove(); }, 600);
});

// Stagger Elements
function staggerElements(containerSelector, itemSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const items = container.querySelectorAll(itemSelector);
  items.forEach(function(item, i) {
    item.style.animation = 'none';
    void item.offsetWidth; // trigger reflow
    item.style.opacity = '0';
    item.style.animation = `fadeInUp 0.4s var(--ease-spring) ${i * 0.05}s forwards`;
  });
}

// Animate Numbers
function animateValue(obj, start, end, duration, formatCurrency = false, suffix = '') {
  if (!obj) return;
  let startTimestamp = null;
  const step = function(timestamp) {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(easeProgress * (end - start) + start);
    obj.textContent = (formatCurrency ? formatINR(current) : current) + suffix;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.textContent = (formatCurrency ? formatINR(end) : end) + suffix;
    }
  };
  window.requestAnimationFrame(step);
}

// ──────────────────────────────────────────────────────────
// SKELETON GENERATORS
// ──────────────────────────────────────────────────────────

function getTableSkeletons(cols, rows) {
  let html = '';
  for(let i=0; i<rows; i++) {
    html += `<tr>`;
    for(let j=0; j<cols; j++) {
      html += `<td><div class="skeleton" style="height:20px; width:${Math.floor(Math.random()*40)+40}%"></div></td>`;
    }
    html += `</tr>`;
  }
  return html;
}

function getListSkeletons(count) {
  let html = '';
  for(let i=0; i<count; i++) {
    html += `
      <div style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
        <div class="skeleton" style="width:40px; height:40px; border-radius:50%;"></div>
        <div style="flex:1;">
          <div class="skeleton" style="height:16px; width:70%; margin-bottom:8px;"></div>
          <div class="skeleton" style="height:12px; width:40%;"></div>
        </div>
      </div>`;
  }
  return html;
}

// ──────────────────────────────────────────────────────────
// MODAL & DRAWER CONTROLS
// ──────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('show'); }

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function closeLeadDrawer() { document.getElementById('leadDrawer').classList.remove('open'); }

// ──────────────────────────────────────────────────────────
// NOTIFICATIONS & LOADERS
// ──────────────────────────────────────────────────────────

function showToast(msg, type = 'success') { 
  const t = document.getElementById('toast'); 
  const icon = t.querySelector('.toast-icon');
  t.querySelector('.toast-msg').textContent = msg; 
  
  t.className = `toast show toast-${type}`;
  if(type === 'success') { icon.setAttribute('data-lucide', 'check-circle'); icon.style.color = '#a7f3d0'; }
  else if(type === 'error') { icon.setAttribute('data-lucide', 'alert-circle'); icon.style.color = '#fecaca'; }
  else { icon.setAttribute('data-lucide', 'info'); icon.style.color = '#fde68a'; }
  
  icon.style.display = 'block';
  lucide.createIcons();
  
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  
  setTimeout(function() { t.classList.remove('show'); }, 3500); 
}

function showSpinner() { document.getElementById('loader').classList.add('show'); }

function hideSpinner() { document.getElementById('loader').classList.remove('show'); }

// ──────────────────────────────────────────────────────────
// FORMATTERS & BADGES
// ──────────────────────────────────────────────────────────

function formatINR(num) { 
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num || 0); 
}

function getStageBadgeClass(s) {
  if (!s) return 'badge-new'; const up = s.toUpperCase();
  if (up.indexOf('NEW') > -1) return 'badge-new';
  if (up.indexOf('CONTACT') > -1 || up.indexOf('CALL') > -1) return 'badge-contacted';
  if (up.indexOf('FOLLOW') > -1) return 'badge-followup';
  if (up.indexOf('WON') > -1 || up.indexOf('CONVERT') > -1) return 'badge-won';
  if (up.indexOf('LOST') > -1) return 'badge-lost';
  return 'badge-new';
}

function getLeadTypeBadge(t) { 
  if (!t) return ''; 
  const up = t.toUpperCase(); 
  const cl = up === 'HOT' ? 'type-hot' : (up === 'WARM' ? 'type-warm' : 'type-cold'); 
  return `<span class="badge ${cl}" style="border-radius:4px; font-size:10px; padding:2px 6px;">${up}</span>`; 
}

function getStageColor(stage) {
  var colors = {'NEW':'#6B7280','CONTACTED':'#3B82F6','QUALIFIED':'#8B5CF6','NEGOTIATION':'#F59E0B','WON':'#10B981','LOST':'#EF4444'};
  return colors[stage] || '#6B7280';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  } catch(e) { return '—'; }
}
// ──────────────────────────────────────────────────────────
// LEAD SCORE COLORS
// ──────────────────────────────────────────────────────────
function getScoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 80) return '#10B981'; // Success Green
  if (s >= 50) return '#F59E0B'; // Warning Orange
  return '#EF4444'; // Danger Red
}

// ──────────────────────────────────────────────────────────
// NEXT FOLLOWUP DATE FORMATTER (date + relative label)
// ──────────────────────────────────────────────────────────
function formatFollowupDate(dateStr) {
  if (!dateStr) return { display: '<span style="color:var(--text-secondary); font-size:11px;">—</span>', plain: '—' };
  var date = new Date(String(dateStr).substring(0, 10));
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  var diffDays = Math.round((date - today) / (1000 * 60 * 60 * 24));
  var dateText = String(dateStr).substring(0, 10);
  var label = '';
  var color = 'var(--text-secondary)';
  if (diffDays < 0) {
    label = 'Overdue ' + Math.abs(diffDays) + 'd';
    color = 'var(--danger)';
  } else if (diffDays === 0) {
    label = 'Today';
    color = 'var(--warning)';
  } else if (diffDays === 1) {
    label = 'Tomorrow';
    color = 'var(--info)';
  } else {
    label = 'In ' + diffDays + 'd';
    color = 'var(--info)';
  }
 return {
    display: '<div class="followup-cell"><div style="font-size:12px;">' + dateText + '</div><div style="font-size:10px; color:' + color + '; font-weight:600;">' + label + '</div></div>',
    plain: dateText + ' (' + label + ')'
  };
}

// ──────────────────────────────────────────────────────────
// NEXT FOLLOWUP DATE FORMATTER (date + relative label)
// ──────────────────────────────────────────────────────────
function formatFollowupDate(dateStr) {
  if (!dateStr) return { display: '<span style="color:var(--text-secondary); font-size:11px;">—</span>', plain: '—' };
  var date = new Date(String(dateStr).substring(0, 10));
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  var diffDays = Math.round((date - today) / (1000 * 60 * 60 * 24));
  var dateText = String(dateStr).substring(0, 10);
  var label = '';
  var color = 'var(--text-secondary)';
  if (diffDays < 0) {
    label = 'Overdue ' + Math.abs(diffDays) + 'd';
    color = 'var(--danger)';
  } else if (diffDays === 0) {
    label = 'Today';
    color = 'var(--warning)';
  } else if (diffDays === 1) {
    label = 'Tomorrow';
    color = 'var(--info)';
  } else {
    label = 'In ' + diffDays + 'd';
    color = 'var(--info)';
  }
  return {
    display: '<div style="font-size:12px;">' + dateText + '</div><div style="font-size:10px; color:' + color + '; font-weight:600;">' + label + '</div>',
    plain: dateText + ' (' + label + ')'
  };
}

// ──────────────────────────────────────────────────────────
// XSS ESCAPING
// ──────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  var safeStr = String(str);
  return safeStr.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
}

// ──────────────────────────────────────────────────────────
// CSV EXPORT (NEW)
// ──────────────────────────────────────────────────────────
function exportToCSV(rows, filename) {
  if (!rows || rows.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  var headers = Object.keys(rows[0]);
  var csvLines = [];
  csvLines.push(headers.join(','));
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowValues = [];
    for (var j = 0; j < headers.length; j++) {
      var field = row[headers[j]];
      if (field === null || field === undefined) {
        field = '';
      } else {
        field = String(field);
      }
      
      if (field.indexOf(',') !== -1 || field.indexOf('"') !== -1 || field.indexOf('\n') !== -1) {
        field = '"' + field.replace(/"/g, '""') + '"';
      }
      rowValues.push(field);
    }
    csvLines.push(rowValues.join(','));
  }
  
  var blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var linkElem = document.createElement('a');
  linkElem.href = url;
  linkElem.download = filename || 'export.csv';
  linkElem.style.display = 'none';
  document.body.appendChild(linkElem);
  linkElem.click();
  document.body.removeChild(linkElem);
  URL.revokeObjectURL(url);
  
  showToast('Exported ' + rows.length + ' rows', 'success');
}
// ── Collapsible sidebar group toggle ────────────────────────
function toggleNavGroup(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  var group = document.getElementById('futureUpgradeGroup');
  if (!group) return;
  group.classList.toggle('open');
  try {
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  } catch (err) {}
}
window.toggleNavGroup = toggleNavGroup;

// ── Light / dark theme ──────────────────────────────────────
// index.html applies the saved/system theme before first paint;
// this handles the runtime toggle, persistence and icon swap.
// The 'bmh_theme' key is shared with the DISPATCH app so both
// products follow the same preference on the same browser.
function isDarkMode() {
  return document.documentElement.classList.contains('dark');
}

function syncThemeIcon() {
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.innerHTML = '<i data-lucide="' + (isDarkMode() ? 'sun' : 'moon') + '"></i>';
  try { if (window.lucide && lucide.createIcons) lucide.createIcons(); } catch (e) {}
}

function toggleTheme() {
  var next = !isDarkMode();
  document.documentElement.classList.toggle('dark', next);
  try { localStorage.setItem('bmh_theme', next ? 'dark' : 'light'); } catch (e) {}
  syncThemeIcon();
}

// Set the correct icon once the DOM (and lucide) are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncThemeIcon);
} else {
  syncThemeIcon();
}

window.isDarkMode = isDarkMode;
window.toggleTheme = toggleTheme;
window.syncThemeIcon = syncThemeIcon;
