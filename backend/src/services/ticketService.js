const env = require('../config/env');
const {
  znunyRequest,
  resolveZnunyAuth,
  getCacheEntry,
  getCached,
  setCached,
  listCacheKeys,
  invalidateCachePrefix,
} = require('./znunyClient');
const { getRawInventoryList } = require('./cmdbService');
const {
  DEMO_QUEUES,
  DEMO_PRIORITIES,
  DEMO_SERVICES,
  DEMO_SLAS,
  DEMO_AGENTS,
  getDemoState,
  addDemoTicket,
  updateDemoTicket,
} = require('./demoStore');
const { recordAudit } = require('./auditService');
const { ApiError } = require('../middleware/errorHandler');

const TICKET_STATES = [
  'new',
  'open',
  'pending reminder',
  'pending auto close+',
  'pending auto close-',
  'closed successful',
  'closed unsuccessful',
  'closed with workaround',
];

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function computeSlaStatus(rawTicket = {}) {
  const stateType = String(rawTicket.StateType || '').toLowerCase();
  if (stateType === 'closed' || String(rawTicket.State || '').toLowerCase().includes('closed')) {
    return 'met';
  }

  const escalated =
    Number(rawTicket.SolutionTimeEscalation || 0) > 0 ||
    Number(rawTicket.FirstResponseTimeEscalation || 0) > 0 ||
    Number(rawTicket.UpdateTimeEscalation || 0) > 0 ||
    (rawTicket.EscalationTime !== undefined && rawTicket.EscalationTime !== '' && Number(rawTicket.EscalationTime) < 0);

  if (escalated) return 'breached';

  const notify =
    Number(rawTicket.SolutionTimeNotification || 0) > 0 ||
    Number(rawTicket.FirstResponseTimeNotification || 0) > 0 ||
    Number(rawTicket.UpdateTimeNotification || 0) > 0 ||
    (rawTicket.EscalationTime !== undefined &&
      rawTicket.EscalationTime !== '' &&
      Number(rawTicket.EscalationTime) > 0 &&
      Number(rawTicket.EscalationTime) <= 3600);

  if (notify) return 'approaching_breach';

  if (rawTicket.SLA || rawTicket.EscalationDestinationDate) return 'within_sla';
  return 'none';
}

/**
 * Extracts CI references mentioned in DynamicFields (e.g. ConfigItemDropdown/Multiselect)
 * or structured `[Linked CI: #10139000001]` tags in articles when Link::LinkList is unavailable.
 */
function extractReferencedCINumbers(rawTicket = {}, articles = []) {
  const refs = new Set();
  if (Array.isArray(rawTicket.DynamicField)) {
    for (const df of rawTicket.DynamicField) {
      if (df && df.Value && /configitem|ci/i.test(df.Name || '')) {
        const vals = Array.isArray(df.Value) ? df.Value : [df.Value];
        for (const v of vals) if (v) refs.add(String(v).trim());
      }
    }
  }
  for (const art of articles) {
    const body = String(art.Body || art.body || '');
    const matches = body.matchAll(/\[CI[:\s#-]+(\d+)\]/gi);
    for (const m of matches) {
      refs.add(m[1]);
    }
  }
  return Array.from(refs);
}

function normalizeZnunyTicket(raw = {}, ciLookup = { byId: new Map(), byNumber: new Map() }) {
  const rawArticles = Array.isArray(raw.Article) ? raw.Article : raw.Article ? [raw.Article] : [];
  const articles = rawArticles.map((a) => {
    const rawAttachments = Array.isArray(a.Attachment) ? a.Attachment : a.Attachment ? [a.Attachment] : [];
    return {
      articleId: Number(a.ArticleID),
      from: a.From || '',
      to: a.To || '',
      cc: a.Cc || '',
      subject: a.Subject || '',
      body: a.Body || '',
      senderType: a.SenderType || 'agent',
      isVisibleForCustomer: Number(a.IsVisibleForCustomer ?? 1),
      contentType: a.ContentType || a.MimeType || 'text/plain',
      created: a.CreateTime || a.IncomingTime || '',
      attachments: rawAttachments.map((att, idx) => ({
        attachmentId: Number(att.FileID || att.AttachmentID || idx + 1),
        filename: att.Filename || `attachment-${idx + 1}`,
        contentType: att.ContentType || 'application/octet-stream',
        filesize: att.Filesize || (att.FilesizeRaw ? `${Math.round(Number(att.FilesizeRaw) / 1024)} KB` : ''),
        filesizeRaw: Number(att.FilesizeRaw || 0),
      })),
    };
  });

  const referencedTokens = extractReferencedCINumbers(raw, rawArticles);
  const linkedCIs = [];
  for (const token of referencedTokens) {
    const found = ciLookup.byNumber.get(token) || ciLookup.byId.get(Number(token));
    if (found && !linkedCIs.some((x) => x.id === found.id)) {
      linkedCIs.push({
        id: found.id,
        ciNumber: found.ciNumber,
        name: found.name,
        className: found.className,
        inciState: found.inciState,
        deplState: found.deplState,
        location: found.location,
      });
    }
  }

  return {
    id: Number(raw.TicketID),
    ticketNumber: String(raw.TicketNumber || ''),
    title: raw.Title || '(Untitled Ticket)',
    queue: raw.Queue || '',
    queueId: Number(raw.QueueID || 0),
    state: raw.State || 'new',
    stateType: raw.StateType || 'new',
    priority: raw.Priority || '3 Major',
    priorityId: Number(raw.PriorityID || 3),
    type: raw.Type || 'Unclassified',
    lock: raw.Lock || 'unlock',
    customer: raw.CustomerID || '—',
    customerUser: raw.CustomerUserID || '—',
    owner: raw.Owner || 'root@localhost',
    responsible: raw.Responsible || raw.Owner || '—',
    service: raw.Service || '',
    serviceId: Number(raw.ServiceID || 0),
    sla: raw.SLA || '',
    slaId: Number(raw.SLAID || 0),
    ageSeconds: Number(raw.Age || 0),
    escalationDestinationDate: raw.EscalationDestinationDate || raw.SolutionTimeDestinationDate || null,
    escalationSecondsRemaining:
      raw.EscalationTime !== undefined && raw.EscalationTime !== '' ? Number(raw.EscalationTime) : null,
    slaStatus: computeSlaStatus(raw),
    created: raw.Created || '',
    updated: raw.Changed || raw.Created || '',
    articles,
    linkedCIs,
    dynamicFields: Array.isArray(raw.DynamicField) ? raw.DynamicField : [],
  };
}

/**
 * Retrieves Ticket Catalogs from `portal_with_catalogue` (ID 4) + SLA definitions from `SLA Api` (ID 9).
 */
async function getTicketCatalogs(session) {
  if (session.mode === 'demo') {
    return {
      queues: Object.entries(DEMO_QUEUES).map(([id, name]) => ({ id: Number(id), name })),
      priorities: Object.entries(DEMO_PRIORITIES).map(([id, name]) => ({ id: Number(id), name })),
      services: Object.entries(DEMO_SERVICES).map(([id, name]) => ({ id: Number(id), name })),
      states: TICKET_STATES,
      slas: DEMO_SLAS,
      agents: DEMO_AGENTS,
    };
  }

  const entry = getCacheEntry('tickets:catalogs');
  if (entry && entry.isFresh) return entry.value;

  const [qRes, pRes, sRes, tRes] = await Promise.all([
    znunyRequest({ webservice: env.znuny.wsTicket, method: 'GET', route: '/Catalog/Queue' }).catch(() => ({ QueueList: {} })),
    znunyRequest({ webservice: env.znuny.wsTicket, method: 'GET', route: '/Catalog/Priority' }).catch(() => ({ PriorityList: {} })),
    znunyRequest({ webservice: env.znuny.wsTicket, method: 'GET', route: '/Catalog/Service' }).catch(() => ({ ServiceList: {} })),
    znunyRequest({ webservice: env.znuny.wsTicket, method: 'GET', route: '/Catalog/TicketType' }).catch(() => ({ TypeList: {} })),
  ]);

  let slas = [];
  try {
    const authPayload = await resolveZnunyAuth(session);
    const slaRes = await znunyRequest({
      webservice: env.znuny.wsSla,
      method: 'POST',
      route: '/ServiceSLA',
      body: { ...authPayload, Details: 1, Valid: 0 },
      context: 'Catalog::ServiceSLAList',
    });
    const slaMap = new Map();
    for (const svcEntry of slaRes.ServiceSLA || []) {
      for (const s of svcEntry.SLA || []) {
        if (!slaMap.has(Number(s.SLAID))) {
          slaMap.set(Number(s.SLAID), s);
        }
      }
    }
    slas = Array.from(slaMap.values());
  } catch (_ignoreSla) {
    slas = [];
  }

  const catalogs = {
    queues: Object.entries(qRes.QueueList || {})
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    priorities: Object.entries(pRes.PriorityList || {})
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.id - b.id),
    services: Object.entries(sRes.ServiceList || {})
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    types: Object.entries(tRes.TypeList || {}).map(([id, name]) => ({ id: Number(id), name })),
    states: TICKET_STATES,
    slas,
    agents: DEMO_AGENTS,
  };

  return setCached('tickets:catalogs', catalogs, 900, { persist: true });
}

const IN_FLIGHT_TICKET_FETCHES = new Map();

function buildFastCiLookupFromCache() {
  for (const key of listCacheKeys('cmdb:inventory:')) {
    const entry = getCacheEntry(key);
    if (entry && Array.isArray(entry.value) && entry.value.length > 0) {
      return {
        byId: new Map(entry.value.map((c) => [c.id, c])),
        byNumber: new Map(entry.value.map((c) => [c.ciNumber, c])),
      };
    }
  }
  return { byId: new Map(), byNumber: new Map() };
}

function runUpstreamTicketFetch(session, limit, cacheKey) {
  if (IN_FLIGHT_TICKET_FETCHES.has(cacheKey)) {
    return IN_FLIGHT_TICKET_FETCHES.get(cacheKey);
  }

  const workPromise = (async () => {
    const authPayload = await resolveZnunyAuth(session);

    // Fetch recent + open tickets from portal_with_catalogue POST /Ticket/Search
    const searchRes = await znunyRequest({
      webservice: env.znuny.wsTicket,
      method: 'POST',
      route: '/Ticket/Search',
      body: {
        ...authPayload,
        Limit: limit,
        OrderBy: 'Down',
        SortBy: 'Changed',
      },
      context: 'Ticket::TicketSearch',
    });

    const ids = Array.isArray(searchRes.TicketID)
      ? searchRes.TicketID
      : searchRes.TicketID
      ? [searchRes.TicketID]
      : [];

    if (ids.length === 0) {
      return setCached(cacheKey, [], 180, { persist: true });
    }

    // Non-blocking lookup against warm CMDB cache so tickets never stall waiting on 16 CMDB searches
    const ciLookup = buildFastCiLookupFromCache();

    // Batch 150 IDs per TicketGet call (2 HTTP calls total instead of 8!)
    const idChunks = chunkArray(ids, 150);
    const tickets = [];
    const groups = chunkArray(idChunks, 2);

    for (const grp of groups) {
      const batchRes = await Promise.all(
        grp.map(async (chunk) => {
          const res = await znunyRequest({
            webservice: env.znuny.wsTicket,
            method: 'GET',
            route: `/Ticket/${chunk.join(',')}`,
            params: { ...authPayload, DynamicFields: 1, Extended: 1 },
            context: 'Ticket::TicketGet(batch)',
          });
          return Array.isArray(res.Ticket) ? res.Ticket : res.Ticket ? [res.Ticket] : [];
        })
      );
      for (const list of batchRes) {
        for (const raw of list) {
          tickets.push(normalizeZnunyTicket(raw, ciLookup));
        }
      }
    }

    return setCached(cacheKey, tickets, 180, { persist: true });
  })();

  IN_FLIGHT_TICKET_FETCHES.set(cacheKey, workPromise);
  workPromise.finally(() => {
    IN_FLIGHT_TICKET_FETCHES.delete(cacheKey);
  });

  return workPromise;
}

async function fetchLiveTickets(session, { limit = 150, forceRefresh = false } = {}) {
  const cacheKey = `tickets:list:${limit}`;
  if (!forceRefresh) {
    const entry = getCacheEntry(cacheKey);
    if (entry) {
      if (entry.isStale) {
        runUpstreamTicketFetch(session, limit, cacheKey).catch(() => {});
      }
      return entry.value;
    }
  }

  return runUpstreamTicketFetch(session, limit, cacheKey);
}

async function getRawTicketList(session, { forceRefresh = false } = {}) {
  if (session.mode === 'demo') {
    const { tickets, relationships, cis } = getDemoState();
    const ciMap = new Map(cis.map((c) => [c.id, c]));
    return tickets.map((t) => {
      const linked = relationships
        .filter((r) => r.sourceType === 'Ticket' && Number(r.sourceId) === t.id && r.targetType === 'ITSMConfigItem')
        .map((r) => ciMap.get(Number(r.targetId)))
        .filter(Boolean)
        .map((c) => ({
          id: c.id,
          ciNumber: c.ciNumber,
          name: c.name,
          className: c.className,
          inciState: c.inciState,
          deplState: c.deplState,
          location: c.location,
        }));
      return { ...t, linkedCIs: linked };
    });
  }
  return fetchLiveTickets(session, { forceRefresh });
}

async function listTickets(session, query = {}) {
  const forceRefresh = String(query.refresh) === 'true';
  const allTickets = await getRawTicketList(session, { forceRefresh });

  const facets = {
    states: Array.from(new Set(allTickets.map((t) => t.state))).sort(),
    priorities: Array.from(new Set(allTickets.map((t) => t.priority))).sort(),
    queues: Array.from(new Set(allTickets.map((t) => t.queue).filter(Boolean))).sort(),
    customers: Array.from(new Set(allTickets.map((t) => t.customer).filter((c) => c && c !== '—'))).sort(),
    owners: Array.from(new Set(allTickets.map((t) => t.owner).filter(Boolean))).sort(),
  };

  let filtered = [...allTickets];

  if (query.state && query.state !== 'ALL') {
    if (query.state === 'OPEN_ACTIVE') {
      filtered = filtered.filter((t) => !t.state.toLowerCase().includes('closed') && t.state !== 'merged' && t.state !== 'removed');
    } else {
      filtered = filtered.filter((t) => t.state.toLowerCase() === String(query.state).toLowerCase());
    }
  }
  if (query.priority && query.priority !== 'ALL') {
    filtered = filtered.filter((t) => t.priority === query.priority);
  }
  if (query.queue && query.queue !== 'ALL') {
    filtered = filtered.filter((t) => t.queue === query.queue);
  }
  if (query.customer && query.customer !== 'ALL') {
    const c = String(query.customer).toLowerCase();
    filtered = filtered.filter((t) => t.customer.toLowerCase().includes(c));
  }
  if (query.owner && query.owner !== 'ALL') {
    filtered = filtered.filter((t) => t.owner === query.owner);
  }
  if (query.slaStatus && query.slaStatus !== 'ALL') {
    filtered = filtered.filter((t) => t.slaStatus === query.slaStatus);
  }
  if (query.ciId) {
    const targetCiId = Number(query.ciId);
    filtered = filtered.filter((t) => (t.linkedCIs || []).some((c) => c.id === targetCiId));
  }
  if (query.search && String(query.search).trim() !== '') {
    const q = String(query.search).trim().toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        t.customerUser.toLowerCase().includes(q) ||
        t.owner.toLowerCase().includes(q) ||
        t.queue.toLowerCase().includes(q)
    );
  }

  const sortBy = query.sortBy || 'updated';
  const dir = query.sortOrder === 'ascend' || query.sortOrder === 'asc' ? 1 : -1;
  filtered.sort((a, b) => String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? ''), undefined, { numeric: true }) * dir);

  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize || 25)));
  const start = (page - 1) * pageSize;
  const paginated = query.exportAll === 'true' ? filtered : filtered.slice(start, start + pageSize);

  return {
    mode: session.mode,
    items: paginated,
    total: filtered.length,
    totalUnfiltered: allTickets.length,
    page,
    pageSize,
    facets,
  };
}

async function getTicketById(session, ticketId) {
  const numericId = Number(ticketId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new ApiError(400, 'Invalid Ticket ID.', 'INVALID_TICKET_ID');
  }

  if (session.mode === 'demo') {
    const all = await getRawTicketList(session);
    const found = all.find((t) => t.id === numericId);
    if (!found) throw new ApiError(404, `Ticket #${numericId} not found.`, 'TICKET_NOT_FOUND');
    return found;
  }

  const authPayload = await resolveZnunyAuth(session);
  const [ticketRes, historyRes] = await Promise.all([
    znunyRequest({
      webservice: env.znuny.wsTicket,
      method: 'GET',
      route: `/Ticket/${numericId}`,
      params: {
        ...authPayload,
        DynamicFields: 1,
        Extended: 1,
        AllArticles: 1,
        Attachments: 1,
        GetAttachmentContents: 0,
      },
      context: `Ticket::TicketGet(${numericId})`,
    }),
    znunyRequest({
      webservice: env.znuny.wsTicket,
      method: 'GET',
      route: `/Ticket/History/${numericId}`,
      params: authPayload,
      context: `Ticket::TicketHistoryGet(${numericId})`,
    }).catch(() => ({ TicketHistory: [] })),
  ]);

  const raw = Array.isArray(ticketRes.Ticket) ? ticketRes.Ticket[0] : ticketRes.Ticket;
  if (!raw) throw new ApiError(404, `Ticket #${numericId} not found in Znuny.`, 'TICKET_NOT_FOUND');

  let ciLookup = { byId: new Map(), byNumber: new Map() };
  try {
    const cis = await getRawInventoryList(session, { includeComponents: false });
    ciLookup = {
      byId: new Map(cis.map((c) => [c.id, c])),
      byNumber: new Map(cis.map((c) => [c.ciNumber, c])),
    };
  } catch (_ignore) {
    // Non-blocking
  }

  const normalized = normalizeZnunyTicket(raw, ciLookup);

  // Extract TicketHistory entries
  const histEntry = Array.isArray(historyRes.TicketHistory) ? historyRes.TicketHistory[0] : null;
  const rawHist = Array.isArray(histEntry?.History) ? histEntry.History : [];
  normalized.history = rawHist.slice(-50).reverse().map((h) => ({
    timestamp: h.CreateTime || '',
    action: h.HistoryType || 'Event',
    actor: `Agent #${h.CreateBy || 1}`,
    detail: String(h.Name || '').replace(/%%/g, ' -> '),
  }));

  return normalized;
}

/**
 * Downloads a single attachment via custom `Ticket::ArticleAttachmentGet` on `portal_with_catalogue`.
 */
async function downloadTicketAttachment(session, { ticketId, articleId, attachmentId }) {
  if (session.mode === 'demo') {
    const ticket = await getTicketById(session, ticketId);
    const art = (ticket.articles || []).find((a) => a.articleId === Number(articleId));
    const att = (art?.attachments || []).find((x) => x.attachmentId === Number(attachmentId));
    if (!att) throw new ApiError(404, 'Attachment not found.', 'ATTACHMENT_NOT_FOUND');
    return {
      filename: att.filename,
      contentType: att.contentType,
      contentBase64: att.contentBase64 || Buffer.from('Demo attachment content').toString('base64'),
    };
  }

  const authPayload = await resolveZnunyAuth(session);
  const res = await znunyRequest({
    webservice: env.znuny.wsTicket,
    method: 'GET',
    route: `/Ticket/Article/${Number(articleId)}/Attachment/${Number(attachmentId)}`,
    params: authPayload,
    context: 'Ticket::ArticleAttachmentGet',
  });
  const att = res.Attachment;
  if (!att || !att.Content) {
    throw new ApiError(404, 'Attachment content not found.', 'ATTACHMENT_NOT_FOUND');
  }
  return {
    filename: att.Filename || `attachment-${attachmentId}`,
    contentType: att.ContentType || 'application/octet-stream',
    contentBase64: att.Content,
  };
}

async function createTicket(session, payload) {
  const {
    title,
    queue = 'Server',
    priority = '3 Major',
    state = 'new',
    customerUser,
    customer,
    owner,
    responsible,
    service,
    sla,
    article = {},
    linkedCiIds = [],
  } = payload;

  if (!title || String(title).trim().length < 3) {
    throw new ApiError(400, 'Ticket Subject/Title is required.', 'MISSING_TICKET_TITLE');
  }
  if (!article.body || String(article.body).trim().length < 3) {
    throw new ApiError(400, 'Initial article message body is required when creating a ticket.', 'MISSING_ARTICLE_BODY');
  }

  if (session.mode === 'demo') {
    const created = addDemoTicket({
      title: String(title).trim(),
      queue,
      priority,
      state,
      customer,
      customerUser,
      owner: owner || session.userLogin,
      responsible,
      service,
      sla,
      article,
      linkedCiIds,
      actor: session.userLogin,
    });
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'TICKET_CREATE',
      recordType: 'Ticket',
      recordId: created.ticketNumber,
      recordLabel: created.title,
      previousValue: null,
      newValue: { queue, priority, state, linkedCiIds },
    });
    // Return the enriched ticket (incl. linkedCIs) so the UI gets the same shape as GET /tickets/:id
    return getTicketById(session, created.id);
  }

  const authPayload = await resolveZnunyAuth(session);

  // Embed structured `[CI: #<ciNumber>]` tag in article body if CIs are linked so traceability persists even without Link::LinkCreate
  let bodyWithRefs = String(article.body).trim();
  if (Array.isArray(linkedCiIds) && linkedCiIds.length > 0) {
    const cis = await getRawInventoryList(session, { includeComponents: false });
    const ciMap = new Map(cis.map((c) => [c.id, c]));
    const refLines = linkedCiIds
      .map((id) => ciMap.get(Number(id)))
      .filter(Boolean)
      .map((c) => `[CI: #${c.ciNumber}] ${c.name} (${c.className})`);
    if (refLines.length > 0) {
      bodyWithRefs += `\n\n---\nAffected Infrastructure CIs:\n${refLines.join('\n')}`;
    }
  }

  const znunyTicket = {
    Title: String(title).trim(),
    Queue: queue,
    State: state,
    Priority: priority,
    CustomerUser: customerUser || session.email || session.userLogin,
    ...(customer ? { CustomerID: customer } : {}),
    ...(owner ? { Owner: owner } : {}),
    ...(responsible ? { Responsible: responsible } : {}),
    ...(service ? { Service: service } : {}),
    ...(sla ? { SLA: sla } : {}),
  };

  const znunyArticle = {
    CommunicationChannel: article.isVisibleForCustomer ? 'Email' : 'Internal',
    IsVisibleForCustomer: article.isVisibleForCustomer ? 1 : 0,
    SenderType: 'agent',
    Subject: article.subject || String(title).trim(),
    Body: bodyWithRefs,
    ContentType: 'text/plain; charset=utf8',
  };

  const res = await znunyRequest({
    webservice: env.znuny.wsTicket,
    method: 'POST',
    route: '/Ticket',
    body: {
      ...authPayload,
      Ticket: znunyTicket,
      Article: znunyArticle,
    },
    context: 'Ticket::TicketCreate',
  });

  if (!res.TicketID) {
    throw new ApiError(502, 'Znuny did not confirm TicketID after creation.', 'ZNUNY_UNCONFIRMED');
  }

  invalidateCachePrefix('tickets:');
  const created = await getTicketById(session, res.TicketID);

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: 'TICKET_CREATE',
    recordType: 'Ticket',
    recordId: res.TicketNumber || String(res.TicketID),
    recordLabel: created.title,
    previousValue: null,
    newValue: { id: res.TicketID, ticketNumber: res.TicketNumber, queue, priority, state },
  });

  return created;
}

async function updateTicket(session, ticketId, payload) {
  const existing = await getTicketById(session, ticketId);

  if (session.mode === 'demo') {
    const updated = updateDemoTicket(existing.id, {
      ...payload,
      actor: session.userLogin,
    });
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: payload.article?.body ? 'TICKET_ARTICLE_ADD' : 'TICKET_UPDATE',
      recordType: 'Ticket',
      recordId: existing.ticketNumber,
      recordLabel: updated.title,
      previousValue: { state: existing.state, priority: existing.priority, queue: existing.queue, owner: existing.owner },
      newValue: { state: updated.state, priority: updated.priority, queue: updated.queue, owner: updated.owner, addedArticle: Boolean(payload.article?.body) },
    });
    return getTicketById(session, updated.id);
  }

  const authPayload = await resolveZnunyAuth(session);
  const ticketPatch = {};
  if (payload.title) ticketPatch.Title = String(payload.title).trim();
  if (payload.queue) ticketPatch.Queue = payload.queue;
  if (payload.state) ticketPatch.State = payload.state;
  if (payload.priority) ticketPatch.Priority = payload.priority;
  if (payload.owner) ticketPatch.Owner = payload.owner;
  if (payload.responsible) ticketPatch.Responsible = payload.responsible;
  if (payload.service !== undefined && payload.service !== '') ticketPatch.Service = payload.service;
  if (payload.sla !== undefined && payload.sla !== '') ticketPatch.SLA = payload.sla;

  const requestBody = { ...authPayload };
  if (Object.keys(ticketPatch).length > 0) {
    requestBody.Ticket = ticketPatch;
  }

  if (payload.article && payload.article.body) {
    let bodyText = String(payload.article.body).trim();
    if (Array.isArray(payload.linkedCiIds) && payload.linkedCiIds.length > 0) {
      const cis = await getRawInventoryList(session, { includeComponents: false });
      const ciMap = new Map(cis.map((c) => [c.id, c]));
      const refs = payload.linkedCiIds
        .map((id) => ciMap.get(Number(id)))
        .filter(Boolean)
        .map((c) => `[CI: #${c.ciNumber}] ${c.name}`);
      if (refs.length > 0) {
        bodyText += `\n\n---\nAssociated CIs: ${refs.join(', ')}`;
      }
    }
    requestBody.Article = {
      CommunicationChannel: payload.article.isVisibleForCustomer ? 'Email' : 'Internal',
      IsVisibleForCustomer: payload.article.isVisibleForCustomer ? 1 : 0,
      SenderType: 'agent',
      Subject: payload.article.subject || (payload.article.isVisibleForCustomer ? `Re: ${existing.title}` : 'Internal Operations Update'),
      Body: bodyText,
      ContentType: 'text/plain; charset=utf8',
    };
  }

  const res = await znunyRequest({
    webservice: env.znuny.wsTicket,
    method: 'PATCH',
    route: `/Ticket/${existing.id}`,
    body: requestBody,
    context: `Ticket::TicketUpdate(${existing.id})`,
  });

  if (!res.TicketID) {
    throw new ApiError(502, 'Znuny did not confirm TicketID after update.', 'ZNUNY_UNCONFIRMED');
  }

  invalidateCachePrefix('tickets:');
  const updated = await getTicketById(session, existing.id);

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: payload.article?.body ? 'TICKET_ARTICLE_ADD' : 'TICKET_UPDATE',
    recordType: 'Ticket',
    recordId: existing.ticketNumber,
    recordLabel: updated.title,
    previousValue: { state: existing.state, priority: existing.priority, queue: existing.queue, owner: existing.owner },
    newValue: { state: updated.state, priority: updated.priority, queue: updated.queue, owner: updated.owner },
  });

  return updated;
}

module.exports = {
  getTicketCatalogs,
  getRawTicketList,
  listTickets,
  getTicketById,
  downloadTicketAttachment,
  createTicket,
  updateTicket,
};
