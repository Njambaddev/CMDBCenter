const {
  getSchemasMetadata,
  listCIs,
  getCIById,
  createCI,
  updateCI,
  deleteCI,
  previewBulkImport,
  executeBulkImport,
  executeBulkUpdate,
} = require('../services/cmdbService');
const {
  buildZnunyClassYaml,
  createOrUpdateCmdbClass,
  syncClassesFromZnuny,
} = require('../services/znunyClassService');
const { getCIRelationships } = require('../services/relationshipService');

async function getSchemas(_req, res, next) {
  try {
    return res.json({
      success: true,
      data: getSchemasMetadata(),
    });
  } catch (err) {
    return next(err);
  }
}

async function listInventory(req, res, next) {
  try {
    const result = await listCIs(req.session, req.query);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function getCIDetail(req, res, next) {
  try {
    const ci = await getCIById(req.session, req.params.id);

    // Enrich CI detail with parent/child/dependency relationships
    let relationships = { linkApiSupported: false, parents: [], children: [], associatedTickets: [] };

    try {
      relationships = await getCIRelationships(req.session, ci.id);
    } catch (_relErr) {
      // Non-blocking
    }

    return res.json({
      success: true,
      data: {
        ...ci,
        relationships,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function createConfigItem(req, res, next) {
  try {
    const created = await createCI(req.session, req.body || {});
    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateConfigItem(req, res, next) {
  try {
    const updated = await updateCI(req.session, req.params.id, req.body || {});
    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteConfigItem(req, res, next) {
  try {
    const result = await deleteCI(req.session, req.params.id);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function bulkPreview(req, res, next) {
  try {
    const report = await previewBulkImport(req.session, req.body || {});
    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    return next(err);
  }
}

async function bulkImport(req, res, next) {
  try {
    const report = await executeBulkImport(req.session, req.body || {});
    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    return next(err);
  }
}

async function bulkUpdate(req, res, next) {
  try {
    const report = await executeBulkUpdate(req.session, req.body || {});
    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    return next(err);
  }
}

async function previewClassYaml(req, res, next) {
  try {
    const yaml = buildZnunyClassYaml(req.body?.fields || []);
    return res.json({
      success: true,
      data: { yaml },
    });
  } catch (err) {
    return next(err);
  }
}

async function createClass(req, res, next) {
  try {
    const created = await createOrUpdateCmdbClass(req.session, req.body || {}, { allowExistingUpdate: false });
    return res.status(201).json({
      success: true,
      data: {
        classSchema: created,
        schemas: getSchemasMetadata(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateClassSchema(req, res, next) {
  try {
    const payload = { ...(req.body || {}), name: req.params.className };
    const updated = await createOrUpdateCmdbClass(req.session, payload, { allowExistingUpdate: true });
    return res.json({
      success: true,
      data: {
        classSchema: updated,
        schemas: getSchemasMetadata(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function syncClasses(req, res, next) {
  try {
    const result = await syncClassesFromZnuny(req.session, req.body || {});
    return res.json({
      success: true,
      data: {
        ...result,
        schemas: getSchemasMetadata(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSchemas,
  previewClassYaml,
  createClass,
  updateClassSchema,
  syncClasses,
  listInventory,
  getCIDetail,
  createConfigItem,
  updateConfigItem,
  deleteConfigItem,
  bulkPreview,
  bulkImport,
  bulkUpdate,
};
