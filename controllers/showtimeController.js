const Showtime = require('../models/Showtime');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const { validationResult } = require('express-validator');

// @desc    Get showtimes for a specific movie
// @route   GET /api/movies/:id/showtimes
// @access  Public
exports.getMovieShowtimes = async (req, res, next) => {
  try {
    const { date, city } = req.query;
    const { id } = req.params;

    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Build query
    const query = { movie: id };
    
    // Filter by date if provided
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      query.startTime = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Get showtimes with theater and room details
    const showtimes = await Showtime.find(query)
      .populate({
        path: 'theater',
        select: 'name address city'
      })
      .populate({
        path: 'room',
        select: 'name capacity'
      })
      .sort({ startTime: 1 });

    // Filter by city if provided
    let filteredShowtimes = showtimes;
    if (city) {
      filteredShowtimes = showtimes.filter(st => 
        st.theater.city.toLowerCase() === city.toLowerCase()
      );
    }

    res.status(200).json({
      success: true,
      count: filteredShowtimes.length,
      data: filteredShowtimes
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get movies showing in a specific theater
// @route   GET /api/movies/theater/:theaterId
// @access  Public
exports.getTheaterMovies = async (req, res, next) => {
  try {
    const { theaterId } = req.params;
    const { date = new Date() } = req.query;
    
    // Find all showtimes for this theater after the current time
    const showtimes = await Showtime.find({
      theater: theaterId,
      startTime: { $gte: new Date(date) }
    })
    .populate('movie', 'title posterUrl duration ageRating')
    .sort({ startTime: 1 });

    // Group showtimes by movie
    const moviesMap = new Map();
    
    showtimes.forEach(showtime => {
      if (!moviesMap.has(showtime.movie._id.toString())) {
        moviesMap.set(showtime.movie._id.toString(), {
          ...showtime.movie._doc,
          showtimes: []
        });
      }
      
      const movie = moviesMap.get(showtime.movie._id.toString());
      movie.showtimes.push({
        id: showtime._id,
        startTime: showtime.startTime,
        endTime: showtime.endTime,
        room: showtime.room
      });
    });

    const movies = Array.from(moviesMap.values());

    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get currently showing movies with showtimes
// @route   GET /api/movies/now-showing
// @access  Public
exports.getNowShowingMovies = async (req, res, next) => {
  try {
    const { city, date = new Date() } = req.query;
    
    // Parse the date if it's a string
    const queryDate = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(queryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use ISO 8601 format (e.g., 2025-11-12T00:00:00.000Z)'
      });
    }
    
    // Calculate end date (7 days from query date)
    const endDate = new Date(queryDate);
    endDate.setDate(queryDate.getDate() + 7);
    
    // Find all showtimes within the date range
    const showtimes = await Showtime.find({
      startTime: { 
        $gte: queryDate,
        $lt: endDate
      },
      isActive: true
    })
    .populate({
      path: 'movie',
      match: { status: 'showing' },
      select: 'title posterUrl duration ageRating genres status'
    })
    .populate({
      path: 'theater',
      ...(city && { match: { city: new RegExp(city, 'i') } }),
      select: 'name address city'
    })
    .sort({ 'movie.title': 1, startTime: 1 });

    // Filter out showtimes with no movie (due to status not being 'showing')
    const validShowtimes = showtimes.filter(st => st.movie);
    
    // Group movies with their showtimes
    const moviesMap = new Map();
    
    validShowtimes.forEach(showtime => {
      const movieId = showtime.movie._id.toString();
      
      if (!moviesMap.has(movieId)) {
        moviesMap.set(movieId, {
          ...showtime.movie._doc,
          showtimes: []
        });
      }
      
      const movie = moviesMap.get(movieId);
      movie.showtimes.push({
        id: showtime._id,
        startTime: showtime.startTime,
        endTime: showtime.endTime,
        theater: showtime.theater,
        room: showtime.room
      });
    });

    const movies = Array.from(moviesMap.values());

    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Check movie availability
// @route   GET /api/movies/:id/availability
// @access  Public
exports.getMovieAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, theaterId } = req.query;
    
    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    // Build query
    const query = { movie: id };
    
    // Filter by date if provided
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      query.startTime = {
        $gte: startDate,
        $lt: endDate
      };
    }
    
    // Filter by theater if provided
    if (theaterId) {
      query.theater = theaterId;
    }
    
    // Get showtimes with theater and room details
    const showtimes = await Showtime.find(query)
      .populate({
        path: 'theater',
        select: 'name address city'
      })
      .populate({
        path: 'room',
        select: 'name capacity'
      })
      .sort({ 'theater.name': 1, startTime: 1 });
    
    // Get all bookings for these showtimes to check availability
    const showtimeIds = showtimes.map(st => st._id);
    const bookings = await Booking.find({
      showtime: { $in: showtimeIds },
      status: { $in: ['confirmed', 'pending'] }
    }).select('showtime seats');
    
    // Create a map of showtime ID to booked seats count
    const bookedSeatsMap = new Map();
    bookings.forEach(booking => {
      const count = bookedSeatsMap.get(booking.showtime.toString()) || 0;
      bookedSeatsMap.set(booking.showtime.toString(), count + booking.seats.length);
    });
    
    // Add availability info to each showtime
    const showtimesWithAvailability = showtimes.map(showtime => {
      const bookedSeats = bookedSeatsMap.get(showtime._id.toString()) || 0;
      const availableSeats = showtime.room.capacity - bookedSeats;
      
      return {
        ...showtime.toObject(),
        availableSeats,
        isAvailable: availableSeats > 0,
        bookingUrl: `/api/bookings?showtime=${showtime._id}`
      };
    });
    
    res.status(200).json({
      success: true,
      count: showtimesWithAvailability.length,
      data: showtimesWithAvailability
    });
  } catch (err) {
    next(err);
  }
};
