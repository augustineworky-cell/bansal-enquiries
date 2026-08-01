// 1. Dashboard logic
async function loadDashboard() {
  try {
    // Show loading state on KPI cards
    var kpiElements = document.querySelectorAll('[id^="kpi-"], [id^="metric-"]');
    kpiElements.forEach(function(el) { if (el) el.textContent = '...'; });
    
// Determine whose data to show
    // - ADMIN/MANAGER: see everything (or filtered by agent if viewAsAgent is set)
    // - AGENT: only their own leads (assigned_to = their name)
    var dashAgent = null;
    if (typeof viewAsAgent !== 'undefined' && viewAsAgent) {
      dashAgent = viewAsAgent;  // admin viewing as a specific agent
    } else if (currentUser && currentUser.role === 'AGENT') {
      dashAgent = currentUser.name;
    }
    
    // 1. Build queries with optional agent filter
    var leadsQ = supabaseClient.from('leads').select('*');
    var logsQ = supabaseClient.from('followup_log').select('*');
    if (dashAgent) {
      leadsQ = leadsQ.ilike('assigned_to', dashAgent);
      logsQ = logsQ.ilike('agent', dashAgent);
    }
    
    var [leadsRes, campsRes, logsRes] = await Promise.all([
      leadsQ,
      supabaseClient.from('campaigns').select('*').eq('status', 'ACTIVE').limit(5),
      logsQ
    ]);
    
    var leads = leadsRes.data || [];
    var campaigns = campsRes.data || [];
    var logs = logsRes.data || [];
    
    var today = new Date().toISOString().split('T')[0];
    
    // --- KPI Calculations ---
    var analysis = { total: leads.length, open: 0, inProgress: 0, won: 0, lost: 0 };
    var sourcesCount = {};
    var sourcesWon = {};
    var todaysFollowUps = [];
    var overdueCount = 0;
    
    leads.forEach(function(lead) {
      if (lead.status === 'WON') { 
        analysis.won++; 
        sourcesWon[lead.lead_source || 'OTHER'] = (sourcesWon[lead.lead_source || 'OTHER'] || 0) + 1; 
      }
      else if (lead.status === 'LOST') analysis.lost++;
      else if (lead.stage === 'NEW') analysis.open++;
      else analysis.inProgress++;
      
      var src = lead.lead_source || 'OTHER';
      sourcesCount[src] = (sourcesCount[src] || 0) + 1;
      
      if (lead.status === 'OPEN' && lead.next_followup) {
        var fuDate = String(lead.next_followup).substring(0, 10);
        if (fuDate === today) todaysFollowUps.push(lead);
        else if (fuDate < today) overdueCount++;
      }
    });
    
    // --- 2. Update Top KPI Cards ---
    var elTotal = document.getElementById('metric-total') || document.getElementById('kpi-total');
    var elInProgress = document.getElementById('metric-inprog') || document.getElementById('kpi-inprogress');
    var elWon = document.getElementById('metric-won') || document.getElementById('kpi-won');
    var elLost = document.getElementById('metric-lost') || document.getElementById('kpi-lost');
    var elOverdue = document.getElementById('metric-overdue') || document.getElementById('kpi-overdue');
    
    if (elTotal) elTotal.textContent = analysis.total.toLocaleString();
    if (elInProgress) elInProgress.textContent = analysis.inProgress.toLocaleString();
    if (elWon) elWon.textContent = analysis.won.toLocaleString();
    if (elLost) elLost.textContent = analysis.lost.toLocaleString();
    if (elOverdue) elOverdue.textContent = overdueCount.toLocaleString();

    var todayBadge = document.getElementById('todayFuCount');
    if (todayBadge) todayBadge.textContent = todaysFollowUps.length;

    // --- 3. Render Today's Follow-ups Table ---
    var tbodyFu = document.getElementById('todayFuTableBody');
    if (tbodyFu) {
      if (todaysFollowUps.length === 0) {
        tbodyFu.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#9CA3AF;">No follow-ups for today</td></tr>';
      } else {
        var fuHtml = '';
        todaysFollowUps.slice(0, 10).forEach(function(l) {
           var safeName = String(l.contact_name || '').replace(/'/g, "\\'");
          fuHtml += `<tr style="cursor:pointer;" onclick="openLeadDrawer('${l.lead_id}')">
             <td style="font-weight:600;">${l.contact_name || '-'}</td>
             <td>${l.mobile || '-'}</td>
             <td>${l.campaign || '-'}</td>
             <td>${l.assigned_to || '-'}</td>
             <td><span class="badge ${getStageBadgeClass(l.stage)}">${l.stage || 'NEW'}</span></td>
             <td>${formatFollowupDate(l.next_followup).display}</td>
             <td><button class="icon-btn wa-btn" onclick="event.stopPropagation(); generateWhatsAppLink('${l.mobile}', '${safeName}')"><i data-lucide="message-circle" style="width:16px;"></i></button></td>
           </tr>`;
        });
        tbodyFu.innerHTML = fuHtml;
      }
    }
    
    // --- 4. Render Pinned Campaigns ---
    var campDiv = document.getElementById('pinnedCampaignsList');
    if (campDiv) {
       if (campaigns.length === 0) {
          campDiv.innerHTML = '<div style="color:var(--text-secondary); padding:16px; font-size:13px;">No active campaigns.</div>';
       } else {
          var campHtml = '';
          campaigns.forEach(function(c) {
             campHtml += `<div class="camp-item">
                <div class="camp-avatar" style="background:var(--primary);">${String(c.campaign_name).charAt(0).toUpperCase()}</div>
                <div style="flex:1;">
                   <div style="font-weight:600; font-size:14px;">${c.campaign_name}</div>
                   <div style="font-size:12px; color:var(--text-secondary);">Leads: ${c.total_leads || 0} | Conv: ${c.converted || 0}</div>
                </div>
             </div>`;
          });
          campDiv.innerHTML = campHtml;
       }
    }

    // --- 5. Lead Source Summary ---
    var sourceArr = Object.keys(sourcesCount).map(k => ({ source: k, total: sourcesCount[k], won: sourcesWon[k] || 0 }));
    sourceArr.sort((a, b) => b.total - a.total);
    
    var dTotal = document.getElementById('donutTotal');
    if (dTotal) dTotal.textContent = analysis.total;
    
    var sBody = document.getElementById('sourceAnalyticsBody');
    var sLegend = document.getElementById('sourceLegend');
    if (sBody && sLegend) {
       var tblHtml = ''; var legHtml = '';
       var colors = ['#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280'];
       sourceArr.slice(0, 6).forEach(function(s, i) {
          var c = colors[i % colors.length];
          var rate = s.total > 0 ? Math.round((s.won / s.total) * 100) : 0;
          tblHtml += `<tr><td>${s.source}</td><td>${s.total}</td><td>${s.won}</td><td style="color:var(--success); font-weight:600;">${rate}%</td></tr>`;
          legHtml += `<div class="legend-item"><div style="display:flex; align-items:center;"><div class="legend-color" style="background:${c};"></div>${s.source}</div><b>${s.total}</b></div>`;
       });
       sBody.innerHTML = tblHtml;
       sLegend.innerHTML = legHtml;
    }

    // --- 6. Calls Analysis ---
    var att = 0, conn = 0;
    logs.forEach(function(l) {
       if (l.action === 'CALL') {
          att++;
          if (l.outcome === 'CONNECTED') conn++;
       }
    });
    
    var elAtt = document.getElementById('call-attempted');
    var elConn = document.getElementById('call-connected');
    var elRate = document.getElementById('call-rate');
    
    if (elAtt) elAtt.textContent = att;
    if (elConn) elConn.textContent = conn;
    if (elRate) elRate.textContent = (att > 0 ? Math.round((conn/att)*100) : 0) + '%';

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  } catch (err) {
    console.error('❌ Dashboard load failed:', err);
  }
}

function setDashboardFilter(period, btn) {
  dashboardDateFilter = period;
  document.querySelectorAll('.filter-pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  loadDashboard();
}

// 2. Campaigns logic
function loadCampaigns() {
  document.getElementById('campaignsGrid').innerHTML = `<div class="camp-col">${getListSkeletons(3)}</div>`;
  apiCall('getCampaigns', {}, function(camps) {
    const grid = document.getElementById('campaignsGrid'); 
    const grouped = {};
    camps.forEach(function(c) { if (!grouped[c.PIPELINE]) grouped[c.PIPELINE] = []; grouped[c.PIPELINE].push(c); });
    let html = ''; 
    Object.keys(grouped).forEach(function(pipeName, j) {
      let cards = '';
      grouped[pipeName].forEach(function(pc, k) {
        const safeCampName = (pc.CAMPAIGN_NAME || 'Unnamed').replace(/'/g, "\\'");
        const retryInfo = (pc.RETRY_MAX || pc.RETRY_INTERVAL_HRS) ? `<div style="font-size:10px; color:var(--text-secondary); margin-bottom:8px;">Retry: ${pc.RETRY_MAX || 'default'} attempts / ${pc.RETRY_INTERVAL_HRS || 'default'}hrs</div>` : '';
        
        cards += `
          <div class="camp-card" style="animation: fadeInUp 0.4s var(--ease-spring) ${k*0.05}s both;">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <h4 style="font-size:15px; font-weight:600; cursor:pointer; transition:color 0.2s;" onclick="openCampaignAnalytics('${safeCampName}')" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text)'">${pc.CAMPAIGN_NAME || 'Unnamed'}</h4>
              <span class="badge ${pc.STATUS === 'ACTIVE' ? 'badge-won' : (pc.STATUS === 'PAUSED' ? 'badge-followup' : 'badge')}">${pc.STATUS || 'UNKNOWN'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--text-secondary); margin-bottom:16px;">
              <div><i data-lucide="users" style="width:14px; vertical-align:middle;"></i> ${pc.AGENTS || 'No agents'}</div>
              <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="toggleCampStatus('${pc.CAMPAIGN_ID || ''}', this)">${pc.STATUS === 'ACTIVE' ? 'Pause' : 'Resume'}</button>
            </div>
            ${retryInfo}
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:12px;">
              <div style="text-align:center;">
                <div style="font-size:12px; color:var(--text-secondary);">Total</div>
                <div style="font-weight:600;">${pc.TOTAL_LEADS || 0}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:12px; color:var(--text-secondary);">Converted</div>
                <div style="font-weight:600; color:var(--success);">${pc.CONVERTED || 0}</div>
              </div>
            </div>
          </div>`;
      });
      html += `
        <div class="camp-col" style="animation: slideInRight 0.4s var(--ease-spring) ${j*0.1}s both;">
          <div class="camp-col-header">${pipeName} <span class="badge badge-new">${grouped[pipeName].length}</span></div>
          ${cards}
        </div>`;
    });
    grid.innerHTML = html || '<div style="padding:24px; color:var(--text-secondary);">No campaigns.</div>';
    lucide.createIcons();
  });
}

function toggleCampStatus(campaignId, btn) {
  if(btn) btn.classList.add('loading');
  apiCall('toggleCampaignStatus', { campaignId: campaignId }, function(res) { 
    showToast('Campaign ' + res.newStatus); 
    loadCampaigns(); 
  }, function() { if(btn) btn.classList.remove('loading'); });
}

function saveCampaign(btn) {
  var checkedAgents = [];
  document.querySelectorAll('.campaign-agent-cb:checked').forEach(function(cb) { checkedAgents.push(cb.value); });
  
  const data = { 
    name: document.getElementById('cName').value, 
    pipeline: document.getElementById('cPipeline').value, 
    manager: document.getElementById('cManager').value, 
    distribution: document.getElementById('cDist').value, 
    agents: checkedAgents.join(', '), 
    retryMax: document.getElementById('cRetryMax').value, 
    retryInterval: document.getElementById('cRetryInterval').value 
  };
  
  if (!data.name) { 
    document.getElementById('cName').classList.add('error-shake'); 
    setTimeout(function(){ document.getElementById('cName').classList.remove('error-shake'); },400); 
    showToast('Campaign name required', 'error');
    return; 
  }
  if (!data.pipeline) { 
    document.getElementById('cPipeline').classList.add('error-shake'); 
    setTimeout(function(){ document.getElementById('cPipeline').classList.remove('error-shake'); },400); 
    showToast('Pipeline required', 'error');
    return; 
  }
  if(btn) btn.classList.add('loading');
  apiCall('addCampaign', { data: data }, function() { 
    showToast('Campaign created!'); 
    closeModal('modal-createCampaign');
    loadCampaigns(); 
    if(btn) btn.classList.remove('loading');
  }, function() { if(btn) btn.classList.remove('loading'); });
}

function openCampaignAnalytics(campaignName) {
  document.getElementById('campaignAnalyticsPanel').style.display = 'block';
  document.getElementById('campAnalyticsMetrics').innerHTML = `<div class="skeleton" style="height:80px;"></div><div class="skeleton" style="height:80px;"></div>`;
  apiCall('getCampaignAnalytics', { campaignName: campaignName }, function(data) {
    document.getElementById('campAnalyticsTitle').textContent = `Analytics: ${campaignName || 'Unknown'}`;
    const connPct = data.callStats.total > 0 ? Math.round((data.callStats.connected / data.callStats.total) * 100) : 0;
    
    document.getElementById('campAnalyticsMetrics').innerHTML = `
      <div class="metric-card mc-default"><div class="metric-label">Total Leads</div><div class="metric-num">${data.totalLeads || 0}</div></div>
      <div class="metric-card mc-success"><div class="metric-label">Won</div><div class="metric-num">${data.statusCounts.won || 0}</div></div>
      <div class="metric-card mc-danger"><div class="metric-label">Lost</div><div class="metric-num">${data.statusCounts.lost || 0}</div></div>
      <div class="metric-card mc-warning"><div class="metric-label">Pipeline Value</div><div class="metric-num">${formatINR(data.totalValue || 0)}</div></div>
      <div class="metric-card mc-default"><div class="metric-label">Call Connect %</div><div class="metric-num">${connPct}%</div></div>`;

    const stageKeys = Object.keys(data.stageCounts || {}); 
    let maxCount = 1;
    stageKeys.forEach(function(k) { if(data.stageCounts[k] > maxCount) maxCount = data.stageCounts[k]; });
    const stageColors = { NEW: '#6B7280', CONTACTED: '#3B82F6', FOLLOW_UP: '#F59E0B', DEMO_SCHEDULED: '#8B5CF6', DEMO_DONE: '#10B981', NEGOTIATION: '#EC4899', CONVERTED: '#059669', LOST: '#EF4444' };
    
    let funnelHtml = '';
    stageKeys.forEach(function(sk, j) {
      const pct = Math.max(10, (data.stageCounts[sk] / maxCount) * 100);
      const clr = stageColors[sk] || '#6B7280';
      funnelHtml += `
        <div class="funnel-bar" style="animation: slideInRight 0.3s var(--ease-spring) ${j*0.05}s both;">
          <div style="width:100px; font-size:12px; font-weight:500; text-align:right;">${sk}</div>
          <div class="funnel-bar-fill" style="background:${clr};" data-width="${pct}%">0</div>
        </div>`;
    });
    document.getElementById('campStageFunnel').innerHTML = funnelHtml;
    
    setTimeout(function() {
      document.querySelectorAll('#campStageFunnel .funnel-bar-fill').forEach(function(el, i) {
        el.style.width = el.getAttribute('data-width');
        animateValue(el, 0, data.stageCounts[stageKeys[i]], 800);
      });
    }, 50);

    let agentHtml = ''; 
    Object.keys(data.agentStats || {}).forEach(function(k, i) {
      const a = data.agentStats[k];
      agentHtml += `
        <tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
          <td style="font-weight:600;">${k}</td>
          <td>${a.total || 0}</td>
          <td style="color:var(--success);">${a.won || 0}</td>
          <td style="color:var(--danger);">${a.lost || 0}</td>
        </tr>`;
    });
    document.getElementById('campAgentTable').innerHTML = agentHtml || '<tr><td colspan="4">No data</td></tr>';

    let tagsHtml = ''; 
    Object.keys(data.stageTags || {}).forEach(function(st, m) {
      const tagObj = data.stageTags[st];
      Object.keys(tagObj).forEach(function(t, n) {
        tagsHtml += `<span class="tag-chip" style="animation: scaleIn 0.3s var(--ease-spring) ${(m*n)*0.02}s both;">${st}: ${t} (${tagObj[t]})</span>`;
      });
    });
    document.getElementById('campTagsArea').innerHTML = tagsHtml || '<span style="color:var(--text-secondary); font-size:13px;">No tags.</span>';
    lucide.createIcons();
  });
}

// 3. Reports & Audit
function loadReports() {
  document.getElementById('reportsTableBody').innerHTML = getTableSkeletons(5, 5);
  apiCall('getUserCallReport', {}, function(stats) {
    currentReportData = stats;
    let tAtt = 0, tCon = 0, tNot = 0, tWa = 0, tbody = '';
stats.forEach(function(s, i) {
      tAtt += s.attempted; tCon += s.connected; tNot += s.notConnected; tWa += s.whatsapp;
      
      // Fix: Bulletproof null check so charAt() never crashes!
      let safeName = s.name || 'Unknown Agent';
      let initial = safeName.charAt(0).toUpperCase();

      tbody += `<tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
        <td><div style="display:flex;align-items:center;gap:8px;">
        <div class="user-avatar" style="width:28px;height:28px;font-size:12px;">${initial}</div>${safeName}</div></td>
        <td>${s.attempted}</td>
        <td style="color:var(--success); font-weight:600;">${s.connected}</td>
        <td style="color:var(--danger);">${s.notConnected}</td>
        <td>${s.whatsapp}</td>
      </tr>`;
    });
    document.getElementById('reportsTableBody').innerHTML = tbody || '<tr><td colspan="5" style="text-align:center;">No data.</td></tr>';
    document.getElementById('reportMetrics').innerHTML = `
      <div class="metric-card mc-default"><div class="metric-label">Attempted</div><div class="metric-num">${tAtt}</div></div>
      <div class="metric-card mc-success"><div class="metric-label">Connected</div><div class="metric-num">${tCon}</div></div>
      <div class="metric-card mc-danger"><div class="metric-label">Not Connected</div><div class="metric-num">${tNot}</div></div>
      <div class="metric-card mc-default" style="background:var(--info-bg);"><div class="metric-label">WhatsApp</div><div class="metric-num" style="color:var(--info);">${tWa}</div></div>`;
  });
}

function loadLoginReport(btn) {
  const user = document.getElementById('lrUser').value; const date = document.getElementById('lrDate').value;
  if (!user || !date) { showToast('Select User and Date', 'warning'); return; }
  if(btn) btn.classList.add('loading');
  
  apiCall('getLoginReport', { userEmail: user, date: date }, function(data) {
    animateValue(document.getElementById('lrTotalCalls'), 0, data.totalCalls || 0, 800);
    animateValue(document.getElementById('lrTotalBreaks'), 0, data.totalBreaks || 0, 800);
    
    const tlDiv = document.getElementById('lrTimeline');
    if (!data.timeline || data.timeline.length === 0) {
      tlDiv.innerHTML = '<div style="font-size:13px; color:var(--text-secondary);">No activity.</div>';
    } else {
      let th = '';
      data.timeline.forEach(function(t, i) {
        const bc = (t.ACTION === 'LOGIN' || t.ACTION === 'BREAK_END') ? 'badge-won' : (t.ACTION === 'BREAK_START' ? 'badge-lost' : 'badge');
        th += `
          <div style="display:flex; gap:12px; align-items:center; font-size:13px; border-left:2px solid var(--border); padding-left:12px; margin-left:6px; animation: slideInRight 0.3s var(--ease-spring) ${i*0.05}s both;">
            <div style="color:var(--text-secondary); width:60px;">${String(t.TIMESTAMP || '').substring(11, 16)}</div>
            <span class="badge ${bc}">${String(t.ACTION || 'UNKNOWN').replace('_', ' ')}</span>
          </div>`;
      });
      tlDiv.innerHTML = th;
    }
    
    const chDiv = document.getElementById('lrHourlyChart'); 
    let maxVal = 1;
    for (let hr = 8; hr <= 22; hr++) if (data.hourly[hr] && data.hourly[hr].total > maxVal) maxVal = data.hourly[hr].total;
    let chtml = '';
    for (let h = 8; h <= 22; h++) {
      const hrData = data.hourly[h] || { total: 0, connected: 0 };
      const ht = (hrData.total / maxVal) * 100; 
      const hc = hrData.total > 0 ? (hrData.connected / hrData.total) * 100 : 0;
      const label = h > 12 ? (h - 12) + 'PM' : (h === 12 ? '12PM' : h + 'AM');
      chtml += `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; min-width:40px; animation: fadeInUp 0.4s var(--ease-spring) ${(h-8)*0.03}s both;">
          <div style="font-size:10px; font-weight:600;">${hrData.total > 0 ? hrData.total : ''}</div>
          <div style="width:100%; height:100px; background:var(--surface); border-radius:4px 4px 0 0; position:relative; display:flex; align-items:flex-end;">
            <div class="chart-bar-fill" style="background:var(--border);" data-h="${ht}">
              <div class="chart-bar-fill" style="background:var(--primary); position:absolute; bottom:0;" data-h="${hc}"></div>
            </div>
          </div>
          <div style="font-size:10px; color:var(--text-secondary);">${label}</div>
        </div>`;
    }
    chDiv.innerHTML = chtml; 
    setTimeout(function() {
      chDiv.querySelectorAll('.chart-bar-fill').forEach(function(el) { el.style.height = el.getAttribute('data-h') + '%'; });
    }, 50);
    if(btn) btn.classList.remove('loading');
  });
}

function loadAuditLog() {
  var filters = {
    user: document.getElementById('auditUserFilter').value,
    action: document.getElementById('auditActionFilter').value,
    page: currentAuditPage
  };
  
  document.getElementById('auditTimeline').innerHTML = getListSkeletons(5);
  
  apiCall('getAuditLog', { filters: filters }, function(data) {
    var container = document.getElementById('auditTimeline');
    if (!data.logs || data.logs.length === 0) {
      container.innerHTML = '<div class="audit-empty">No audit entries yet.</div>';
      document.getElementById('auditPagination').innerHTML = '';
      return;
    }
    
    var colors = ['#EC4899','#8B5CF6','#10B981','#F59E0B','#3B82F6','#EF4444'];
    var html = '';
    
    data.logs.forEach(function(log, i) {
      var user = log.USER_NAME || 'System';
      var initial = user.charAt(0).toUpperCase();
      var colorIdx = user.charCodeAt(0) % colors.length;
      var color = colors[colorIdx];
      
      var actionText = formatAuditAction(log);
      var changeHtml = '';
      if (log.OLD_VALUE && log.NEW_VALUE) {
        changeHtml = `<div class="audit-change">${log.OLD_VALUE} → ${log.NEW_VALUE}</div>`;
      } else if (log.NEW_VALUE) {
        changeHtml = `<div class="audit-change">${log.NEW_VALUE}</div>`;
      }
      
      html += `
        <div class="audit-item" style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.03}s both;">
          <div class="audit-avatar" style="background:${color}20; color:${color};">${initial}</div>
          <div class="audit-body">
            <div class="audit-text">${actionText}</div>
            ${changeHtml}
            <div class="audit-time">${log.TIMESTAMP ? String(log.TIMESTAMP).replace('T', ' ').substring(0, 19) : '-'}</div>
          </div>
        </div>`;
    });
    
    container.innerHTML = html;
    renderAuditPagination(data.page, data.totalPages);
  });
}

function formatAuditAction(log) {
  var user = `<b>${log.USER_NAME || 'System'}</b>`;
  var entity = `<span class="audit-entity">${log.ENTITY_ID || '-'}</span>`;
  
  switch(log.ACTION) {
    case 'LEAD_CREATED': return `${user} created lead ${entity}`;
    case 'LEAD_UPDATED': return `${user} updated lead ${entity}`;
    case 'LEAD_DELETED': return `${user} deleted lead ${entity}`;
    case 'FOLLOWUP_LOGGED': return `${user} logged follow-up on ${entity}`;
    case 'QUOTE_CREATED': return `${user} created quote ${entity}`;
    case 'QUOTE_DELETED': return `${user} deleted quote ${entity}`;
    case 'DOC_UPLOADED': return `${user} uploaded document to ${entity}`;
    case 'LOGIN': return `${user} logged in`;
    default: return `${user} performed ${log.ACTION || 'action'} on ${entity}`;
  }
}

function renderAuditPagination(current, total) {
  var container = document.getElementById('auditPagination');
  if (total <= 1) { container.innerHTML = ''; return; }
  var html = '';
  if (current > 1) html += `<button class="btn btn-secondary" onclick="changeAuditPage(${current-1})">Previous</button>`;
  html += `<span style="padding:8px 12px; font-size:13px;">Page ${current} of ${total}</span>`;
  if (current < total) html += `<button class="btn btn-secondary" onclick="changeAuditPage(${current+1})">Next</button>`;
  container.innerHTML = html;
}

function populateAuditUserFilter() {
  apiCall('getUsers', {}, function(users) {
    var opts = '<option value="">All users</option>';
    users.forEach(function(u) { opts += `<option value="${u.NAME || ''}">${u.NAME || 'Unknown'}</option>`; });
    var el = document.getElementById('auditUserFilter');
    if (el) el.innerHTML = opts;
  });
}

// 4. Settings Tab
async function backupAllDocuments(btn) {
  if (typeof JSZip === 'undefined') {
    showToast('JSZip library not loaded. Refresh and try again.', 'error');
    return;
  }
  
  if (!confirm('Run FULL BACKUP?\n\nThis will download:\n  • All leads (CSV)\n  • All follow-up history (CSV)\n  • All uploaded documents + manifest\n\nMay take several minutes. Do NOT close this tab.')) {
    return;
  }
  
  var progressBox = document.getElementById('backupProgress');
  var progressBar = document.getElementById('backupProgressBar');
  var statusText = document.getElementById('backupStatusText');
  var countText = document.getElementById('backupCountText');
  
  if (btn) btn.classList.add('loading');
  progressBox.style.display = 'block';
  statusText.textContent = 'Fetching document list...';
  progressBar.style.width = '5%';
  
try {
    var zip = new JSZip();
    
    // ─── STEP 1: Fetch ALL leads (paginated to bypass 1000-row limit) ───
    statusText.textContent = 'Fetching all leads...';
    progressBar.style.width = '8%';
    var allLeads = [];
    var pageSize = 1000;
    var pageNum = 0;
    while (true) {
      var fromIdx = pageNum * pageSize;
      var toIdx = fromIdx + pageSize - 1;
      var { data: pageLeads, error: pageErr } = await supabaseClient.from('leads').select('*').order('lead_date', { ascending: false }).range(fromIdx, toIdx);
      if (pageErr) throw pageErr;
      if (!pageLeads || pageLeads.length === 0) break;
      allLeads = allLeads.concat(pageLeads);
      countText.textContent = 'Leads fetched: ' + allLeads.length;
      if (pageLeads.length < pageSize) break;
      pageNum++;
    }
    
    // Build leads.csv
    if (allLeads.length > 0) {
      var leadHeaders = Object.keys(allLeads[0]);
      var leadCsvLines = [leadHeaders.join(',')];
      allLeads.forEach(function(l) {
        var cells = leadHeaders.map(function(h) {
          var v = l[h];
          if (v === null || v === undefined) return '';
          var s = String(v);
          if (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1) {
            s = '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        });
        leadCsvLines.push(cells.join(','));
      });
      zip.file('leads.csv', leadCsvLines.join('\n'));
    }
    
    // ─── STEP 2: Fetch ALL follow-up logs (paginated) ───
    statusText.textContent = 'Fetching follow-up history...';
    progressBar.style.width = '20%';
    var allLogs = [];
    pageNum = 0;
    while (true) {
      var fromIdx = pageNum * pageSize;
      var toIdx = fromIdx + pageSize - 1;
      var { data: pageLogs, error: logsErr } = await supabaseClient.from('followup_log').select('*').order('log_date', { ascending: false }).range(fromIdx, toIdx);
      if (logsErr) throw logsErr;
      if (!pageLogs || pageLogs.length === 0) break;
      allLogs = allLogs.concat(pageLogs);
      countText.textContent = 'Logs fetched: ' + allLogs.length;
      if (pageLogs.length < pageSize) break;
      pageNum++;
    }
    
    if (allLogs.length > 0) {
      var logHeaders = Object.keys(allLogs[0]);
      var logCsvLines = [logHeaders.join(',')];
      allLogs.forEach(function(l) {
        var cells = logHeaders.map(function(h) {
          var v = l[h];
          if (v === null || v === undefined) return '';
          var s = String(v);
          if (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1) {
            s = '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        });
        logCsvLines.push(cells.join(','));
      });
      zip.file('followup_log.csv', logCsvLines.join('\n'));
    }
    
// ─── STEP 2.5: Fetch all other tables ───
    var extraTables = [
      'users',
      'pipelines',
      'campaigns',
      'quotes',
      'quote_items',
      'orders',
      'knowledge_base',
      'custom_fields',
      'settings',
      'workflows',
      'form_templates',
      'form_responses',
      'audit_log'
    ];
    var tableCounts = {};
    for (var ti = 0; ti < extraTables.length; ti++) {
      var tname = extraTables[ti];
      statusText.textContent = 'Fetching ' + tname + '...';
      var fillPct = 22 + Math.round((ti / extraTables.length) * 8);
      progressBar.style.width = fillPct + '%';
      try {
        var allRows = [];
        var tablePage = 0;
        while (true) {
          var fromIdx = tablePage * pageSize;
          var toIdx = fromIdx + pageSize - 1;
          var resp = await supabaseClient.from(tname).select('*').range(fromIdx, toIdx);
          if (resp.error) { throw resp.error; }
          if (!resp.data || resp.data.length === 0) break;
          allRows = allRows.concat(resp.data);
          if (resp.data.length < pageSize) break;
          tablePage++;
        }
        tableCounts[tname] = allRows.length;
        if (allRows.length > 0) {
          var tHeaders = Object.keys(allRows[0]);
          var tLines = [tHeaders.join(',')];
          allRows.forEach(function(r) {
            var cells = tHeaders.map(function(h) {
              var v = r[h];
              if (v === null || v === undefined) return '';
              var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
              if (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1) {
                s = '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            });
            tLines.push(cells.join(','));
          });
          zip.file(tname + '.csv', tLines.join('\n'));
        }
      } catch (tableErr) {
        console.warn('Could not backup table ' + tname + ':', tableErr.message);
        tableCounts[tname] = 'SKIPPED (' + tableErr.message + ')';
      }
    }
    
    // ─── STEP 3: Fetch document metadata and files ───
    statusText.textContent = 'Fetching document list...';
    progressBar.style.width = '30%';
    var { data: docs, error: docsErr } = await supabaseClient.from('lead_documents').select('*').order('uploaded_at', { ascending: true });
    if (docsErr) throw docsErr;
    
    var fileDocs = (docs || []).filter(function(d) { return d.upload_type === 'UPLOAD' && d.drive_url; });
    
    statusText.textContent = 'Downloading files (' + fileDocs.length + ')...';
    countText.textContent = allLeads.length + ' leads, ' + allLogs.length + ' logs, 0 / ' + fileDocs.length + ' files';
    
    var manifestRows = ['lead_id,doc_name,doc_category,uploaded_by,uploaded_at,file_size,zip_filename,original_url'];
    var successCount = 0;
    var failCount = 0;
    var failedFiles = [];
    
    for (var i = 0; i < fileDocs.length; i++) {
      var doc = fileDocs[i];
      var pct = Math.round(((i + 1) / fileDocs.length) * 90) + 5;
      progressBar.style.width = pct + '%';
      statusText.textContent = 'Downloading file ' + (i + 1) + ' of ' + fileDocs.length + '...';
     countText.textContent = allLeads.length + ' leads, ' + allLogs.length + ' logs, ' + (i + 1) + ' / ' + fileDocs.length + ' files (' + successCount + ' OK, ' + failCount + ' failed)';
      
      try {
        var url = doc.drive_url;
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var blob = await resp.blob();
        
        var urlParts = String(url).split('/');
        var originalFileName = urlParts[urlParts.length - 1].split('?')[0] || 'file';
        try { originalFileName = decodeURIComponent(originalFileName); } catch (e) {}
var zipFileName = String(doc.lead_id || 'NOLEADID') + '_' + originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        
        zip.file('documents/' + zipFileName, blob);
        
        var csvRow = [
          (doc.lead_id || '').replace(/,/g, ' '),
          (doc.doc_name || '').replace(/,/g, ' '),
          (doc.doc_category || '').replace(/,/g, ' '),
          (doc.uploaded_by || '').replace(/,/g, ' '),
          (doc.uploaded_at || '').replace(/,/g, ' '),
          (doc.file_size || ''),
          zipFileName,
          (url || '').replace(/,/g, ' ')
        ].join(',');
        manifestRows.push(csvRow);
        
        successCount++;
      } catch (err) {
        failCount++;
        failedFiles.push((doc.lead_id || '?') + ' / ' + (doc.doc_name || '?') + ' — ' + err.message);
        var csvRow = [
          (doc.lead_id || '').replace(/,/g, ' '),
          (doc.doc_name || '').replace(/,/g, ' '),
          (doc.doc_category || '').replace(/,/g, ' '),
          (doc.uploaded_by || '').replace(/,/g, ' '),
          (doc.uploaded_at || '').replace(/,/g, ' '),
          (doc.file_size || ''),
          'FAILED_TO_DOWNLOAD',
          (doc.drive_url || '').replace(/,/g, ' ')
        ].join(',');
        manifestRows.push(csvRow);
      }
    }
    
zip.file('documents_manifest.csv', manifestRows.join('\n'));
    
    if (failedFiles.length > 0) {
      zip.file('FAILED_FILES.txt', 'These files could not be downloaded:\n\n' + failedFiles.join('\n'));
    }
    
var readmeLines = [
      'Bansal Material House CRM — Full Backup',
      '=================================',
      '',
      'Created: ' + new Date().toISOString(),
      'Created by: ' + (currentUser ? currentUser.name : 'Unknown'),
      '',
      'Contents:',
      '  • leads.csv                — ' + allLeads.length + ' lead records',
      '  • followup_log.csv         — ' + allLogs.length + ' follow-up entries'
    ];
    Object.keys(tableCounts).forEach(function(tn) {
      var padded = (tn + '.csv').padEnd(25, ' ');
      readmeLines.push('  • ' + padded + '— ' + tableCounts[tn] + ' records');
    });
    readmeLines.push('  • documents_manifest.csv   — metadata for ' + fileDocs.length + ' uploaded files');
    readmeLines.push('  • documents/               — ' + successCount + ' actual file(s) downloaded');
    if (failCount > 0) {
      readmeLines.push('  • FAILED_FILES.txt         — ' + failCount + ' files that could not be downloaded');
    }
    readmeLines.push('');
    readmeLines.push('Source: Supabase project tfxkcujcfelovxowdhis');
    readmeLines.push('Restore: import the CSVs back into the corresponding tables.');
    readmeLines.push('');
    zip.file('README.txt', readmeLines.join('\n'));
    
    statusText.textContent = 'Compressing ZIP...';
    progressBar.style.width = '96%';
    
    var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    var fname = 'BMH_Full_Backup_' + stamp + '.zip';
    var dlUrl = URL.createObjectURL(zipBlob);
    var link = document.createElement('a');
    link.href = dlUrl;
    link.download = fname;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(dlUrl);
    
    progressBar.style.width = '100%';
statusText.textContent = 'Backup complete!';
    countText.textContent = allLeads.length + ' leads + ' + allLogs.length + ' logs + ' + successCount + ' files (zipped to ' + fname + ')';
    
    showToast('Backup complete: ' + allLeads.length + ' leads, ' + allLogs.length + ' logs, ' + successCount + ' files', failCount > 0 ? 'warning' : 'success');
    
    setTimeout(function() {
      progressBox.style.display = 'none';
      progressBar.style.width = '0%';
    }, 8000);
  } catch (err) {
    console.error('Backup failed:', err);
    showToast('Backup failed: ' + (err.message || err), 'error');
    progressBox.style.display = 'none';
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

function switchSettingsTab(tabId, btnElement) {
  const allTabs = ['tab-users', 'tab-pipelines', 'tab-forms', 'tab-workflows', 'tab-customfields', 'tab-profile', 'tab-audit'];
  allTabs.forEach(function(t) { const el = document.getElementById(t); if(el) el.style.display = 'none'; });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  
  const tb = document.getElementById('tab-' + tabId);
  if (tb) {
    tb.style.display = 'block';
    tb.style.animation = 'none';
    void tb.offsetWidth;
    tb.style.animation = 'fadeInUp 0.3s var(--ease-spring) forwards';
  }
  btnElement.classList.add('active');
  if (tabId === 'profile') showProfile();
  if (tabId === 'audit') { currentAuditPage = 1; populateAuditUserFilter(); loadAuditLog(); }
}

function showProfile() {
  const info = document.getElementById('profileInfo');
  if (!info) return;
  const initial = (currentUser?.name || 'U').charAt(0).toUpperCase();
  
  info.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; animation:scaleIn 0.4s var(--ease-spring);">
      <div class="user-avatar" style="width:64px; height:64px; font-size:24px;">
        ${initial}
      </div>
      <div>
        <div style="font-size:20px; font-weight:600;">${currentUser?.name || 'Unknown User'}</div>
        <div style="color:var(--text-secondary);">${currentUser?.role || 'AGENT'} | ${currentUser?.email || 'No Email'}</div>
      </div>
    </div>`;
}

function loadSettings() {
  apiCall('getSettings', {}, function(s) {
    s.forEach(function(st) {
      if (st.KEY === 'RETRY_ENABLED' && document.getElementById('setRetryEnabled')) document.getElementById('setRetryEnabled').value = st.VALUE;
      if (st.KEY === 'RETRY_MAX_ATTEMPTS' && document.getElementById('setRetryMax')) document.getElementById('setRetryMax').value = st.VALUE;
      if (st.KEY === 'RETRY_INTERVAL_HOURS' && document.getElementById('setRetryInterval')) document.getElementById('setRetryInterval').value = st.VALUE;
    });
  });

  apiCall('getWorkflows', {}, function(wfs) {
    const wt = document.getElementById('settingsWorkflowsTable');
    if (wfs.length === 0) wt.innerHTML = '<tr><td colspan="6" style="text-align:center;">No workflows.</td></tr>';
    else {
      let wh = '';
      wfs.forEach(function(w, i) {
        const tc = w.STATUS === 'ACTIVE' ? 'badge-won' : 'badge-lost';
        wh += `
          <tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
            <td style="font-weight:600;">${w.WORKFLOW_NAME || '-'}</td>
            <td><span class="badge badge-new">${w.EVENT || '-'}</span></td>
            <td>${w.CAMPAIGN || '-'}</td>
            <td><span class="badge badge-contacted">${w.ACTION || '-'}</span></td>
            <td><button class="btn" style="padding:4px 8px; font-size:11px;" onclick="toggleWorkflow('${w.WORKFLOW_ID || ''}', '${w.STATUS || ''}')"><span class="badge ${tc}">${w.STATUS || '-'}</span></button></td>
            <td><button class="icon-btn" style="color:var(--danger);" onclick="deleteWorkflow('${w.WORKFLOW_ID || ''}')"><i data-lucide="trash-2"></i></button></td>
          </tr>`;
      });
      wt.innerHTML = wh;
    }
  });

  apiCall('getUsers', {}, function(users) {
    let uh = '';
    users.forEach(function(u, i) {
      uh += `
        <tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
          <td>
            <div style="font-weight:600;">${u.NAME || 'Unknown'}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${u.USER_ID || '-'}</div>
          </td>
          <td>${u.EMAIL || '-'}</td>
          <td><span class="badge ${u.ROLE === 'ADMIN' ? 'badge-new' : 'badge'}">${u.ROLE || '-'}</span></td>
          <td><span class="badge ${u.STATUS === 'ACTIVE' ? 'badge-won' : 'badge-lost'}">${u.STATUS || '-'}</span></td>
          <td style="font-size:12px;">${u.ASSIGNED_PIPELINES || '-'}</td>
          <td><button class="icon-btn"><i data-lucide="edit"></i></button></td>
        </tr>`;
    });
    document.getElementById('settingsUsersTable').innerHTML = uh;
    showProfile();
    renderPipelineEditor();
    loadCustomFields();
    lucide.createIcons();
  });
}

function saveRetrySettings(btn) {
  const keys = ['RETRY_ENABLED', 'RETRY_MAX_ATTEMPTS', 'RETRY_INTERVAL_HOURS'];
  const vals = [document.getElementById('setRetryEnabled').value, document.getElementById('setRetryMax').value, document.getElementById('setRetryInterval').value];
  if(btn) btn.classList.add('loading');
  let done = 0;
  keys.forEach(function(k, i) {
    apiCall('updateSettings', { key: k, value: vals[i] }, function() { done++; if (done === keys.length) { if(btn) btn.classList.remove('loading'); showToast('Settings Saved'); } });
  });
}

function renderPipelineEditor() {
  const pipe = document.getElementById('editorPipelineSelect');
  if (!pipe || !pipe.value) return;
  apiCall('getPipelines', {}, function(pObj) {
    const stages = pObj[pipe.value] || [];
    const container = document.getElementById('pipelineEditorFlow');
    let html = '';
    stages.forEach(function(s, i) {
      html += `
        <div class="editor-node" style="animation: scaleIn 0.3s var(--ease-spring) ${i*0.1}s both;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>${s.STAGE_NAME || '-'}</b>
            <div>
              <button class="icon-btn" style="display:inline-block;" onclick="editStage('${pipe.value}',${s.STAGE_ORDER},'${s.STAGE_NAME || ''}')"><i data-lucide="edit-3" style="width:14px;"></i></button>
              <button class="icon-btn" style="display:inline-block; color:var(--danger);" onclick="deleteStagePrompt('${pipe.value}',${s.STAGE_ORDER})"><i data-lucide="trash-2" style="width:14px;"></i></button>
            </div>
          </div>
        </div>`;
      if (i < stages.length - 1) {
        html += `<div class="editor-line" style="animation: scaleIn 0.3s var(--ease-spring) ${i*0.1+0.05}s both;"><button class="editor-add-btn" onclick="addNewStageAt('${pipe.value}',${Number(s.STAGE_ORDER) + 1})">+</button></div>`;
      }
    });
    if (stages.length > 0) {
      html += `<div class="editor-line" style="animation: scaleIn 0.3s var(--ease-spring) ${stages.length*0.1}s both;"><button class="editor-add-btn" onclick="addNewStageAt('${pipe.value}',${Number(stages[stages.length - 1].STAGE_ORDER) + 1})">+</button></div>`;
    }
    html += `
      <div style="display:flex; gap:16px; margin-top:16px; animation: fadeInUp 0.4s var(--ease-spring) ${stages.length*0.1}s both;">
        <div class="editor-node" style="border-left-color:var(--success); width:170px; text-align:center;">WON</div>
        <div class="editor-node" style="border-left-color:var(--danger); width:170px; text-align:center;">LOST</div>
      </div>`;
    container.innerHTML = html; 
    lucide.createIcons();
  });
}

function addNewStageAt(pipe, order) { const name = prompt('New stage name:'); if (name) { showSpinner(); apiCall('addStage', { pipelineName: pipe, order: order, name: name }, function() { renderPipelineEditor(); hideSpinner(); }); } }

function editStage(pipe, order, oldName) { const name = prompt('Rename:', oldName); if (name && name !== oldName) { showSpinner(); apiCall('updateStage', { pipelineName: pipe, stageOrder: order, updates: { stageName: name } }, function() { renderPipelineEditor(); hideSpinner(); }); } }

function loadFormBuilder() {
  const camp = document.getElementById('formCampaignSelect').value;
  const container = document.getElementById('formBuilderContainer');
  if (!camp) { container.innerHTML = '<div class="empty-msg">Select a campaign.</div>'; return; }
  container.innerHTML = getListSkeletons(2);
  apiCall('getFormsByCampaign', { campaignName: camp }, function(sections) {
    currentBuilderSections = sections && sections.length > 0 ? sections : [{ sectionName: 'Section 1', fields: [] }];
    renderFormBuilder();
  });
}

function saveFormBuilder(btn) { const camp = document.getElementById('formCampaignSelect').value; if (!camp) return; if(btn) btn.classList.add('loading'); apiCall('saveFormTemplate', { campaignName: camp, sections: currentBuilderSections }, function() { showToast('Form saved'); if(btn) btn.classList.remove('loading'); }); }

function loadCustomFields() {
  apiCall('getCustomFields', {}, function(fields) {
    const tbody = document.getElementById('customFieldsTable');
    if (!tbody) return;
    if (fields.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">No custom fields.</td></tr>'; return; }
    let html = '';
    fields.forEach(function(f, i) {
      html += `
        <tr style="animation: fadeInUp 0.3s var(--ease-spring) ${i*0.05}s both;">
          <td style="font-size:12px; color:var(--text-secondary);">${f.FIELD_ID || '-'}</td>
          <td style="font-weight:600;">${f.FIELD_NAME || '-'}</td>
          <td><span class="badge badge-new">${f.FIELD_TYPE || '-'}</span></td>
          <td style="font-size:12px;">${f.FIELD_OPTIONS || '-'}</td>
          <td>${f.IS_REQUIRED === 'TRUE' ? 'Yes' : 'No'}</td>
          <td><button class="icon-btn" style="color:var(--danger);" onclick="removeCustomField('${f.FIELD_ID || ''}')"><i data-lucide="trash-2"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html; 
    lucide.createIcons();
  });
}

function saveCustomField(btn) {
  const data = { name: document.getElementById('cfName').value, type: document.getElementById('cfType').value, options: document.getElementById('cfOptions').value, required: false };
  if (!data.name) { showToast('Name required', 'warning'); return; }
  if(btn) btn.classList.add('loading');
  apiCall('addCustomField', { data: data }, function() { showToast('Field added!'); document.getElementById('addCfForm').style.display = 'none'; loadCustomFields(); if(btn) btn.classList.remove('loading'); });
}

function openCreateWorkflowModal() {
  document.getElementById('wfName').value = '';
  document.getElementById('wfTemplateText').value = '';
  apiCall('getCampaigns', {}, function(camps) {
    let opts = '<option value="ALL">All Campaigns</option>';
    camps.forEach(function(c) { opts += `<option value="${c.CAMPAIGN_NAME}">${c.CAMPAIGN_NAME}</option>`; });
    document.getElementById('wfCampaign').innerHTML = opts;
    openModal('modal-createWorkflow');
  });
}

function saveWorkflow(btn) {
  const data = { name: document.getElementById('wfName').value, event: document.getElementById('wfEvent').value, campaign: document.getElementById('wfCampaign').value, action: document.getElementById('wfAction').value, template: document.getElementById('wfTemplateText').value };
  if (!data.name) return;
  if(btn) btn.classList.add('loading');
  apiCall('addWorkflow', { data: data }, function() { showToast('Workflow created!'); closeModal('modal-createWorkflow'); loadSettings(); if(btn) btn.classList.remove('loading'); });
}

// 5. Leaderboard
function loadLeaderboard() {
  document.getElementById('lbTopThree').innerHTML = getListSkeletons(1);
  document.getElementById('lbTableBody').innerHTML = getTableSkeletons(7, 5);
  
  apiCall('getLeaderboardData', { period: currentLbPeriod }, function(res) {
    var data = res.leaderboard || [];
    var topHTML = '';
    var tableHTML = '';
  
    // Top 3
    var top3 = data.slice(0, 3);
    var rankClasses = ['lb-rank-1', 'lb-rank-2', 'lb-rank-3'];
    var medals = ['🥇', '🥈', '🥉'];
  
    // Reorder for display: 2, 1, 3
    var displayOrder = [];
    if(top3[1]) displayOrder.push(top3[1]);
    if(top3[0]) displayOrder.push(top3[0]);
    if(top3[2]) displayOrder.push(top3[2]);

    displayOrder.forEach(function(agent, i) {
      var rClass = rankClasses[(agent.rank || 1) - 1];
      var medal = medals[(agent.rank || 1) - 1];
      topHTML += `
        <div class="lb-hero-card ${rClass} stagger-item">
          <div class="lb-medal">${medal}</div>
          <div class="lb-hero-avatar">${(agent.name || 'U').charAt(0).toUpperCase()}</div>
          <div class="lb-hero-name">${agent.name || 'Unknown'}</div>
          <div class="lb-hero-score">${agent.score || 0} pts</div>
          <div class="lb-hero-stats">
            <div><span>${agent.conversions || 0}</span>Won</div>
            <div><span>${agent.connectRate || 0}%</span>Conn</div>
            <div><span>${agent.pipelineLakhs || 0}L</span>Pipe</div>
          </div>
        </div>`;
    });
    document.getElementById('lbTopThree').innerHTML = topHTML || '<div style="color:var(--text-secondary);">Not enough data for Top 3.</div>';
    
    // Table (All)
    data.forEach(function(agent) {
      var rankBadge = agent.rank <= 3 ? `<div class="lb-rank-badge" style="background:var(--warning-bg);color:var(--warning);">${agent.rank}</div>` : `<div class="lb-rank-badge lb-rank-other">${agent.rank}</div>`;
      tableHTML += `
        <tr class="stagger-item">
          <td>${rankBadge}</td>
          <td style="font-weight:600;">${agent.name || 'Unknown'}</td>
          <td>${agent.totalCalls || 0}</td>
          <td>${agent.connectRate || 0}%</td>
          <td>${agent.conversions || 0}</td>
          <td>₹${agent.pipelineLakhs || 0} L</td>
          <td style="font-weight:700; color:var(--primary);">${agent.score || 0}</td>
        </tr>`;
    });
    
    document.getElementById('lbTableBody').innerHTML = tableHTML || '<tr><td colspan="7" style="text-align:center;">No leaderboard data available.</td></tr>';
  });
}

function setLbPeriod(period, btn) {
  currentLbPeriod = period;
  document.querySelectorAll('.lb-period-filter .filter-pill').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  loadLeaderboard();
}

// 6. Knowledge Base
function loadKnowledge() {
  document.getElementById('kbArticleGrid').innerHTML = getListSkeletons(3);
  var filters = { category: currentKbCategory, search: currentKbSearch };
  
  apiCall('getKnowledgeBase', { filters: filters }, function(res) {
    var articles = res.articles || [];
    var counts = res.categoryCounts || {};
    
    // Update Counts
    Object.keys(counts).forEach(function(key) {
      var el = document.getElementById(`kbCat-${key}`);
      if (el) el.textContent = counts[key];
    });

    // Render Grid
    var html = '';
    articles.forEach(function(a) {
      var tagsArr = String(a.TAGS || '').split(',');
      var tagsHtml = '';
      tagsArr.forEach(function(t) {
        if(t.trim()) tagsHtml += `<span class="kb-tag">${t.trim()}</span>`;
    });

      html += `
        <div class="kb-article-card stagger-item" onclick="openArticle('${a.KB_ID || ''}')">
          <div class="kb-article-category kb-cat-${a.CATEGORY || 'ALL'}">${a.CATEGORY || 'ALL'}</div>
          <div class="kb-article-title">${a.TITLE || 'Untitled'}</div>
          <div class="kb-article-preview">${a.CONTENT || ''}</div>
          <div class="kb-article-footer">
            <div class="kb-tags">${tagsHtml}</div>
            <div style="display:flex; gap:12px;">
              <span><i data-lucide="eye" style="width:12px; vertical-align:middle;"></i> ${a.VIEWS || 0}</span>
              <span>${a.UPDATED_AT ? String(a.UPDATED_AT).substring(0, 10) : '-'}</span>
            </div>
          </div>
        </div>`;
    });
    
    document.getElementById('kbArticleGrid').innerHTML = html || '<div class="empty-msg">No articles found.</div>';
    lucide.createIcons();
  });
}

function setKbCategory(cat, btn) {
  currentKbCategory = cat;
  document.querySelectorAll('.kb-cat').forEach(function(el) { el.classList.remove('active'); });
  btn.classList.add('active');
  loadKnowledge();
}

function searchKnowledge() {
  currentKbSearch = document.getElementById('kbSearch').value;
  loadKnowledge();
}

function openArticle(kbId) {
  currentKbArticleId = kbId;
  showSpinner();
  apiCall('getKnowledgeArticle', { kbId: kbId }, function(res) {
    hideSpinner();
    if (!res.article) return;
    var a = res.article;
    document.getElementById('viewArticleTitle').textContent = a.TITLE || 'Untitled';
    document.getElementById('viewArticleMeta').textContent = `${a.CATEGORY || 'ALL'} • Last updated: ${a.UPDATED_AT ? String(a.UPDATED_AT).substring(0, 10) : '-'} • Views: ${a.VIEWS || 0}`;
    
    var tagsArr = String(a.TAGS || '').split(',');
    var tagsHtml = '';
    tagsArr.forEach(function(t) {
      if(t.trim()) tagsHtml += `<span class="tag-chip">${t.trim()}</span>`;
    });
    document.getElementById('viewArticleTags').innerHTML = tagsHtml;
    document.getElementById('viewArticleContent').textContent = a.CONTENT || '';
    
    openModal('modal-viewArticle');
  });
}

function saveArticle(btn) {
  var id = document.getElementById('editArticleId').value;
  var data = {
    title: document.getElementById('editArticleTitle').value,
    category: document.getElementById('editArticleCategory').value,
    tags: document.getElementById('editArticleTags').value,
    content: document.getElementById('editArticleContent').value,
    createdBy: currentUser.name
  };
  
  if (!data.title || !data.content) {
    showToast('Title and content are required', 'warning');
    return;
  }
  
  if (btn) btn.classList.add('loading');
  var action = id ? 'updateKnowledgeArticle' : 'addKnowledgeArticle';
  var params = id ? { kbId: id, updates: data } : { data: data };
  
  apiCall(action, params, function() {
    showToast('Article saved!');
    closeModal('modal-editArticle');
    loadKnowledge();
    if (btn) btn.classList.remove('loading');
  }, function() {
    if (btn) btn.classList.remove('loading');
  });
}

function openNewArticleModal() {
  document.getElementById('editArticleModalTitle').textContent = 'New Article';
  document.getElementById('editArticleId').value = '';
  document.getElementById('editArticleTitle').value = '';
  document.getElementById('editArticleCategory').value = 'PRODUCT';
  document.getElementById('editArticleTags').value = '';
  document.getElementById('editArticleContent').value = '';
  openModal('modal-editArticle');
}

function openEditArticleModal(kbId) {
  if (!kbId) return;
  closeModal('modal-viewArticle');
  showSpinner();
  apiCall('getKnowledgeArticle', { kbId: kbId }, function(res) {
    hideSpinner();
    if (!res.article) return;
    var a = res.article;
    document.getElementById('editArticleModalTitle').textContent = 'Edit Article';
    document.getElementById('editArticleId').value = a.KB_ID || '';
    document.getElementById('editArticleTitle').value = a.TITLE || '';
    document.getElementById('editArticleCategory').value = a.CATEGORY || '';
    document.getElementById('editArticleTags').value = a.TAGS || '';
    document.getElementById('editArticleContent').value = a.CONTENT || '';
    openModal('modal-editArticle');
  });
}