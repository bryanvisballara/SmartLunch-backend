const express = require('express');
const bcrypt = require('bcryptjs');

const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/user.model');
const { signAccessToken } = require('../utils/token');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { schoolId, name, email, phone, password, role } = req.body;

    if (!schoolId || !name || !email || !password || !role) {
      return res.status(400).json({ message: 'schoolId, name, email, password and role are required' });
    }

    if (!['parent', 'admin', 'vendor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      schoolId,
      name,
      email: email.toLowerCase().trim(),
      phone,
      passwordHash,
      role,
    });

    const token = signAccessToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        schoolId: user.schoolId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), status: 'active', deletedAt: null });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signAccessToken(user);

    return res.status(200).json({
      token,
      user: {
        id: user._id,
        schoolId: user.schoolId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
