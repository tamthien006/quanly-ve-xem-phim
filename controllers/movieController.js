const Movie = require('../models/Movie');
const Showtime = require('../models/Showtime');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const { validationResult } = require('express-validator');

// @desc    Search movies by title, director, or cast
// @route   GET /api/movies/search
// @access  Public
exports.searchMovies = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const query = {
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { director: { $regex: q, $options: 'i' } },
        { cast: { $in: [new RegExp(q, 'i')] } },
        { genres: { $in: [new RegExp(q, 'i')] } }
      ]
    };

    const [movies, count] = await Promise.all([
      Movie.find(query)
        .sort({ releaseDate: -1, title: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('title posterUrl releaseDate duration genres rating')
        .lean(),
      Movie.countDocuments(query)
    ]);

    const totalPages = Math.ceil(count / limit);
    const hasMore = page < totalPages;

    res.status(200).json({
      success: true,
      count: movies.length,
      total: count,
      totalPages,
      currentPage: parseInt(page),
      hasMore,
      data: movies
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error during search'
    });
  }
};

// @desc    Get all movies with filtering and pagination
// @route   GET /api/movies
// @access  Public
exports.getMovies = async (req, res, next) => {
  try {
    const { 
      status, 
      genre, 
      rating, 
      page = 1, 
      limit = 10,
      sortBy = 'releaseDate',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query object
    const query = {};
    
    // Filter by status if provided
    if (status && ['showing', 'upcoming', 'ended'].includes(status)) {
      const now = new Date();
      if (status === 'showing') {
        query.status = 'showing';
        query.releaseDate = { $lte: now };
        query.endDate = { $gte: now };
      } else if (status === 'upcoming') {
        query.status = 'upcoming';
        query.releaseDate = { $gt: now };
      } else if (status === 'ended') {
        query.status = 'ended';
        query.endDate = { $lt: now };
      }
    }
    
    // Filter by genre if provided
    if (genre) {
      query.genres = { $in: [new RegExp(genre, 'i')] };
    }
    
    // Filter by minimum rating if provided
    if (rating) {
      query.rating = { $gte: parseFloat(rating) };
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const [movies, count] = await Promise.all([
      Movie.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-__v')
        .lean(),
      Movie.countDocuments(query)
    ]);
    
    const totalPages = Math.ceil(count / limit);
    const hasMore = page < totalPages;
    
    res.status(200).json({
      success: true,
      count: movies.length,
      total: count,
      totalPages,
      currentPage: parseInt(page),
      hasMore,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single movie by ID
// @route   GET /api/movies/:id
// @access  Public
exports.getMovieById = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // Populate reviews if needed
    await movie.populate({
      path: 'reviews',
      populate: {
        path: 'userId',
        select: 'name avatar'
      },
      options: {
        sort: { createdAt: -1 },
        limit: 5
      }
    }).execPopulate();
    
    res.status(200).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create a new movie (Admin)
// @route   POST /api/movies
// @access  Private/Admin
exports.createMovie = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    
    const {
      title,
      genre,
      duration,
      description,
      cast,
      director,
      trailer,
      poster,
      status,
      releaseDate
    } = req.body;
    
    // Create movie
    const movie = new Movie({
      title,
      genre: genre || [],
      duration: parseInt(duration) || 0,
      description: description || '',
      cast: cast || [],
      director: director || '',
      trailer: trailer || '',
      poster: poster || 'default-movie.jpg',
      status: status || 'coming',
      releaseDate: releaseDate || new Date()
    });
    
    await movie.save();
    
    res.status(201).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update a movie (Admin)
// @route   PUT /api/movies/:id
// @access  Private/Admin
exports.updateMovie = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    
    const {
      title,
      genre,
      duration,
      description,
      cast,
      director,
      trailer,
      poster,
      status,
      releaseDate
    } = req.body;
    
    let movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // Update fields
    if (title) movie.title = title;
    if (genre) movie.genre = Array.isArray(genre) ? genre : [genre];
    if (duration) movie.duration = parseInt(duration);
    if (description) movie.description = description;
    if (cast) movie.cast = Array.isArray(cast) ? cast : [cast];
    if (director) movie.director = director;
    if (trailer) movie.trailer = trailer;
    if (poster) movie.poster = poster;
    if (status) movie.status = status;
    if (releaseDate) movie.releaseDate = releaseDate;
    
    await movie.save();
    
    res.status(200).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete a movie (Admin)
// @route   DELETE /api/movies/:id
// @access  Private/Admin
exports.deleteMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // In a real app, you might want to check if there are any related records
    // (like schedules, tickets) before deleting
    
    await movie.remove();
    
    res.status(200).json({
      success: true,
      message: 'Movie removed',
      data: {}
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get featured movies
// @route   GET /api/movies/featured
// @access  Public
exports.getFeaturedMovies = async (req, res, next) => {
  try {
    const movies = await Movie.find({ 
      isFeatured: true, 
      status: 'showing',
      releaseDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    })
    .sort({ releaseDate: -1, rating: -1 })
    .limit(5);
      
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get upcoming movies
// @route   GET /api/movies/upcoming
// @access  Public
exports.getUpcomingMovies = async (req, res, next) => {
  try {
    const movies = await Movie.find({ 
      status: 'upcoming',
      releaseDate: { $gte: new Date() }
    })
    .sort({ releaseDate: 1 })
    .limit(5);
    
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get movies by genre
// @route   GET /api/movies/genre/:genre
// @access  Public
exports.getMoviesByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const movies = await Movie.find({ 
      genre: { $regex: genre, $options: 'i' },
      status: 'showing'
    })
    .sort({ releaseDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();
    
    const count = await Movie.countDocuments({ 
      genre: { $regex: genre, $options: 'i' },
      status: 'showing'
    });
    
    res.status(200).json({
      success: true,
      count: movies.length,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
