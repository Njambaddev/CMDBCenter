const {
  getTopologyGraph,
  getCIRelationships,
  createRelationship,
  deleteRelationship,
} = require('../services/relationshipService');

async function getGraph(req, res, next) {
  try {
    const includeComponents = String(req.query.includeComponents) === 'true';
    const graph = await getTopologyGraph(req.session, { includeComponents });
    return res.json({
      success: true,
      data: graph,
    });
  } catch (err) {
    return next(err);
  }
}

async function getForCI(req, res, next) {
  try {
    const data = await getCIRelationships(req.session, req.params.id);
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function createLink(req, res, next) {
  try {
    const created = await createRelationship(req.session, req.body || {});
    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

async function removeLink(req, res, next) {
  try {
    const deleted = await deleteRelationship(req.session, req.params.id, req.body || {});
    return res.json({
      success: true,
      data: deleted,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getGraph,
  getForCI,
  createLink,
  removeLink,
};
