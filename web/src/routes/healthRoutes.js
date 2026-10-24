const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

router.get('/simulate-500', (req, res, next) => {
  const err = new Error('Simulated internal server error for LogQL Q1 verification');
  next(err);
});

module.exports = router;
