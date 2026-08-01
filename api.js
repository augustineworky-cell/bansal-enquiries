// ============================================================
// GLOBAL STATE VARIABLES (App Memory)
// ============================================================
var viewAsAgent = ''; 
var currentLbPeriod = 'this_month';
var currentKbCategory = 'ALL';
var currentKbSearch = '';
var currentKbArticleId = null;
var currentDocType = 'link';
var currentReportData = [];
var currentAuditPage = 1;
var currentBuilderSections = [];
var currentFuCampaign = '';

// ========== SUPABASE INITIALIZATION ==========
var supabaseClient = supabase.createClient(
  window.BMH_CONFIG.SUPABASE_URL,
  window.BMH_CONFIG.SUPABASE_ANON_KEY
);

var currentUser = null;

// ========== AUTH FUNCTIONS ==========
async function checkAuth() {
  var { data: sessionData } = await supabaseClient.auth.getSession();
  var session = sessionData ? sessionData.session : null;
  if (!session) { window.location.href = 'login.html'; return null; }
  var { data: userProfile, error } = await supabaseClient.from('users').select('*').eq('email', session.user.email).single();
  if (error || !userProfile) {
    alert('User profile not found. Contact admin.');
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }
  currentUser = {
    id: session.user.id,
    email: session.user.email,
    name: userProfile.name || 'Unknown',
    role: userProfile.role || 'AGENT',
    mobile: userProfile.mobile || '',
    assignedPipelines: userProfile.assigned_pipelines || ''
  };
  var userNameEls = document.querySelectorAll('[data-user-name], .topbar-user-name, #userName');
  userNameEls.forEach(function(el) { el.textContent = currentUser.name; });
  return currentUser;
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem('mmc_user');
  sessionStorage.removeItem('mmc_user_name');
  window.location.href = 'login.html';
}

// ──────────────────────────────────────────────────────────
// SUPABASE API ROUTER
// ──────────────────────────────────────────────────────────
async function apiCall(action, params, onSuccess, onFailure) {
  if (!params) params = {};
  try {
    let responseData = null;

    switch (action) {
      case 'getLeads':
        let lQuery = supabaseClient.from('leads').select('*');
        if (params.filters && params.filters.pipeline) lQuery = lQuery.eq('pipeline', params.filters.pipeline);
        var { data: leadsData, error: lErr } = await lQuery;
        if (lErr) throw lErr;
        responseData = leadsData.map(l => { let u={}; Object.keys(l).forEach(k=>u[k.toUpperCase()]=l[k]); return u; });
        break;

      case 'addLead':
        var newLead = {
          lead_id: 'L-' + Date.now(),
          contact_name: params.leadData.contactName,
          mobile: params.leadData.mobile,
          email: params.leadData.email,
          company: params.leadData.company,
          city: params.leadData.city,
          state: params.leadData.state,
          lead_source: params.leadData.leadSource,
          pipeline: params.leadData.pipeline,
          campaign: params.leadData.campaign,
          assigned_to: params.leadData.assignedTo,
expected_value: params.leadData.expectedValue,
lead_type: params.leadData.leadType,
          parent_lead_id: params.leadData.parentLeadId || null,
          notes: params.leadData.notes,
          product_interest: params.leadData.productInterest || null,
          buyer_type: params.leadData.buyerType || null,
          stage: 'NEW',
          status: 'OPEN',
          created_by: currentUser.name,
          updated_at: new Date().toISOString()
        };
        var { error: insErr } = await supabaseClient.from('leads').insert([newLead]);
        if (insErr) throw insErr;
        responseData = { success: true, leadId: newLead.lead_id };
        break;

      case 'updateLead':
        var updates = {};
        Object.keys(params.updates).forEach(key => { updates[key.toLowerCase()] = params.updates[key]; });
        updates.updated_at = new Date().toISOString();
        var { error: upErr } = await supabaseClient.from('leads').update(updates).eq('lead_id', params.leadId);
        if (upErr) throw upErr;
        responseData = { success: true };
        break;

      case 'getLeadById':
        var { data: singleLead, error: getErr } = await supabaseClient.from('leads').select('*').eq('lead_id', params.leadId).single();
        if (getErr) throw getErr;
        var upperLead = {};
        Object.keys(singleLead).forEach(k => upperLead[k.toUpperCase()] = singleLead[k]);
        responseData = upperLead;
        break;

      case 'completeTask':
        var { error: compErr } = await supabaseClient.from('leads').update({ next_followup: null, updated_at: new Date().toISOString() }).eq('lead_id', params.leadId);
        if (compErr) throw compErr;
        responseData = { success: true };
        break;

      case 'checkDuplicateLead':
        var cleanMobile = String(params.mobile).replace(/\D/g, '');
        var { data: dupData, error: dupErr } = await supabaseClient.from('leads').select('*').ilike('mobile', `%${cleanMobile}%`);
        if (dupData && dupData.length > 0) {
          var upperDup = {};
          Object.keys(dupData[0]).forEach(k => upperDup[k.toUpperCase()] = dupData[0][k]);
          responseData = { isDuplicate: true, existingLead: upperDup };
        } else {
          responseData = { isDuplicate: false };
        }
        break;

      case 'getMyTasks':
        let tq = supabaseClient.from('leads').select('*');
        if (params.userRole === 'AGENT' && params.userName) tq = tq.eq('assigned_to', params.userName);
        var { data: taskLeads, error: tErr } = await tq;
        if (tErr) throw tErr;
        let todayL = [], overdueL = [], upcomingL = [], completedL = [];
        let todayStr = new Date().toISOString().substring(0, 10);
        let nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().substring(0, 10);
        taskLeads.forEach(l => {
           let uL = {}; Object.keys(l).forEach(k=>uL[k.toUpperCase()]=l[k]);
           if(uL.STATUS === 'WON' || uL.STATUS === 'LOST') { completedL.push(uL); return; }
           if(uL.STATUS !== 'OPEN' || !uL.NEXT_FOLLOWUP) return;
           let fuDate = String(uL.NEXT_FOLLOWUP).substring(0, 10);
           if(fuDate < todayStr) overdueL.push(uL);
           else if(fuDate === todayStr) todayL.push(uL);
           else if(fuDate <= nextWeek) upcomingL.push(uL);
        });
        responseData = {
          today: todayL.sort((a,b)=> (b.PRIORITY_SCORE||0) - (a.PRIORITY_SCORE||0)), 
          overdue: overdueL.sort((a,b)=> (b.PRIORITY_SCORE||0) - (a.PRIORITY_SCORE||0)), 
          upcoming: upcomingL, 
          completed: completedL.slice(0,50),
          counts: { today: todayL.length, overdue: overdueL.length, upcoming: upcomingL.length, completed: completedL.length }
        };
        break;

      case 'getCalendarData':
        let cq = supabaseClient.from('leads').select('*').not('next_followup', 'is', null).eq('status', 'OPEN');
        if (params.userRole === 'AGENT' && params.userName) cq = cq.eq('assigned_to', params.userName);
        var { data: calLeads, error: calErr } = await cq;
        if (calErr) throw calErr;
        let calTodayStr = new Date().toISOString().substring(0, 10);
        let events = calLeads.map(l => {
           let dStr = String(l.next_followup).substring(0, 10);
           let stat = 'upcoming';
           if(dStr < calTodayStr) stat = 'overdue';
           else if(dStr === calTodayStr) stat = 'today';
           return { leadId: l.lead_id, contactName: l.contact_name, mobile: l.mobile, stage: l.stage, assignedTo: l.assigned_to, date: dStr, status: stat };
        });
        responseData = { events: events, today: calTodayStr };
        break;

      case 'logFollowUp':
        var logEntry = {
          log_id: 'LOG-' + Date.now(),
          lead_id: params.data.leadId,
          contact_name: params.data.contactName,
          agent: currentUser.email,
          log_date: new Date().toISOString(),
          log_time: new Date().toTimeString().split(' ')[0],
          action: params.data.action,
          outcome: params.data.outcome,
          stage_before: params.data.stageBefore,
          stage_after: params.data.stageAfter,
          notes: params.data.notes,
          next_followup: params.data.nextFollowUp || null
        };
        var { error: logErr } = await supabaseClient.from('followup_log').insert([logEntry]);
        if (logErr) throw logErr;
        var leadUpdates = {
          stage: params.data.stageAfter,
          next_followup: params.data.nextFollowUp || null,
          last_contacted: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (params.data.stageAfter === 'CONVERTED' || params.data.stageAfter === 'WON') leadUpdates.status = 'WON';
        if (params.data.stageAfter === 'LOST') leadUpdates.status = 'LOST';
        var { error: lUpErr } = await supabaseClient.from('leads').update(leadUpdates).eq('lead_id', params.data.leadId);
        if (lUpErr) throw lUpErr;
        responseData = { success: true };
        break;

      case 'getFollowUpHistory':
        var { data: fLogs, error: fErr } = await supabaseClient.from('followup_log').select('*').eq('lead_id', params.leadId).order('log_date', { ascending: false });
        if (fErr) throw fErr;
        responseData = fLogs.map(l => { let u={}; Object.keys(l).forEach(k=>u[k.toUpperCase()]=l[k]); return u; });
        break;

      case 'getCampaigns':
        var { data: camps, error: cErr } = await supabaseClient.from('campaigns').select('*');
        if (cErr) throw cErr;
        responseData = camps.map(c => { let u={}; Object.keys(c).forEach(k=>u[k.toUpperCase()]=c[k]); return u; });
        break;
        
      case 'getPipelines':
        var { data: pipes, error: pErr } = await supabaseClient.from('pipelines').select('*');
        if (pErr) throw pErr;
        var grouped = {};
        pipes.forEach(p => {
          let u={}; Object.keys(p).forEach(k=>u[k.toUpperCase()]=p[k]);
          if(!grouped[u.PIPELINE_NAME]) grouped[u.PIPELINE_NAME] = [];
          grouped[u.PIPELINE_NAME].push(u);
        });
        responseData = grouped;
        break;

      case 'getPipelineNames':
        var { data: pNames, error: pnErr } = await supabaseClient.from('pipelines').select('pipeline_name');
        if (pnErr) throw pnErr;
        var uniqueNames = [...new Set(pNames.map(p => p.pipeline_name))];
        responseData = uniqueNames.length > 0 ? uniqueNames : ["SALES"];
        break;

      case 'addStage':
        var newStage = {
          pipeline_name: params.pipelineName,
          stage_name: params.name,
          stage_order: params.order,
          stage_color: '#3B82F6'
        };
        var { error: addStgErr } = await supabaseClient.from('pipelines').insert([newStage]);
        if (addStgErr) throw addStgErr;
        responseData = { success: true };
        break;

      case 'updateStage':
        var { error: upStgErr } = await supabaseClient.from('pipelines').update({ stage_name: params.updates.stageName }).eq('pipeline_name', params.pipelineName).eq('stage_order', params.stageOrder);
        if (upStgErr) throw upStgErr;
        responseData = { success: true };
        break;

      case 'removeStage':
        var { error: rmStgErr } = await supabaseClient.from('pipelines').delete().eq('pipeline_name', params.pipelineName).eq('stage_order', params.order);
        if (rmStgErr) throw rmStgErr;
        responseData = { success: true };
        break;

      case 'getKnowledgeBase':
        var { data: kbs, error: kbErr } = await supabaseClient.from('knowledge_base').select('*');
        if (kbErr) throw kbErr;
        var catCounts = { ALL: 0, PRODUCT: 0, OBJECTION: 0, SCRIPT: 0, SOP: 0, FAQ: 0 };
        var activeKbs = [];
        kbs.forEach(k => {
           let u={}; Object.keys(k).forEach(key=>u[key.toUpperCase()]=k[key]);
           if(u.STATUS !== 'ARCHIVED') {
               catCounts.ALL++;
               if(catCounts[u.CATEGORY] !== undefined) catCounts[u.CATEGORY]++;
               activeKbs.push(u);
           }
        });
        responseData = { success: true, articles: activeKbs, categoryCounts: catCounts };
        break;

      case 'getKnowledgeArticle':
        var { data: art, error: artErr } = await supabaseClient.from('knowledge_base').select('*').eq('kb_id', params.kbId).single();
        if (artErr) throw artErr;
        let uArt={}; Object.keys(art).forEach(key=>uArt[key.toUpperCase()]=art[key]);
        responseData = { success: true, article: uArt };
        break;

      case 'getSettings':
        var { data: setts, error: sErr } = await supabaseClient.from('settings').select('*');
        if (sErr) throw sErr;
        responseData = setts.map(s => { let u={}; Object.keys(s).forEach(k=>u[k.toUpperCase()]=s[k]); return u; });
        break;

      case 'getWorkflows':
        try {
          var { data: wfs, error: wErr } = await supabaseClient.from('workflows').select('*');
          if (wErr) throw wErr;
          responseData = wfs.map(w => { let u={}; Object.keys(w).forEach(k=>u[k.toUpperCase()]=w[k]); return u; });
        } catch (e) {
          console.warn('Workflows table missing in Supabase. Bypassing...');
          responseData = []; 
        }
        break;
        
      case 'getCustomFields':
        var { data: cfs, error: cfErr } = await supabaseClient.from('custom_fields').select('*');
        if (cfErr) throw cfErr;
        responseData = cfs.map(c => { let u={}; Object.keys(c).forEach(k=>u[k.toUpperCase()]=c[k]); return u; });
        break;

      case 'getUsers':
        var { data: users, error: uErr } = await supabaseClient.from('users').select('*');
        if (uErr) throw uErr;
        responseData = users.map(u => { let o={}; Object.keys(u).forEach(k=>o[k.toUpperCase()]=u[k]); return o; });
        break;

      case 'logUserAction':
        await supabaseClient.from('audit_log').insert([{
          user_name: currentUser.name,
          user_email: currentUser.email,
          action: params.eventName,
          entity_id: params.leadId || '',
          timestamp: new Date().toISOString()
        }]);
        responseData = { success: true };
        break;

      case 'getUserCallReport':
        var { data: logsData, error: lrErr } = await supabaseClient.from('followup_log').select('*');
        if (lrErr) throw lrErr;
        let statsObj = {};
        logsData.forEach(l => {
           let agentName = l.agent || 'Unknown'; 
           if(!statsObj[agentName]) statsObj[agentName] = { name: agentName, attempted: 0, connected: 0, notConnected: 0, whatsapp: 0 };
           statsObj[agentName].attempted++;
           if(l.outcome === 'CONNECTED') statsObj[agentName].connected++;
           if(l.outcome === 'NOT_CONNECTED' || l.outcome === 'BUSY' || l.outcome === 'NO_ANSWER') statsObj[agentName].notConnected++;
           if(l.action === 'WHATSAPP') statsObj[agentName].whatsapp++;
        });
        responseData = Object.values(statsObj);
        break;

      case 'getLeaderboardData':
        var { data: lbUsers } = await supabaseClient.from('users').select('*').eq('status', 'ACTIVE').neq('role', 'ADMIN');
        var { data: lbLogs } = await supabaseClient.from('followup_log').select('*').eq('action', 'CALL');
        var { data: lbLeads } = await supabaseClient.from('leads').select('*');
        let lbAgentStats = {};
        (lbUsers || []).forEach(u => {
          lbAgentStats[u.email] = { name: u.name, email: u.email, role: u.role, totalCalls: 0, connectedCalls: 0, conversions: 0, pipelineValue: 0 };
        });
        (lbLogs || []).forEach(log => {
           if (lbAgentStats[log.agent]) {
             lbAgentStats[log.agent].totalCalls++;
             if (log.outcome === 'CONNECTED') lbAgentStats[log.agent].connectedCalls++;
           }
        });
        (lbLeads || []).forEach(lead => {
           let aEmail = Object.keys(lbAgentStats).find(e => lbAgentStats[e].name === lead.assigned_to);
           if (aEmail) {
             if (lead.status === 'WON') lbAgentStats[aEmail].conversions++;
             if (lead.status !== 'LOST' && lead.expected_value) lbAgentStats[aEmail].pipelineValue += Number(lead.expected_value);
           }
        });
        let lbResults = Object.keys(lbAgentStats).map(email => {
          let stat = lbAgentStats[email];
          let pipeLakhs = stat.pipelineValue / 100000;
          let score = (stat.conversions * 5) + (stat.connectedCalls * 1) + (pipeLakhs * 2);
          let rate = stat.totalCalls > 0 ? (stat.connectedCalls / stat.totalCalls) * 100 : 0;
          return { ...stat, connectRate: Math.round(rate), pipelineLakhs: pipeLakhs.toFixed(2), score: Math.round(score) };
        });
        lbResults.sort((a,b) => b.score - a.score);
        lbResults.forEach((r, i) => r.rank = i + 1);
        responseData = { success: true, period: params.period, leaderboard: lbResults };
        break;

      case 'getQuotations':
        responseData = { quotes: [], metrics: { total: 0, pending: 0, accepted: 0, totalValue: 0 } };
        break;

      case 'getOrders':
        let ordQuery = supabaseClient.from('orders').select('*').order('timestamp', { ascending: false });
        if (params.userRole === 'AGENT' && params.userName) {
          ordQuery = ordQuery.ilike('sales_person', `%${params.userName}%`);
        }
        var { data: orderData, error: ordErr } = await ordQuery;
        if (ordErr) throw ordErr;
        let mappedOrders = [];
        let oMetrics = { total: 0, active: 0, delayed: 0, done: 0 };
        let stepNames = ['Order', 'Production', 'Stock', 'Packing', 'Video', 'Payment', 'Shipped'];
        (orderData || []).forEach(row => {
          if (!row.order_id) return;
          let steps = [];
          for (let i = 1; i <= 6; i++) {
            let statusVal = row[`s${i}_status`] || '';
            let delayVal = row[`s${i}_delay`] || '';
            let plannedVal = row[`s${i}_planned`] || '';
            let actualVal = row[`s${i}_actual`] || '';
            let stateType = 'pending';
            if (String(statusVal).includes('Done') || String(statusVal).includes('✅')) stateType = 'done';
            else if (delayVal && String(delayVal).includes('day')) stateType = 'delayed';
            else if (statusVal) stateType = 'current';
            steps.push({ num: i, name: stepNames[i-1], status: statusVal, delay: delayVal, planned: plannedVal, actual: actualVal, state: stateType });
          }
          let trackingVal = row.tracking_detail || ''; 
          let step7State = trackingVal ? 'done' : 'pending';
          steps.push({ num: 7, name: stepNames[6], status: trackingVal, delay: '', planned: '', actual: '', state: step7State });
          let doneSteps = steps.filter(s => s.state === 'done').length;
          let hasDelay = steps.some(s => s.state === 'delayed');
          let overallStatus = doneSteps === 7 ? 'done' : (hasDelay ? 'delayed' : 'active');
          oMetrics.total++;
          if (overallStatus === 'active') oMetrics.active++;
          else if (overallStatus === 'delayed') oMetrics.delayed++;
          else if (overallStatus === 'done') oMetrics.done++;
          let upperRow = {};
          Object.keys(row).forEach(k => { upperRow[k.toUpperCase()] = row[k]; });
          mappedOrders.push({ orderId: String(row.order_id), customerName: row.customer_name || 'Unknown', salesPerson: row.sales_person || '', phone: row.phone || '', typeOfOrder: row.type_of_order || '', timestamp: row.timestamp || '', steps: steps, doneSteps: doneSteps, overallStatus: overallStatus, RAW_DATA: upperRow });
        });
        responseData = { success: true, orders: mappedOrders, metrics: oMetrics };
        break;
        
      case 'getFormResponses':
        try {
          var { data: fData, error: fErr } = await supabaseClient.from('form_responses').select('*').eq('lead_id', params.leadId);
          if (fErr) throw fErr;
          responseData = (fData || []).map(r => { let u={}; Object.keys(r).forEach(k=>u[k.toUpperCase()]=r[k]); return u; });
        } catch (err) {
          responseData = []; 
        }
        break;

      case 'getLeadDocuments':
        try {
          var { data: dData, error: dErr } = await supabaseClient.from('lead_documents').select('*').eq('lead_id', params.leadId);
          if (dErr) throw dErr;
          responseData = (dData || []).map(d => { let u={}; Object.keys(d).forEach(k=>u[k.toUpperCase()]=d[k]); return u; });
        } catch (err) {
          responseData = [];
        }
        break;

      // ══════════════════════════════════════════════════════
      // ADD THE 30 NEW CASES BELOW THIS LINE, BEFORE `default:`
      // ══════════════════════════════════════════════════════
        
      case 'addCampaign':
        var newCamp = {
          campaign_id: 'CAMP-' + Date.now(),
          campaign_name: params.data.name,
          pipeline: params.data.pipeline,
          manager: params.data.manager,
          distribution: params.data.distribution,
          agents: params.data.agents,
          retry_max: params.data.retryMax,
          retry_interval_hrs: params.data.retryInterval,
          status: 'ACTIVE',
          total_leads: 0,
          converted: 0,
          lost_count: 0
        };
        var { error: acErr } = await supabaseClient.from('campaigns').insert([newCamp]);
        if (acErr) throw acErr;
        responseData = { success: true, campaignId: newCamp.campaign_id };
        break;

      case 'toggleCampaignStatus':
        var { data: tcsData, error: tcsGetErr } = await supabaseClient.from('campaigns').select('status').eq('campaign_id', params.campaignId).single();
        if (tcsGetErr) throw tcsGetErr;
        var newStatus = tcsData.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        var { error: tcsSetErr } = await supabaseClient.from('campaigns').update({ status: newStatus }).eq('campaign_id', params.campaignId);
        if (tcsSetErr) throw tcsSetErr;
        responseData = { success: true, newStatus: newStatus };
        break;

      case 'getCampaignAnalytics':
        var { data: caLeads, error: caLeadsErr } = await supabaseClient.from('leads').select('*').eq('campaign', params.campaignName);
        if (caLeadsErr) throw caLeadsErr;
        
        var leadIds = caLeads.map(function(l) { return l.lead_id; });
        var caLogs = [];
        if (leadIds.length > 0) {
          var { data: tempLogs, error: logErr2 } = await supabaseClient.from('followup_log').select('*').in('lead_id', leadIds);
          if (logErr2) throw logErr2;
          caLogs = tempLogs;
        }
        
        var totalLeads = caLeads.length;
        var statusCounts = { won: 0, lost: 0, open: 0 };
        var stageCounts = { NEW: 0, CONTACTED: 0, FOLLOW_UP: 0, DEMO_SCHEDULED: 0, DEMO_DONE: 0, NEGOTIATION: 0, CONVERTED: 0, LOST: 0 };
        var totalValue = 0;
        var callStats = { total: 0, connected: 0 };
        var agentStats = {};
        var stageTags = {};

        caLeads.forEach(function(l) {
          var st = (l.status || '').toUpperCase();
          if (st === 'WON' || st === 'CONVERTED') statusCounts.won++;
          else if (st === 'LOST') statusCounts.lost++;
          else statusCounts.open++;

          var stage = (l.stage || 'NEW').toUpperCase();
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;

          if (st !== 'LOST') totalValue += (Number(l.expected_value) || 0);

          if (l.assigned_to) {
            if (!agentStats[l.assigned_to]) agentStats[l.assigned_to] = { total: 0, won: 0, lost: 0 };
            agentStats[l.assigned_to].total++;
            if (st === 'WON' || st === 'CONVERTED') agentStats[l.assigned_to].won++;
            if (st === 'LOST') agentStats[l.assigned_to].lost++;
          }

          if (l.tags) {
            var tgs = l.tags.split(',').map(function(t){ return t.trim(); });
            if (!stageTags[stage]) stageTags[stage] = {};
            tgs.forEach(function(t) {
              if (t) stageTags[stage][t] = (stageTags[stage][t] || 0) + 1;
            });
          }
        });

        caLogs.forEach(function(log) {
          if (log.action === 'CALL') {
            callStats.total++;
            if (log.outcome === 'CONNECTED') callStats.connected++;
          }
        });

        responseData = { totalLeads: totalLeads, statusCounts: statusCounts, stageCounts: stageCounts, totalValue: totalValue, callStats: callStats, agentStats: agentStats, stageTags: stageTags };
        break;

      case 'getFormsByCampaign':
        try {
          var { data: gfbcData, error: gfbcErr } = await supabaseClient.from('form_templates').select('*').eq('campaign_name', params.campaignName).order('field_order', { ascending: true });
          if (gfbcErr) throw gfbcErr; 
          var formSections = {};
          (gfbcData || []).forEach(function(row) {
            if (!formSections[row.section_name]) formSections[row.section_name] = [];
            formSections[row.section_name].push({ fieldType: row.field_type, label: row.field_label, options: row.field_options, required: row.is_required });
          });
          responseData = Object.keys(formSections).map(function(sn) {
            return { sectionName: sn, fields: formSections[sn] };
          });
        } catch(e) {
          responseData = [];
        }
        break;

      case 'saveFormTemplate':
        var { error: sftDelErr } = await supabaseClient.from('form_templates').delete().eq('campaign_name', params.campaignName);
        if (sftDelErr) throw sftDelErr;
        var templatesToInsert = [];
        (params.sections || []).forEach(function(sec, sIdx) {
          (sec.fields || []).forEach(function(f, fIdx) {
            templatesToInsert.push({
              campaign_name: params.campaignName,
              section_name: sec.sectionName,
              field_type: f.fieldType,
              field_label: f.label,
              field_options: f.options || null,
              is_required: f.required || false,
              field_order: (sIdx * 100) + fIdx
            });
          });
        });
        if (templatesToInsert.length > 0) {
          var { error: sftInsErr } = await supabaseClient.from('form_templates').insert(templatesToInsert);
          if (sftInsErr) throw sftInsErr;
        }
        responseData = { success: true };
        break;

      case 'saveFormResponse':
        var frInserts = Object.keys(params.responses).map(function(lbl) {
          return {
            lead_id: params.leadId,
            campaign_name: params.campaignName,
            field_label: lbl,
            response_value: params.responses[lbl],
            timestamp: new Date().toISOString()
          };
        });
        if (frInserts.length > 0) {
          var { error: frErr } = await supabaseClient.from('form_responses').insert(frInserts);
          if (frErr) throw frErr;
        }
        responseData = { success: true };
        break;

      case 'addWorkflow':
        var newWf = {
          workflow_id: 'WF-' + Date.now(),
          workflow_name: params.data.name,
          event: params.data.event,
          campaign: params.data.campaign,
          action: params.data.action,
          template: params.data.template,
          status: 'ACTIVE'
        };
        var { error: awfErr } = await supabaseClient.from('workflows').insert([newWf]);
        if (awfErr) throw awfErr;
        responseData = { success: true };
        break;

      case 'toggleWorkflow':
        var newWfStatus = params.currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        var { error: twfErr } = await supabaseClient.from('workflows').update({ status: newWfStatus }).eq('workflow_id', params.workflowId);
        if (twfErr) throw twfErr;
        responseData = { success: true };
        break;

      case 'deleteWorkflow':
        var { error: dwfErr } = await supabaseClient.from('workflows').delete().eq('workflow_id', params.workflowId);
        if (dwfErr) throw dwfErr;
        responseData = { success: true };
        break;

      case 'addCustomField':
        var newCf = {
          field_id: 'CF-' + Date.now(),
          field_name: params.data.name,
          field_type: params.data.type,
          field_options: params.data.options,
          is_required: params.data.required,
          created_at: new Date().toISOString()
        };
        var { error: acfErr } = await supabaseClient.from('custom_fields').insert([newCf]);
        if (acfErr) throw acfErr;
        responseData = { success: true };
        break;

      case 'removeCustomField':
        var { error: rcfErr } = await supabaseClient.from('custom_fields').delete().eq('field_id', params.fieldId);
        if (rcfErr) throw rcfErr;
        responseData = { success: true };
        break;

      case 'addKnowledgeArticle':
        var newKb = {
          kb_id: 'KB-' + Date.now(),
          title: params.data.title,
          category: params.data.category,
          tags: params.data.tags,
          content: params.data.content,
          created_by: params.data.createdBy,
          created_at: new Date().toISOString(),
          views: 0,
          status: 'ACTIVE'
        };
        var { error: akbErr } = await supabaseClient.from('knowledge_base').insert([newKb]);
        if (akbErr) throw akbErr;
        responseData = { success: true };
        break;

      case 'updateKnowledgeArticle':
        var kbUpdates = {
          title: params.updates.title,
          category: params.updates.category,
          tags: params.updates.tags,
          content: params.updates.content,
          updated_at: new Date().toISOString()
        };
        var { error: ukbErr } = await supabaseClient.from('knowledge_base').update(kbUpdates).eq('kb_id', params.kbId);
        if (ukbErr) throw ukbErr;
        responseData = { success: true };
        break;

      case 'getAuditLog':
        var alQuery = supabaseClient.from('audit_log').select('*', { count: 'exact' });
        if (params.filters && params.filters.user) alQuery = alQuery.eq('user_name', params.filters.user);
        if (params.filters && params.filters.action) alQuery = alQuery.eq('action', params.filters.action);
        
        var alPageNum = (params.filters && params.filters.page) ? params.filters.page : 1;
        var alLimit = 25;
        var alOffset = (alPageNum - 1) * alLimit;
        alQuery = alQuery.order('timestamp', { ascending: false }).range(alOffset, alOffset + alLimit - 1);
        
        var { data: alData, count: alCount, error: alErr2 } = await alQuery;
        if (alErr2) throw alErr2;
        
        var mappedLogs = (alData || []).map(function(r) {
          var row = {};
          Object.keys(r).forEach(function(k) { row[k.toUpperCase()] = r[k]; });
          return row;
        });
        responseData = { logs: mappedLogs, page: alPageNum, totalPages: Math.ceil((alCount || 0) / alLimit) };
        break;

      case 'getLoginReport':
        var { data: llData, error: llErr } = await supabaseClient.from('login_log')
          .select('*')
          .eq('user_email', params.userEmail)
          .eq('log_date', params.date)
          .order('timestamp', { ascending: true });
        if (llErr) throw llErr;

        var { data: flData, error: flErr } = await supabaseClient.from('followup_log')
          .select('*')
          .eq('agent', params.userEmail)
          .eq('log_date', params.date)
          .eq('action', 'CALL');
        if (flErr) throw flErr;

        var timeline = (llData || []).map(function(r) {
          var row = {};
          Object.keys(r).forEach(function(k) { row[k.toUpperCase()] = r[k]; });
          return row;
        });

        var totalBreaks = timeline.filter(function(r) { return r.ACTION === 'BREAK_START'; }).length;
        var totalCalls = (flData || []).length;
        
        var hourly = {};
        for (var h = 0; h < 24; h++) hourly[h] = { total: 0, connected: 0 };
        
        (flData || []).forEach(function(log) {
          var hour = new Date(log.log_time || log.timestamp || new Date()).getHours();
          if (hourly[hour]) {
            hourly[hour].total++;
            if (log.outcome === 'CONNECTED') hourly[hour].connected++;
          }
        });

        responseData = { timeline: timeline, totalCalls: totalCalls, totalBreaks: totalBreaks, hourly: hourly };
        break;

      case 'updateSettings':
        var { error: usErr } = await supabaseClient.from('settings').upsert({ key: params.key, value: params.value }, { onConflict: 'key' });
        if (usErr) throw usErr;
        responseData = { success: true };
        break;

      case 'getQuoteById':
        var { data: gqData, error: gqErr } = await supabaseClient.from('quotes').select('*').eq('quote_id', params.quoteId).single();
        if (gqErr) throw gqErr;
        var { data: gqiData, error: gqiErr } = await supabaseClient.from('quote_items').select('*').eq('quote_id', params.quoteId);
        if (gqiErr) throw gqiErr;

        var upperQuote = {};
        Object.keys(gqData).forEach(function(k) { upperQuote[k.toUpperCase()] = gqData[k]; });
        upperQuote.ITEMS = gqiData.map(function(r) {
          var item = {};
          Object.keys(r).forEach(function(k) { item[k.toUpperCase()] = r[k]; });
          return item;
        });
        responseData = upperQuote;
        break;

      case 'addQuote':
        var qSubtotal = 0;
        var qIdDate = new Date().toISOString().slice(2,10).replace(/-/g,'');
        var qIdRand = Math.floor(100 + Math.random() * 900);
        var qId = 'QT-' + qIdDate + '-' + qIdRand;
        
        var qItemsToInsert = (params.quoteData.items || []).map(function(item) {
          var amt = (item.quantity * item.rate) * (1 - ((item.discountPercent || 0) / 100));
          qSubtotal += amt;
          return {
            quote_id: qId,
            item_name: item.item_name,
            item_sku: item.item_sku,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            discount_percent: item.discountPercent || 0,
            amount: amt
          };
        });
        
        var qDiscount = Number(params.quoteData.discount) || 0;
        var qGstPercent = Number(params.quoteData.gstPercent) || 0;
        var qGstAmount = (qSubtotal - qDiscount) * (qGstPercent / 100);
        var qGrandTotal = qSubtotal - qDiscount + qGstAmount;

        var newQuoteData = {
          quote_id: qId,
          customer_name: params.quoteData.customerName,
          customer_mobile: params.quoteData.customerMobile,
          customer_email: params.quoteData.customerEmail,
          customer_company: params.quoteData.customerCompany,
          lead_id: params.quoteData.leadId,
          valid_until: params.quoteData.validUntil,
          notes: params.quoteData.notes,
          discount: qDiscount,
          gst_percent: qGstPercent,
          subtotal: qSubtotal,
          gst_amount: qGstAmount,
          grand_total: qGrandTotal,
          status: 'DRAFT',
          created_by: params.quoteData.createdBy,
          quote_date: new Date().toISOString(),
          item_count: qItemsToInsert.length
        };

        var { error: aqErr } = await supabaseClient.from('quotes').insert([newQuoteData]);
        if (aqErr) throw aqErr;
        if (qItemsToInsert.length > 0) {
          var { error: aqiErr } = await supabaseClient.from('quote_items').insert(qItemsToInsert);
          if (aqiErr) throw aqiErr;
        }
        responseData = { success: true, quoteId: qId };
        break;

      case 'updateQuote':
        var uqSubtotal = 0;
        var uqItemsToInsert = (params.quoteData.items || []).map(function(item) {
          var amt = (item.quantity * item.rate) * (1 - ((item.discountPercent || 0) / 100));
          uqSubtotal += amt;
          return {
            quote_id: params.quoteId,
            item_name: item.item_name,
            item_sku: item.item_sku,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            discount_percent: item.discountPercent || 0,
            amount: amt
          };
        });
        
        var uqDiscount = Number(params.quoteData.discount) || 0;
        var uqGstPercent = Number(params.quoteData.gstPercent) || 0;
        var uqGstAmount = (uqSubtotal - uqDiscount) * (uqGstPercent / 100);
        var uqGrandTotal = uqSubtotal - uqDiscount + uqGstAmount;

        var uqDataUpdates = {
          customer_name: params.quoteData.customerName,
          customer_mobile: params.quoteData.customerMobile,
          customer_email: params.quoteData.customerEmail,
          customer_company: params.quoteData.customerCompany,
          lead_id: params.quoteData.leadId,
          valid_until: params.quoteData.validUntil,
          notes: params.quoteData.notes,
          discount: uqDiscount,
          gst_percent: uqGstPercent,
          subtotal: uqSubtotal,
          gst_amount: uqGstAmount,
          grand_total: uqGrandTotal,
          item_count: uqItemsToInsert.length
        };

        var { error: uqDelErr } = await supabaseClient.from('quote_items').delete().eq('quote_id', params.quoteId);
        if (uqDelErr) throw uqDelErr;
        
        if (uqItemsToInsert.length > 0) {
          var { error: uqiInsErr } = await supabaseClient.from('quote_items').insert(uqItemsToInsert);
          if (uqiInsErr) throw uqiInsErr;
        }
        
        var { error: uqUpdErr } = await supabaseClient.from('quotes').update(uqDataUpdates).eq('quote_id', params.quoteId);
        if (uqUpdErr) throw uqUpdErr;
        
        responseData = { success: true };
        break;

      case 'deleteQuote':
        var { error: dqItemErr } = await supabaseClient.from('quote_items').delete().eq('quote_id', params.quoteId);
        if (dqItemErr) throw dqItemErr;
        var { error: dqErr } = await supabaseClient.from('quotes').delete().eq('quote_id', params.quoteId);
        if (dqErr) throw dqErr;
        responseData = { success: true };
        break;

      case 'updateQuoteStatus':
        var { error: uqsErr } = await supabaseClient.from('quotes').update({ status: params.newStatus }).eq('quote_id', params.quoteId);
        if (uqsErr) throw uqsErr;
        responseData = { success: true };
        break;

      case 'generateQuoteWhatsAppText':
        var { data: qwtData, error: qwtErr } = await supabaseClient.from('quotes').select('*').eq('quote_id', params.quoteId).single();
        if (qwtErr) throw qwtErr;
        var { data: qwtiData, error: qwtiErr } = await supabaseClient.from('quote_items').select('*').eq('quote_id', params.quoteId);
        if (qwtiErr) throw qwtiErr;

        var textLines = [
          '*Quotation #' + qwtData.quote_id + '*',
          'Customer: ' + (qwtData.customer_name || 'N/A'),
          'Date: ' + new Date(qwtData.quote_date).toLocaleDateString(),
          '',
          'Items:'
        ];
        qwtiData.forEach(function(it, idx) {
          textLines.push((idx + 1) + '. ' + it.item_name + ' - ' + it.quantity + ' ' + (it.unit || '') + ' @ ₹' + it.rate + ' = ₹' + it.amount.toFixed(2));
        });
        textLines.push('');
        textLines.push('Subtotal: ₹' + qwtData.subtotal.toFixed(2));
        textLines.push('Discount: ₹' + qwtData.discount.toFixed(2));
        textLines.push('GST (' + qwtData.gst_percent + '%): ₹' + qwtData.gst_amount.toFixed(2));
        textLines.push('*Grand Total: ₹' + qwtData.grand_total.toFixed(2) + '*');
        textLines.push('');
        textLines.push('Valid until: ' + new Date(qwtData.valid_until).toLocaleDateString());

        responseData = { success: true, mobile: qwtData.customer_mobile, text: textLines.join('\n') };
        break;

      case 'addLeadDocumentLink':
        var docLinkData = {
          lead_id: params.data.leadId,
          doc_name: params.data.docName,
          doc_category: params.data.docCategory,
          upload_type: 'LINK',
          drive_url: params.data.driveUrl,
          notes: params.data.notes,
          uploaded_by: params.data.uploadedBy,
          uploaded_at: new Date().toISOString()
        };
        var { error: adlErr } = await supabaseClient.from('lead_documents').insert([docLinkData]);
        if (adlErr) throw adlErr;
        responseData = { success: true };
        break;

case 'uploadLeadDocument':
        try {
          var fileDataUri = params.data.fileBase64.startsWith('data:') ? params.data.fileBase64 : 'data:' + params.data.mimeType + ';base64,' + params.data.fileBase64;
          var fetchRes = await fetch(fileDataUri);
          var blob = await fetchRes.blob();
          var safeFileName = String(params.data.fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
          var filePath = params.data.leadId + '/' + Date.now() + '_' + safeFileName;
          
          var { data: uldStoreData, error: uldStoreErr } = await supabaseClient.storage.from('lead-documents').upload(filePath, blob, { contentType: params.data.mimeType });
          if (uldStoreErr) {
            if (uldStoreErr.message && uldStoreErr.message.includes('Bucket not found')) {
              responseData = { success: false, error: 'Bucket lead-documents not configured' };
              break;
            }
            responseData = { success: false, error: uldStoreErr.message || 'Storage upload failed' };
            break;
          }
          
          var { data: uldPublicUrlData } = supabaseClient.storage.from('lead-documents').getPublicUrl(filePath);
          var publicUrl = uldPublicUrlData.publicUrl;

          var docUploadData = {
            lead_id: params.data.leadId,
            doc_name: params.data.docName,
            doc_category: params.data.docCategory,
            upload_type: 'UPLOAD',
            file_size: blob.size,
            drive_url: publicUrl,
            notes: params.data.notes,
            uploaded_by: params.data.uploadedBy,
            uploaded_at: new Date().toISOString()
          };
          var { error: uldDbErr } = await supabaseClient.from('lead_documents').insert([docUploadData]);
          if (uldDbErr) {
            responseData = { success: false, error: 'DB insert failed: ' + uldDbErr.message };
            break;
          }
          
          responseData = { success: true, url: publicUrl };
        } catch (err) {
          responseData = { success: false, error: err.message || 'Upload failed' };
        }
        break;

      case 'deleteLeadDocument':
        var { error: dldErr } = await supabaseClient.from('lead_documents').delete().eq('doc_id', params.docId);
        if (dldErr) throw dldErr;
        responseData = { success: true };
        break;

      case 'bulkAddLeads':
        var baseId = Date.now();
        var columnMap = {
          'name': 'contact_name',
          'contact name': 'contact_name',
          'contact_name': 'contact_name',
          'mobile': 'mobile',
          'phone': 'mobile',
          'email': 'email',
          'company': 'company',
          'city': 'city',
          'state': 'state',
          'product': 'product_interest',
          'product interest': 'product_interest',
          'product_interest': 'product_interest',
          'buyer type': 'buyer_type',
          'buyer_type': 'buyer_type',
          'source': 'lead_source',
          'lead source': 'lead_source',
          'lead_source': 'lead_source',
          'campaign': 'campaign',
          'assigned to': 'assigned_to',
          'assigned_to': 'assigned_to',
          'expected value': 'expected_value',
          'expected_value': 'expected_value',
          'value': 'expected_value',
          'notes': 'notes',
          'note': 'notes'
        };
        var nowIso = new Date().toISOString();
        var mappedNewLeads = params.leadsArray.map(function(row, index) {
          var obj = { 
            stage: 'NEW', 
            status: 'OPEN', 
            lead_id: 'L-' + baseId + '-' + index,
            created_by: currentUser.name,
            lead_date: nowIso,
            updated_at: nowIso
          };
          Object.keys(row).forEach(function(k) { 
            var rawKey = String(k || '').trim().toLowerCase();
            var dbCol = columnMap[rawKey];
            if (!dbCol) return;
            var val = row[k];
            if (val === undefined || val === null || String(val).trim() === '') return;
            if (dbCol === 'expected_value') {
              var num = Number(String(val).replace(/[^0-9.-]/g, ''));
              obj[dbCol] = isNaN(num) ? 0 : num;
            } else {
              obj[dbCol] = String(val).trim();
            }
          });
          if (!obj.assigned_to) obj.assigned_to = currentUser.name;
          if (!obj.lead_source) obj.lead_source = 'BULK_UPLOAD';
          return obj;
        });
        var validLeads = mappedNewLeads.filter(function(l) { return l.contact_name && l.mobile; });
        var skipped = mappedNewLeads.length - validLeads.length;
        if (validLeads.length > 0) {
          var { error: balErr } = await supabaseClient.from('leads').insert(validLeads);
          if (balErr) throw balErr;
        }
        responseData = { count: validLeads.length, skipped: skipped };
        break;

      case 'bulkReassignLeads':
        var { error: brlErr } = await supabaseClient.from('leads').update({ assigned_to: params.newAssignedTo, updated_at: new Date().toISOString() }).in('lead_id', params.leadIds);
        if (brlErr) throw brlErr;
        var brlLog = {
          user_name: params.userName,
          action: 'BULK_REASSIGN',
          lead_count: params.leadIds.length,
          details: 'Reassigned to ' + params.newAssignedTo,
          timestamp: new Date().toISOString()
        };
        await supabaseClient.from('bulk_actions_log').insert([brlLog]);
        responseData = { success: true, updated: params.leadIds.length };
        break;

      case 'bulkAddTagToLeads':
        var { data: tagLeads, error: tlErr } = await supabaseClient.from('leads').select('lead_id, tags').in('lead_id', params.leadIds);
        if (tlErr) throw tlErr;
        var tagPromises = tagLeads.map(function(l) {
          var currentTags = l.tags ? l.tags.split(',').map(function(t) { return t.trim(); }) : [];
          if (currentTags.indexOf(params.tagName) === -1) {
            currentTags.push(params.tagName);
            return supabaseClient.from('leads').update({ tags: currentTags.join(', '), updated_at: new Date().toISOString() }).eq('lead_id', l.lead_id);
          }
        });
        await Promise.all(tagPromises.filter(Boolean));
        var batLog = {
          user_name: params.userName,
          action: 'BULK_TAG',
          lead_count: params.leadIds.length,
          details: 'Added tag: ' + params.tagName,
          timestamp: new Date().toISOString()
        };
        await supabaseClient.from('bulk_actions_log').insert([batLog]);
        responseData = { success: true, updated: params.leadIds.length };
        break;

      case 'bulkChangeStageForLeads':
        var { error: bcsErr } = await supabaseClient.from('leads').update({ stage: params.newStage, updated_at: new Date().toISOString() }).in('lead_id', params.leadIds);
        if (bcsErr) throw bcsErr;
        var bcsLog = {
          user_name: params.userName,
          action: 'BULK_STAGE_CHANGE',
          lead_count: params.leadIds.length,
          details: 'Changed to stage: ' + params.newStage,
          timestamp: new Date().toISOString()
        };
        await supabaseClient.from('bulk_actions_log').insert([bcsLog]);
        responseData = { success: true, updated: params.leadIds.length };
        break;

      case 'bulkDeleteLeads':
        if (params.userRole !== 'ADMIN') {
          responseData = { success: false, error: 'Only ADMIN can delete' };
          break;
        }
        var { error: bdlErr } = await supabaseClient.from('leads').delete().in('lead_id', params.leadIds);
        if (bdlErr) throw bdlErr;
        var bdlLog = {
          user_name: params.userName,
          action: 'BULK_DELETE',
          lead_count: params.leadIds.length,
          details: 'Deleted leads permanently',
          timestamp: new Date().toISOString()
        };
        await supabaseClient.from('bulk_actions_log').insert([bdlLog]);
        responseData = { success: true, deleted: params.leadIds.length };
        break;

      default:
        console.warn('Fallback needed for:', action);
        responseData = { success: false, error: 'Endpoint temporarily disabled during migration' };
    }

    if (onSuccess) onSuccess(responseData);

  } catch (err) {
    console.error(`Supabase API Error [${action}]:`, err);
    if (onFailure) onFailure(err.message);
    else if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}
