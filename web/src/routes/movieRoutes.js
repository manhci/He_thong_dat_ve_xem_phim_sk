const express = require('express');
const router = express.Router();
const movieController = require('../controllers/movieController');

router.get('/', movieController.getHome);
router.get('/events/:id', movieController.getEventDetail);

module.exports = router;
