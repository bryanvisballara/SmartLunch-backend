function roleMiddleware(...roles) {
  const normalizedRoles = roles.flat().filter(Boolean);

  return (req, res, next) => {
    if (!req.user || !normalizedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  };
}

module.exports = roleMiddleware;
