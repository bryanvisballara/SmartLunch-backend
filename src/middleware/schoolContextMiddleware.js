const { extractSchoolIdFromRequest, runWithSchoolContext } = require('../config/db');

function schoolContextMiddleware(req, _res, next) {
  const schoolId = extractSchoolIdFromRequest(req);
  return runWithSchoolContext(schoolId, next);
}

module.exports = schoolContextMiddleware;