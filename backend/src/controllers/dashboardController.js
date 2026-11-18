const {
  computeCmdbStatistics,
  computeLocationSummaries,
  computeTicketStatistics,
  getDashboardSummary,
} = require('../services/analyticsService');
const { getRawInventoryList, matchesLocationFilter } = require('../services/cmdbService');
const { getRawTicketList } = require('../services/ticketService');

async function getSummary(req, res, next) {
  try {
    const includeComponents = String(req.query.includeComponents) === 'true';
    const forceRefresh = String(req.query.refresh) === 'true';
    const location = req.query.location || 'ALL';
    const summary = await getDashboardSummary(req.session, { includeComponents, location, forceRefresh });
    return res.json({
      success: true,
      data: summary,
    });
  } catch (err) {
    return next(err);
  }
}

async function getCmdbStats(req, res, next) {
  try {
    const includeComponents = String(req.query.includeComponents) === 'true';
    const forceRefresh = String(req.query.refresh) === 'true';
    const location = req.query.location || 'ALL';
    const allCis = await getRawInventoryList(req.session, { includeComponents, forceRefresh });
    const locationSummaries = computeLocationSummaries(allCis);
    const scopedCis =
      location && location !== 'ALL'
        ? allCis.filter((c) => matchesLocationFilter(c.location, location))
        : allCis;
    const stats = computeCmdbStatistics(scopedCis);
    return res.json({
      success: true,
      data: {
        mode: req.session.mode,
        generatedAt: new Date().toISOString(),
        selectedLocation: location,
        locationSummaries,
        ...stats,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getTicketStats(req, res, next) {
  try {
    const forceRefresh = String(req.query.refresh) === 'true';
    const tickets = await getRawTicketList(req.session, { forceRefresh });
    const stats = computeTicketStatistics(tickets);
    return res.json({
      success: true,
      data: {
        mode: req.session.mode,
        generatedAt: new Date().toISOString(),
        ...stats,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
  getCmdbStats,
  getTicketStats,
};
