const express = require('express');
const { check } = require('express-validator');
const { protect, admin, staff } = require('../middleware/authMiddleware');
const {
  getMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
  getFeaturedMovies,
  getUpcomingMovies,
  getMoviesByGenre,
  searchMovies
} = require('../controllers/movieController');

const {
  getMovieShowtimes,
  getTheaterMovies,
  getNowShowingMovies,
  getMovieAvailability
} = require('../controllers/showtimeController');

const router = express.Router();

// @route   GET /api/movies
// @desc    Get all movies with optional filtering and pagination
// @access  Public
router.get('/', [
  check('page', 'Page must be a number').optional().isInt({ min: 1 }),
  check('limit', 'Limit must be a number between 1 and 50').optional().isInt({ min: 1, max: 50 }),
  check('genre', 'Genre must be a string').optional().isString(),
  check('rating', 'Rating must be a number between 0 and 10').optional().isFloat({ min: 0, max: 10 }),
  check('status', 'Status must be showing, upcoming, or ended').optional().isIn(['showing', 'upcoming', 'ended'])
], getMovies);

// @route   GET /api/movies/search
// @desc    Search movies by title, director, or cast
// @access  Public
router.get('/search', [
  check('q', 'Search query is required').notEmpty(),
  check('page', 'Page must be a number').optional().isInt({ min: 1 }),
  check('limit', 'Limit must be a number between 1 and 50').optional().isInt({ min: 1, max: 50 })
], searchMovies);

// @route   GET /api/movies/featured
// @desc    Get featured movies
// @access  Public
router.get('/featured', getFeaturedMovies);

// @route   GET /api/movies/now-showing
// @desc    Get currently showing movies with showtimes
// @access  Public
router.get('/now-showing', getNowShowingMovies);

// @route   GET /api/movies/upcoming
// @desc    Get upcoming movies
// @access  Public
router.get('/upcoming', getUpcomingMovies);

// @route   GET /api/movies/genre/:genre
// @desc    Get movies by genre with pagination
// @access  Public
router.get('/genre/:genre', [
  check('page', 'Page must be a number').optional().isInt({ min: 1 }),
  check('limit', 'Limit must be a number between 1 and 50').optional().isInt({ min: 1, max: 50 })
], getMoviesByGenre);

// @route   GET /api/movies/theater/:theaterId
// @desc    Get movies showing at a specific theater
// @access  Public
router.get('/theater/:theaterId', [
  check('date', 'Date must be a valid date').optional().isISO8601()
], getTheaterMovies);

// @route   GET /api/movies/:id
// @desc    Get single movie by ID with details
// @access  Public
router.get('/:id', getMovieById);

// @route   GET /api/movies/:id/showtimes
// @desc    Get showtimes for a specific movie
// @access  Public
router.get('/:id/showtimes', [
  check('date', 'Date must be a valid date').optional().isISO8601(),
  check('theaterId', 'Theater ID must be a valid ID').optional().isMongoId()
], getMovieShowtimes);

// @route   GET /api/movies/:id/availability
// @desc    Check seat availability for a movie
// @access  Public
router.get('/:id/availability', [
  check('showtimeId', 'Showtime ID is required').isMongoId(),
  check('date', 'Date is required').isISO8601()
], getMovieAvailability);

// @route   POST /api/movies
// @desc    Create a new movie (Admin)
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  [
    check('title', 'Title is required').notEmpty(),
    check('duration', 'Duration is required and must be a number (minutes)').isInt({ min: 1 }),
    check('description', 'Description is required').notEmpty(),
    check('director', 'Director is required').notEmpty(),
    check('cast', 'Cast must be an array').optional().isArray(),
    check('genres', 'Genres must be an array').isArray({ min: 1 }),
    check('releaseDate', 'Release date is required').isISO8601(),
    check('endDate', 'End date must be after release date')
      .optional()
      .custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.releaseDate)) {
          throw new Error('End date must be after release date');
        }
        return true;
      }),
    check('rating', 'Rating must be a number between 0 and 10').optional().isFloat({ min: 0, max: 10 }),
    check('posterUrl', 'Poster URL must be a valid URL').optional().isURL(),
    check('trailerUrl', 'Trailer URL must be a valid URL').optional().isURL()
  ],
  createMovie
);

// @route   PUT /api/movies/:id
// @desc    Update a movie (Admin)
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  [
    check('title', 'Title cannot be empty').optional().notEmpty(),
    check('duration', 'Duration must be a positive number').optional().isInt({ min: 1 }),
    check('genres', 'Genres must be an array').optional().isArray({ min: 1 }),
    check('releaseDate', 'Invalid release date').optional().isISO8601(),
    check('endDate', 'Invalid end date').optional().isISO8601()
  ],
  updateMovie
);

// @route   DELETE /api/movies/:id
// @desc    Delete a movie (Admin)
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteMovie);

module.exports = router;
