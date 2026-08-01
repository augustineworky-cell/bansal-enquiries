// ============================================================
// Bansal Material House CRM — FEATURES.JS (Daily Operational Feature Modules)
// ============================================================

// ──────────────────────────────────────────────────────────
// 1. MY TASKS
// ──────────────────────────────────────────────────────────
var currentTaskFilter = 'today';
var allTaskData = { today: [], overdue: [], upcoming: [], completed: [] };

function loadMyTasks() {
  document.getElementById('taskList').innerHTML = getListSkeletons(4);
  var userName = currentUser.name;
  var userRole = currentUser.role;
  if ((userRole === 'ADMIN' || userRole === 'MANAGER') && viewAsAgent) {
    userName = viewAsAgent;
    userRole = 'AGENT';
  }
  apiCall('getMyTasks', { userName: userName, userRole: userRole, filter: currentTaskFilter }, function(data) {
    allTaskData = data;
    document.getElementById('taskCountToday').textContent = data.counts.today;
    document.getElementById('taskCountOverdue').textContent = data.counts.overdue;
    document.getElementById('taskCountUpcoming').textContent = data.counts.upcoming;
    document.getElementById('taskCountCompleted').textContent = data.counts.completed;
    var badge = document.getElementById('taskBadge');
    var totalActive = data.counts.today + data.counts.overdue;
    if (totalActive > 0) { badge.textContent = totalActive; badge.style.display = 'inline-block'; } 
    else { badge.style.display = 'none'; }
    renderTaskList();
  });
}

function switchTaskTab(filter, btn) {
  currentTaskFilter = filter;
  document.querySelectorAll('.task-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  renderTaskList();
}

function renderTaskList() {
  var tasks = allTaskData[currentTaskFilter] || [];
  var container = document.getElementById('taskList');
  if (tasks.length === 0) {
    var emptyMsgs = {
      today: { icon: '✓', msg: 'No tasks for today. Great job!' },
      overdue: { icon: '🎉', msg: 'No overdue tasks. You are on track!' },
      upcoming: { icon: '📅', msg: 'No upcoming tasks this week.' },
      completed: { icon: '✨', msg: 'No completed tasks yet.' }
    };
    var emp = emptyMsgs[currentTaskFilter];
    container.innerHTML = `
      <div class="task-empty" style="animation: fadeInUp 0.4s var(--ease-spring);">
        <div class="task-empty-icon">${emp.icon}</div>
        <div>${emp.msg}</div>
      </div>`;
    return;
  }
  
  var html = '';
  tasks.forEach(function(l, i) {
    var sn = (l.CONTACT_NAME || 'Unknown').replace(/'/g, "\\'");
    var fuDate = l.NEXT_FOLLOWUP ? String(l.NEXT_FOLLOWUP).substring(0, 16) : '';
    var cardClass = 'task-' + currentTaskFilter;
    var timeClass = currentTaskFilter === 'completed' ? 'done' : currentTaskFilter;
    var timeLabel = '';
    
    if (currentTaskFilter === 'overdue') {
      var daysOver = Math.floor((new Date() - new Date(fuDate)) / (1000*60*60*24));
      timeLabel = `⚠️ Overdue ${daysOver} day${daysOver !== 1 ? 's' : ''}`;
    } else if (currentTaskFilter === 'today') {
      timeLabel = '🔔 Due today';
    } else if (currentTaskFilter === 'upcoming') {
      timeLabel = `📅 ${fuDate.substring(0, 10)}`;
    } else {
      timeLabel = `✓ ${l.STATUS === 'WON' ? 'Won' : 'Lost'}`;
    }
    
    var checkbox = currentTaskFilter === 'completed' 
      ? `<input type="checkbox" class="task-checkbox" checked disabled>`
      : `<input type="checkbox" class="task-checkbox" onclick="event.stopPropagation(); completeTask('${l.LEAD_ID || ''}')">`;
    
    var lastContacted = l.LAST_CONTACTED ? `Last: ${String(l.LAST_CONTACTED).substring(0, 10)}` : 'Never contacted';
    
    var actionButtons = '';
    if (currentTaskFilter !== 'completed') {
      actionButtons = `
        <div class="task-mobile-actions">
          <button class="task-act-btn task-act-call" onclick="event.stopPropagation(); generatePhoneCallLink('${l.MOBILE || ''}', '${sn}', '${l.LEAD_ID || ''}', '${l.STAGE || ''}')">
            <i data-lucide="phone" style="width:18px;"></i>
            <span>Call</span>
          </button>
          <button class="task-act-btn task-act-wa" onclick="event.stopPropagation(); generateWhatsAppLink('${l.MOBILE || ''}', '${sn}')">
            <i data-lucide="message-circle" style="width:18px;"></i>
            <span>WhatsApp</span>
          </button>
          <button class="task-act-btn task-act-log" onclick="event.stopPropagation(); openFollowUpModal('${l.LEAD_ID || ''}', '${sn}', '${l.STAGE || ''}')">
            <i data-lucide="edit-3" style="width:18px;"></i>
            <span>Log</span>
          </button>
        </div>`;
    }
    
    html += `
      <div class="task-card-v2 ${cardClass}" style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.04}s both;">
        <div class="task-card-v2-header">
          ${checkbox}
          <div class="task-card-v2-info">
            <div class="task-card-v2-name" onclick="openLeadDrawer('${l.LEAD_ID || ''}')">${l.CONTACT_NAME || 'Unknown'}</div>
            <div class="task-card-v2-meta">
              <span class="task-time-label ${timeClass}">${timeLabel}</span>
            </div>
          </div>
        </div>
        <div class="task-card-v2-details">
          <div class="task-card-v2-row"><i data-lucide="phone" style="width:13px;"></i> ${l.MOBILE || 'No Phone'}</div>
          <div class="task-card-v2-row"><i data-lucide="tag" style="width:13px;"></i> ${l.CAMPAIGN || 'No campaign'} · <span class="badge ${getStageBadgeClass(l.STAGE)}" style="font-size:10px; padding:2px 6px;">${l.STAGE || 'NEW'}</span></div>
          <div class="task-card-v2-row" style="color:var(--text-secondary); font-size:11px;"><i data-lucide="clock" style="width:13px;"></i> ${lastContacted}</div>
        </div>
        ${actionButtons}
      </div>`;
  });
  container.innerHTML = html;
  lucide.createIcons();
}

function completeTask(leadId) {
  if (!confirm('Mark this task as done? This will clear the next follow-up date.')) {
    loadMyTasks(); 
    return;
  }
  apiCall('completeTask', { leadId: leadId }, function() {
    showToast('Task completed!', 'success');
    loadMyTasks();
  });
}

// ──────────────────────────────────────────────────────────
// 2. FOLLOW-UPS
// ──────────────────────────────────────────────────────────
function openFollowUpModal(leadId, leadName, currentStage) {
  document.getElementById('fuLeadId').value = leadId;
  document.getElementById('fuLeadName').textContent = `${leadName} (${leadId})`;
  document.getElementById('fuLeadStage').textContent = `Current Stage: ${currentStage}`;
  document.getElementById('fuStage').value = currentStage;
  document.getElementById('fuAction').value = 'CALL';
  document.getElementById('fuOutcome').value = 'CONNECTED';
  document.getElementById('fuNextDate').value = '';
  document.getElementById('fuNotes').value = '';
  openModal('modal-followUp');
  document.getElementById('fuHistoryTimeline').innerHTML = '<div class="skeleton" style="height:40px;"></div>';
  const qArea = document.getElementById('fuCampaignQuestionsArea'); const qGrid = document.getElementById('fuQuestionsGrid');
  qArea.style.display = 'none'; qGrid.innerHTML = '';

  apiCall('getLeadById', { leadId: leadId }, function(lead) {
    currentFuCampaign = lead ? lead.CAMPAIGN : '';
    if (currentFuCampaign) {
      apiCall('getFormsByCampaign', { campaignName: currentFuCampaign }, function(sections) {
        if (sections && sections.length > 0) {
          let html = '';
          sections.forEach(function(sec, i) {
            html += `<div style="grid-column:span 2; font-weight:600; margin-top:8px; border-bottom:1px solid var(--border); padding-bottom:4px;">${sec.sectionName || ''}</div>`;
            sec.fields.forEach(function(f, j) {
              const reqH = f.required ? ' <span style="color:var(--danger);">*</span>' : '';
              let inH = '';
              if (f.fieldType === 'ONE_LINE') inH = `<input type="text" class="form-input custom-q" data-label="${f.label || ''}">`;
              else if (f.fieldType === 'NUMBER') inH = `<input type="number" class="form-input custom-q" data-label="${f.label || ''}">`;
              else if (f.fieldType === 'DATE') inH = `<input type="date" class="form-input custom-q" data-label="${f.label || ''}">`;
              else if (f.fieldType === 'TIME') inH = `<input type="time" class="form-input custom-q" data-label="${f.label || ''}">`;
              else if (f.fieldType === 'PARAGRAPH') inH = `<textarea class="form-input custom-q" rows="2" data-label="${f.label || ''}"></textarea>`;
              else if (f.fieldType === 'DROPDOWN') {
                const opts = f.options ? f.options.split(',') : [];
                inH = `<select class="form-input custom-q" data-label="${f.label || ''}"><option value=""></option>`;
                opts.forEach(function(o) { inH += `<option value="${o.trim()}">${o.trim()}</option>`; });
                inH += `</select>`;
              } else if (f.fieldType === 'SELECT_ONE') {
                const ropts = f.options ? f.options.split(',') : [];
                inH = `<div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:6px;">`;
                ropts.forEach(function(r) { inH += `<label><input type="radio" name="cq_${i}_${j}" value="${r.trim()}" class="custom-q-radio" data-label="${f.label || ''}"> ${r.trim()}</label>`; });
                inH += `</div>`;
              }
              const colSpan = (f.fieldType === 'PARAGRAPH' || f.fieldType === 'SELECT_ONE') ? 'grid-column:span 2;' : '';
              html += `<div class="form-group" style="${colSpan}"><label>${f.label || ''}${reqH}</label>${inH}</div>`;
            });
          });
          qGrid.innerHTML = html; qArea.style.display = 'block'; lucide.createIcons();
        }
      });
    }
  });

  apiCall('getFollowUpHistory', { leadId: leadId }, function(h) {
    const histDiv = document.getElementById('fuHistoryTimeline');
    if (h.length === 0) { histDiv.innerHTML = '<div style="font-size:12px; color:var(--text-secondary);">No history.</div>'; return; }
    let hh = '';
    h.forEach(function(l, i) {
      const nH = l.NOTES ? `<div style="font-size:13px; margin-top:6px; background:var(--surface); padding:8px; border-radius:4px; border:1px solid var(--border);">${l.NOTES}</div>` : '';
      const safeLogDate = l.LOG_DATE ? String(l.LOG_DATE).substring(0, 10) : '';
      const safeLogTime = l.LOG_TIME ? String(l.LOG_TIME).substring(11, 16) : '';
      const agentLabel = (l.AGENT || 'Unknown').split('@')[0];
      const outcomeClass = l.OUTCOME === 'CONNECTED' ? 'var(--success)' : 'var(--danger)';
      
      hh += `
        <div style="display:flex; gap:12px; border-left:2px solid var(--border); padding-left:12px; position:relative; margin-left:6px; padding-bottom:12px; animation: slideInRight 0.3s var(--ease-spring) ${i*0.05}s both;">
          <div style="position:absolute; left:-7px; top:0; width:12px; height:12px; border-radius:50%; background:var(--primary);"></div>
          <div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
              ${safeLogDate} ${safeLogTime} by ${agentLabel}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge badge-new">${l.ACTION || '-'}</span>
              <span style="font-size:12px; font-weight:600; color:${outcomeClass};">${l.OUTCOME || '-'}</span>
              <i data-lucide="arrow-right" style="width:12px;"></i> 
              <span class="badge ${getStageBadgeClass(l.STAGE_AFTER)}">${l.STAGE_AFTER || '-'}</span>
            </div>
            ${nH}
          </div>
        </div>`;
    });
    histDiv.innerHTML = hh; lucide.createIcons();
  });
}

function saveFollowUp(btn) {
  const leadId = document.getElementById('fuLeadId').value;
  const data = { leadId: leadId, contactName: document.getElementById('fuLeadName').textContent.split(' (')[0], action: document.getElementById('fuAction').value, outcome: document.getElementById('fuOutcome').value, stageBefore: document.getElementById('fuLeadStage').textContent.replace('Current Stage: ', ''), stageAfter: document.getElementById('fuStage').value, nextFollowUp: document.getElementById('fuNextDate').value, notes: document.getElementById('fuNotes').value };
  const responses = {};
  document.querySelectorAll('.custom-q').forEach(function(input) { if (input.value) responses[input.getAttribute('data-label')] = input.value; });
  
  document.querySelectorAll('.custom-q-radio:checked').forEach(function(radio) { responses[radio.getAttribute('data-label')] = radio.value; });
  
  if(btn) btn.classList.add('loading');
  if (Object.keys(responses).length > 0 && currentFuCampaign) apiCall('saveFormResponse', { leadId: leadId, campaignName: currentFuCampaign, responses: responses });
  
  apiCall('logFollowUp', { data: data }, function() { 
    showToast('Follow-up Logged!'); 
    document.getElementById('fuNotes').value = ''; 
    closeModal('modal-followUp');
    
    if (document.getElementById('page-mytasks').classList.contains('active')) {
      loadMyTasks();
    } else {
      loadContacts(false); 
    }
    
    if(btn) btn.classList.remove('loading');
  }, function() { if(btn) btn.classList.remove('loading'); });
}

// ──────────────────────────────────────────────────────────
// 3. CALENDAR
// ──────────────────────────────────────────────────────────
var currentCalDate = new Date();
var allCalEvents = [];

function loadCalendar() {
  var userName = currentUser.name;
  var userRole = currentUser.role;
  if ((userRole === 'ADMIN' || userRole === 'MANAGER') && viewAsAgent) {
    userName = viewAsAgent;
    userRole = 'AGENT';
  }
  apiCall('getCalendarData', { userName: userName, userRole: userRole }, function(data) {
    allCalEvents = data.events || [];
    renderCalendar();
  });
}

function calNavigate(delta) {
  currentCalDate.setMonth(currentCalDate.getMonth() + delta);
  renderCalendar();
}

function calGoToday() {
  currentCalDate = new Date();
  renderCalendar();
}

function renderCalendar() {
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var year = currentCalDate.getFullYear();
  var month = currentCalDate.getMonth();
  document.getElementById('calMonthLabel').textContent = `${monthNames[month]} ${year}`;
  
  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);
  var startDayOfWeek = firstDay.getDay();
  var daysInMonth = lastDay.getDate();
  var prevMonthLastDay = new Date(year, month, 0).getDate();
  
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  
  var eventsByDate = {};
  allCalEvents.forEach(function(e) {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });
  
  var html = '<div class="cal-grid">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {
    html += `<div class="cal-header-cell">${d}</div>`;
  });
  
  for (var i = startDayOfWeek - 1; i >= 0; i--) {
    html += `<div class="cal-cell cal-other-month"><div class="cal-date-num">${prevMonthLastDay - i}</div></div>`;
  }
  
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var events = eventsByDate[dateStr] || [];
    var isToday = dateStr === todayStr;
    var cellClass = `cal-cell${isToday ? ' cal-today' : ''}`;
    
    html += `<div class="${cellClass}" data-date="${dateStr}" ondragover="calDragOver(event)" ondragleave="calDragLeave(event)" ondrop="calDrop(event,'${dateStr}')">`;
    html += `<div class="cal-date-num">${d}</div>`;
    
    var maxShow = 3;
    events.slice(0, maxShow).forEach(function(e) {
      var safeName = String(e.contactName || 'Unknown').replace(/'/g, "\\'");
      html += `<div class="cal-pill ${e.status || ''}" draggable="true" ondragstart="calDragStart(event,'${e.leadId || ''}')" onclick="openLeadDrawer('${e.leadId || ''}')" title="${safeName} - ${e.stage || ''}">${e.contactName || 'Unknown'}</div>`;
    });
    
    if (events.length > maxShow) {
      html += `<div class="cal-more" onclick="calShowDay('${dateStr}')">+${events.length - maxShow} more</div>`;
    }
    html += `</div>`;
  }
  
  var totalCells = startDayOfWeek + daysInMonth;
  var trailing = (7 - (totalCells % 7)) % 7;
  for (var t = 1; t <= trailing; t++) {
    html += `<div class="cal-cell cal-other-month"><div class="cal-date-num">${t}</div></div>`;
  }
  html += `</div>`;
  
  document.getElementById('calendarGrid').innerHTML = html;
  lucide.createIcons();
}

function calDragStart(e, leadId) {
  e.dataTransfer.setData('leadId', leadId);
  e.stopPropagation();
}

function calDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('cal-drag-over');
}

function calDragLeave(e) {
  e.currentTarget.classList.remove('cal-drag-over');
}

function calDrop(e, newDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('cal-drag-over');
  var leadId = e.dataTransfer.getData('leadId');
  if (!leadId) return;
  showSpinner();
  apiCall('updateLead', { leadId: leadId, updates: { NEXT_FOLLOWUP: newDate } }, function() {
    showToast(`Rescheduled to ${newDate}`);
    loadCalendar();
    hideSpinner();
  });
}

function calShowDay(dateStr) {
  var events = allCalEvents.filter(function(e) { return e.date === dateStr; });
  var msg = `${events.length} leads on ${dateStr}:\n\n`;
  events.forEach(function(e) { msg += `• ${e.contactName || 'Unknown'} (${e.mobile || '-'}) - ${e.stage || '-'}\n`; });
  alert(msg);
}

// ──────────────────────────────────────────────────────────
// 4. QUOTATIONS
// ──────────────────────────────────────────────────────────
var allQuotes = [];
var currentQuoteItems = [];

function loadQuotations() {
  document.getElementById('quotesTableBody').innerHTML = getTableSkeletons(8, 5);
  var userName = currentUser.name;
  var userRole = currentUser.role;
  if ((userRole === 'ADMIN' || userRole === 'MANAGER') && viewAsAgent) {
    userName = viewAsAgent;
    userRole = 'AGENT';
  }
  apiCall('getQuotations', { userName: userName, userRole: userRole }, function(data) {
    allQuotes = data.quotes || [];
    document.getElementById('quoteMetrics').innerHTML = `
      <div class="metric-card mc-default"><div class="metric-label">Total Quotes</div><div class="metric-num">${data.metrics.total || 0}</div></div>
      <div class="metric-card mc-warning"><div class="metric-label">Pending</div><div class="metric-num">${data.metrics.pending || 0}</div></div>
      <div class="metric-card mc-success"><div class="metric-label">Accepted</div><div class="metric-num">${data.metrics.accepted || 0}</div></div>
      <div class="metric-card mc-default" style="background:var(--primary-light);"><div class="metric-label" style="color:var(--primary);">Total Value</div><div class="metric-num" style="color:var(--primary);">${formatINR(data.metrics.totalValue || 0)}</div></div>`;
    renderQuotesTable(allQuotes);
  });
}

function renderQuotesTable(quotes) {
  var tbody = document.getElementById('quotesTableBody');
  if (!quotes || quotes.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-secondary);">No quotations yet. Click New Quote to create one.</td></tr>'; 
    return; 
  }
  var html = '';
  quotes.forEach(function(q, i) {
    var statusClass = 'badge-draft';
    if (q.STATUS === 'SENT') statusClass = 'badge-sent';
    else if (q.STATUS === 'ACCEPTED') statusClass = 'badge-accepted';
    else if (q.STATUS === 'REJECTED') statusClass = 'badge-rejected';
    else if (q.STATUS === 'EXPIRED') statusClass = 'badge-expired';
    
    html += `
      <tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.03}s both;">
        <td style="font-size:12px; color:var(--text-secondary); font-weight:600;">${q.QUOTE_ID || '-'}</td>
        <td style="font-size:12px;">${q.QUOTE_DATE ? String(q.QUOTE_DATE).substring(0, 10) : '-'}</td>
        <td>
          <div style="font-weight:600;">${q.CUSTOMER_NAME || 'Unknown'}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${q.CUSTOMER_MOBILE || '-'}</div>
        </td>
        <td>${q.ITEM_COUNT || 0} items</td>
        <td style="font-weight:600; text-align:right;">${formatINR(q.GRAND_TOTAL || 0)}</td>
        <td><span class="badge ${statusClass}">${q.STATUS || '-'}</span></td>
        <td style="font-size:12px;">${q.CREATED_BY || '-'}</td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="icon-btn" title="Edit" onclick="openEditQuoteModal('${q.QUOTE_ID || ''}')"><i data-lucide="edit-2"></i></button>
            <button class="icon-btn wa-btn" title="Send WhatsApp" onclick="sendQuoteWhatsApp('${q.QUOTE_ID || ''}')"><i data-lucide="message-circle"></i></button>
            <button class="icon-btn" title="Delete" style="color:var(--danger);" onclick="confirmDeleteQuote('${q.QUOTE_ID || ''}')"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>`;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

function openCreateQuoteModal() {
  document.getElementById('qEditId').value = '';
  document.getElementById('quoteModalTitle').textContent = 'New Quotation';
  document.getElementById('quoteIdDisplay').textContent = 'Auto-generated on save';
  document.getElementById('qName').value = '';
  document.getElementById('qMobile').value = '';
  document.getElementById('qEmail').value = '';
  document.getElementById('qCompany').value = '';
  document.getElementById('qLeadId').value = '';
  document.getElementById('qValidUntil').value = '';
  document.getElementById('qNotes').value = '';
  document.getElementById('qDiscount').value = '0';
  document.getElementById('qGstPercent').value = '18';
  currentQuoteItems = [];
  addQuoteLineItem();
  populateLeadDropdownForQuote();
  openModal('modal-quote');
}

function openEditQuoteModal(quoteId) {
  showSpinner();
  apiCall('getQuoteById', { quoteId: quoteId }, function(q) {
    hideSpinner();
    if (!q || q.success === false) return;
    document.getElementById('qEditId').value = q.QUOTE_ID || '';
    document.getElementById('quoteModalTitle').textContent = 'Edit Quotation';
    document.getElementById('quoteIdDisplay').textContent = q.QUOTE_ID || '';
    document.getElementById('qName').value = q.CUSTOMER_NAME || '';
    document.getElementById('qMobile').value = q.CUSTOMER_MOBILE || '';
    document.getElementById('qEmail').value = q.CUSTOMER_EMAIL || '';
    document.getElementById('qCompany').value = q.CUSTOMER_COMPANY || '';
    document.getElementById('qValidUntil').value = q.VALID_UNTIL ? String(q.VALID_UNTIL).substring(0, 10) : '';
    document.getElementById('qNotes').value = q.NOTES || '';
    document.getElementById('qDiscount').value = q.DISCOUNT || 0;
    document.getElementById('qGstPercent').value = q.GST_PERCENT || 18;
    currentQuoteItems = (q.items || []).map(function(it) {
      return { itemName: it.ITEM_NAME, itemSku: it.ITEM_SKU, quantity: it.QUANTITY, unit: it.UNIT, rate: it.RATE, discountPercent: it.DISCOUNT_PERCENT };
    });
    if (currentQuoteItems.length === 0) currentQuoteItems = [{ itemName: '', quantity: 1, unit: 'PCS', rate: 0, discountPercent: 0 }];
    renderQuoteItems();
    populateLeadDropdownForQuote(q.LEAD_ID);
    openModal('modal-quote');
  });
}

function addQuoteLineItem() {
  currentQuoteItems.push({ itemName: '', quantity: 1, unit: 'PCS', rate: 0, discountPercent: 0 });
  renderQuoteItems();
}

function updateQuoteItem(idx, field, value) {
  if (field === 'quantity' || field === 'rate' || field === 'discountPercent') value = Number(value) || 0;
  currentQuoteItems[idx][field] = value;
  calculateQuoteTotals();
}

function calculateQuoteTotals() {
  var subtotal = 0;
  currentQuoteItems.forEach(function(it) {
    var amt = ((Number(it.quantity)||0) * (Number(it.rate)||0)) * (1 - (Number(it.discountPercent)||0)/100);
    subtotal += amt;
  });
  var discount = Number(document.getElementById('qDiscount').value) || 0;
  var gstPct = Number(document.getElementById('qGstPercent').value) || 0;
  var afterDisc = subtotal - discount;
  var gstAmt = afterDisc * gstPct / 100;
  var grandTotal = afterDisc + gstAmt;
  document.getElementById('qSubtotal').textContent = formatINR(subtotal);
  document.getElementById('qGstAmount').textContent = formatINR(gstAmt);
  document.getElementById('qGrandTotal').textContent = formatINR(grandTotal);
}

function saveQuote(btn) {
  var editId = document.getElementById('qEditId').value;
  var data = {
    customerName: document.getElementById('qName').value,
    customerMobile: document.getElementById('qMobile').value,
    customerEmail: document.getElementById('qEmail').value,
    customerCompany: document.getElementById('qCompany').value,
    leadId: document.getElementById('qLeadId').value,
    validUntil: document.getElementById('qValidUntil').value,
    notes: document.getElementById('qNotes').value,
    discount: Number(document.getElementById('qDiscount').value) || 0,
    gstPercent: Number(document.getElementById('qGstPercent').value) || 18,
    items: currentQuoteItems.filter(function(it) { return it.itemName && Number(it.quantity) > 0; }),
    createdBy: currentUser.name
  };
  if (!data.customerName || !data.customerMobile) { showToast('Customer name and mobile required', 'error'); return; }
  if (data.items.length === 0) { showToast('Add at least one item', 'error'); return; }
  if(btn) btn.classList.add('loading');
  var action = editId ? 'updateQuote' : 'addQuote';
  var params = editId ? { quoteId: editId, quoteData: data } : { quoteData: data };
  apiCall(action, params, function(res) {
    showToast(editId ? 'Quote updated!' : 'Quote created: ' + res.quoteId);
    closeModal('modal-quote');
    loadQuotations();
    if(btn) btn.classList.remove('loading');
  }, function() { if(btn) btn.classList.remove('loading'); });
}

function sendQuoteWhatsApp(quoteId) {
  apiCall('generateQuoteWhatsAppText', { quoteId: quoteId }, function(res) {
    if (!res.success) { showToast('Could not generate text', 'error'); return; }
    var cl = String(res.mobile).replace(/\D/g, '');
    if (cl.length > 10 && cl.indexOf('91') === 0) cl = cl.substring(2);
    var url = 'https://wa.me/91' + cl + '?text=' + encodeURIComponent(res.text);
    window.open(url, '_blank');
    apiCall('updateQuoteStatus', { quoteId: quoteId, newStatus: 'SENT' }, function() { loadQuotations(); });
  });
}

function confirmDeleteQuote(quoteId) {
  if (!confirm('Delete quote ' + quoteId + '? This cannot be undone.')) return;
  showSpinner();
  apiCall('deleteQuote', { quoteId: quoteId }, function() {
    hideSpinner();
    showToast('Quote deleted');
    loadQuotations();
  });
}

function filterQuotes() {
  var q = document.getElementById('quoteSearch').value.toLowerCase();
  if (!q) { renderQuotesTable(allQuotes); return; }
  var filtered = allQuotes.filter(function(qt) {
    return String(qt.QUOTE_ID || '').toLowerCase().indexOf(q) > -1 ||
           String(qt.CUSTOMER_NAME || '').toLowerCase().indexOf(q) > -1 ||
           String(qt.CUSTOMER_MOBILE || '').indexOf(q) > -1;
  });
  renderQuotesTable(filtered);
}

// ──────────────────────────────────────────────────────────
// 5. DOCUMENTS
// ──────────────────────────────────────────────────────────
function switchDocType(type, btn) {
  currentDocType = type;
  document.querySelectorAll('.doc-type-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('docLinkSection').style.display = type === 'link' ? 'block' : 'none';
  document.getElementById('docUploadSection').style.display = type === 'upload' ? 'block' : 'none';
}

function openAddDocModal() {
  if (!currentDrawerLeadId) { showToast('Open a lead first', 'error'); return; }
  document.getElementById('docName').value = '';
  document.getElementById('docCategory').value = 'MOCKUP';
  document.getElementById('docUrl').value = '';
  document.getElementById('docFile').value = '';
  document.getElementById('docNotes').value = '';
  document.getElementById('docUploadPreview').innerHTML = '';
  currentDocType = 'link';
  document.querySelectorAll('.doc-type-tab').forEach(function(t, i) { t.classList.toggle('active', i === 0); });
  document.getElementById('docLinkSection').style.display = 'block';
  document.getElementById('docUploadSection').style.display = 'none';
  openModal('modal-addDoc');
}

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function saveLeadDocument(btn) {
  var docName = document.getElementById('docName').value;
  var docCategory = document.getElementById('docCategory').value;
  var notes = document.getElementById('docNotes').value;
  
  if (!docName) { showToast('Document name required', 'error'); return; }
  
  if (currentDocType === 'link') {
    var driveUrl = document.getElementById('docUrl').value;
    if (!driveUrl || driveUrl.indexOf('http') !== 0) { showToast('Valid URL required', 'error'); return; }
    if(btn) btn.classList.add('loading');
    apiCall('addLeadDocumentLink', { 
      data: {
        leadId: currentDrawerLeadId, docName: docName, docCategory: docCategory,
        driveUrl: driveUrl, notes: notes, uploadedBy: currentUser.name
      }
    }, function() {
      showToast('Document added!');
      closeModal('modal-addDoc');
      loadLeadDocuments(currentDrawerLeadId);
      if(btn) btn.classList.remove('loading');
    }, function() { if(btn) btn.classList.remove('loading'); });
  } else {
var fileInput = document.getElementById('docFile');
    var file = fileInput.files[0];
    if (!file) { showToast('Select a file', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('File too large (max 25MB)', 'error'); return; }
    
    document.getElementById('docUploadPreview').innerHTML = `<div class="doc-upload-progress">Uploading ${file.name}...</div>`;
    if(btn) btn.classList.add('loading');
    
fileToBase64(file).then(function(base64) {
      apiCall('uploadLeadDocument', {
        data: {
          leadId: currentDrawerLeadId, docName: docName, docCategory: docCategory,
          fileName: file.name, fileBase64: base64, mimeType: file.type,
          notes: notes, uploadedBy: currentUser.name
        }
      }, function(res) {
        if (res && res.success) {
          showToast('File uploaded!');
          closeModal('modal-addDoc');
          loadLeadDocuments(currentDrawerLeadId);
        } else {
          showToast('Upload failed: ' + (res && res.error ? res.error : 'unknown error'), 'error');
          document.getElementById('docUploadPreview').innerHTML = '';
        }
        if(btn) btn.classList.remove('loading');
      }, function(err) { 
        showToast('Upload failed: ' + err, 'error');
        document.getElementById('docUploadPreview').innerHTML = '';
        if(btn) btn.classList.remove('loading');
      });
    });
  }
}

function loadLeadDocuments(leadId) {
  apiCall('getLeadDocuments', { leadId: leadId }, function(docs) {
    var container = document.getElementById('drawDocuments');
    document.getElementById('drawDocCount').textContent = docs.length;
    if (!docs || docs.length === 0) {
      container.innerHTML = '<div style="font-size:13px; color:var(--text-secondary); padding:8px;">No documents yet.</div>';
      return;
    }
    var html = '';
    docs.forEach(function(d, i) {
      var iconClass = `doc-icon-${String(d.DOC_CATEGORY || 'other').toLowerCase()}`;
      var iconName = 'file-text';
      if (d.DOC_CATEGORY === 'LOGO') iconName = 'image';
      else if (d.DOC_CATEGORY === 'MOCKUP') iconName = 'layers';
      else if (d.DOC_CATEGORY === 'PO') iconName = 'file-check';
      else if (d.DOC_CATEGORY === 'INVOICE') iconName = 'receipt';
      else if (d.DOC_CATEGORY === 'DESIGN') iconName = 'pen-tool';
      
      var badgeClass = d.UPLOAD_TYPE === 'UPLOAD' ? 'upload' : 'link';
      var badgeText = d.UPLOAD_TYPE === 'UPLOAD' ? 'FILE' : 'LINK';
      var sizeStr = d.FILE_SIZE && d.UPLOAD_TYPE === 'UPLOAD' ? ` · ${(Number(d.FILE_SIZE) / 1024).toFixed(0)}KB` : '';
      
      html += `
        <div class="doc-card" style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
          <div class="doc-icon ${iconClass}"><i data-lucide="${iconName}" style="width:20px;"></i></div>
          <div class="doc-info">
            <div class="doc-name">${d.DOC_NAME || '-'} <span class="doc-upload-badge ${badgeClass}">${badgeText}</span></div>
            <div class="doc-meta">${d.DOC_CATEGORY || '-'} · ${d.UPLOADED_AT ? String(d.UPLOADED_AT).substring(0, 10) : '-'} · ${d.UPLOADED_BY || ''}${sizeStr}</div>
          </div>
          <div class="doc-actions">
            <button class="icon-btn" title="Open" onclick="window.open('${d.DRIVE_URL || ''}', '_blank')"><i data-lucide="external-link" style="width:16px;"></i></button>
            <button class="icon-btn" title="Delete" style="color:var(--danger);" onclick="confirmDeleteDoc('${d.DOC_ID || ''}')"><i data-lucide="trash-2" style="width:16px;"></i></button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
    lucide.createIcons();
  });
}

function confirmDeleteDoc(docId) {
  if (!confirm('Delete this document? Uploaded files will be moved to trash in Drive.')) return;
  apiCall('deleteLeadDocument', { docId: docId }, function() {
    showToast('Document removed');
    loadLeadDocuments(currentDrawerLeadId);
  });
}

// ──────────────────────────────────────────────────────────
// 6. CALLING FEATURES
// ──────────────────────────────────────────────────────────
var pendingCallLead = null;
var callStartTime = null;

function generatePhoneCallLink(mobile, name, leadId, stage) {
  if (!mobile) { showToast('No phone number', 'error'); return; }
  
  var cleanMobile = String(mobile).replace(/\D/g, '');
  if (cleanMobile.length > 10 && cleanMobile.indexOf('91') === 0) {
    cleanMobile = cleanMobile.substring(2);
  }
  var fullNumber = '+91' + cleanMobile;
  
  pendingCallLead = {
    leadId: leadId,
    name: name,
    mobile: mobile,
    stage: stage,
    startTime: new Date()
  };
  callStartTime = Date.now();
  
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    window.location.href = 'tel:' + fullNumber;
    setTimeout(function() {
      if (pendingCallLead) {
        openPostCallModal();
      }
    }, 3000);
  } else {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullNumber).catch(function(){});
    }
    var confirmed = confirm(`Call ${name} at ${fullNumber}?\n\nNumber copied to clipboard.\nAfter call, click OK to log it.`);
    if (confirmed) {
      openPostCallModal();
    } else {
      pendingCallLead = null;
    }
  }
  
  apiCall('logUserAction', { 
    eventName: 'CALL_INITIATED',
    leadId: leadId
  });
}

function generateWhatsAppLink(mobile, name) { 
  if (!mobile) return; 
  let cl = String(mobile).replace(/\D/g, ''); 
  if (cl.length > 10 && cl.indexOf('91') === 0) cl = cl.substring(2); 
  const msg = 'Hi ' + name + ', this is ' + currentUser.name + ' from Bansal Material House.'; 
  window.open('https://wa.me/91' + cl + '?text=' + encodeURIComponent(msg), '_blank'); 
}

function openPostCallModal() {
  if (!pendingCallLead) return;
  
  var callDuration = callStartTime ? Math.round((Date.now() - callStartTime) / 1000) : 0;
  document.getElementById('pcmLeadName').textContent = pendingCallLead.name || 'Unknown';
  document.getElementById('pcmLeadMobile').textContent = pendingCallLead.mobile || '-';
  document.getElementById('pcmDuration').textContent = `${callDuration} seconds`;
  
  openModal('modal-postCall');
}

function handleCallReturn(connected) {
  closeModal('modal-postCall');
  
  if (!pendingCallLead) return;
  
  if (connected) {
    openFollowUpModal(pendingCallLead.leadId, pendingCallLead.name, pendingCallLead.stage);
    setTimeout(function() {
      var outcomeEl = document.getElementById('fuOutcome');
      if (outcomeEl) outcomeEl.value = 'CONNECTED';
      var actionEl = document.getElementById('fuAction');
      if (actionEl) actionEl.value = 'CALL';
    }, 200);
  } else {
    logCallAttempt(pendingCallLead.leadId, false);
  }
}

function logCallAttempt(leadId, connected) {
  if (!leadId || !pendingCallLead) return;
  
  var data = {
    leadId: leadId,
    contactName: pendingCallLead.name,
    action: 'CALL',
    outcome: connected ? 'CONNECTED' : 'NOT_CONNECTED',
    stageBefore: pendingCallLead.stage,
    stageAfter: pendingCallLead.stage,
    nextFollowUp: '',
    notes: connected ? 'Quick log - agent will add notes' : 'Call not connected'
  };
  
  apiCall('logFollowUp', { data: data }, function() {
    showToast(connected ? 'Call logged' : 'Marked as not connected');
    pendingCallLead = null;
    callStartTime = null;
    
    if (document.getElementById('page-mytasks').classList.contains('active')) {
      loadMyTasks();
    } else if (document.getElementById('page-contacts').classList.contains('active')) {
      loadContacts(false);
    }
  });
}

function skipPostCallLog() {
  closeModal('modal-postCall');
  pendingCallLead = null;
  callStartTime = null;
}

// ──────────────────────────────────────────────────────────
// 7. REAL ORDERS LOGIC
// ──────────────────────────────────────────────────────────
function loadOrders() {
  const container = document.getElementById('page-orders');
  
  // 1. Create the layout
  container.innerHTML = `
    <div id="orderMetrics" class="metric-container" style="display:flex; gap:16px; margin-bottom:24px;">
       <div class="skeleton" style="flex:1; height:100px;"></div>
       <div class="skeleton" style="flex:1; height:100px;"></div>
       <div class="skeleton" style="flex:1; height:100px;"></div>
       <div class="skeleton" style="flex:1; height:100px;"></div>
    </div>
    <div class="card" style="overflow-x: auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Sales Person</th>
            <th>Progress</th>
            <th>Status</th>
            <th>Tracking</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="ordersTableBody"></tbody>
      </table>
    </div>`;

  // 2. Fetch data
  apiCall('getOrders', {}, function(response) {
    // Unwrap: api.js returns { success, orders, metrics }
    var orders = (response && response.orders) ? response.orders : [];
    var metrics = (response && response.metrics) ? response.metrics : { total: 0, active: 0, delayed: 0, done: 0 };

    // 3. Render metrics (using what api.js already calculated)
    document.getElementById('orderMetrics').innerHTML = `
      <div class="metric-card" style="flex:1; border-left:4px solid var(--primary); padding:20px; background:var(--surface); border-radius:12px;">
        <div style="font-size:12px; color:var(--text-secondary);">Total Orders</div>
        <div style="font-size:24px; font-weight:700;">${metrics.total}</div>
      </div>
      <div class="metric-card" style="flex:1; border-left:4px solid var(--warning); padding:20px; background:var(--surface); border-radius:12px;">
        <div style="font-size:12px; color:var(--text-secondary);">Active</div>
        <div style="font-size:24px; font-weight:700;">${metrics.active}</div>
      </div>
      <div class="metric-card" style="flex:1; border-left:4px solid var(--danger); padding:20px; background:var(--surface); border-radius:12px;">
        <div style="font-size:12px; color:var(--text-secondary);">Delayed</div>
        <div style="font-size:24px; font-weight:700;">${metrics.delayed}</div>
      </div>
      <div class="metric-card" style="flex:1; border-left:4px solid var(--success); padding:20px; background:var(--surface); border-radius:12px;">
        <div style="font-size:12px; color:var(--text-secondary);">Completed</div>
        <div style="font-size:24px; font-weight:700;">${metrics.done}</div>
      </div>
    `;

    // 4. Render table
    let html = '';
    if (orders.length === 0) {
      html = '<tr><td colspan="8" style="text-align:center; padding:40px;">No orders found.</td></tr>';
    } else {
      orders.forEach(o => {
        const dateDisplay = o.timestamp ? new Date(o.timestamp).toLocaleDateString() : 'N/A';
        const statusBadge = o.overallStatus === 'done' ? 'badge-won' 
                          : o.overallStatus === 'delayed' ? 'badge-lost' 
                          : 'badge-followup';
        const statusLabel = o.overallStatus === 'done' ? 'Completed'
                          : o.overallStatus === 'delayed' ? 'Delayed'
                          : 'Active';
        const progress = `${o.doneSteps}/7 steps`;
        const tracking = o.steps && o.steps[6] ? (o.steps[6].status || 'No tracking') : 'No tracking';

        html += `
          <tr>
            <td><b>${o.orderId || '-'}</b></td>
            <td>${dateDisplay}</td>
            <td>${o.customerName || '-'}</td>
            <td>${o.salesPerson || '-'}</td>
            <td>${progress}</td>
            <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
            <td style="font-size:12px; color:var(--text-secondary); max-width:150px; text-overflow:ellipsis; overflow:hidden;">${tracking}</td>
            <td><button class="icon-btn"><i data-lucide="eye"></i></button></td>
          </tr>`;
      });
    }
    document.getElementById('ordersTableBody').innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}