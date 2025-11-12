const Schedule = require('../models/Schedule');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');
const Room = require('../models/Room');
const { validationResult } = require('express-validator');
const moment = require('moment');

// @desc    Create a new schedule
// @route   POST /api/schedules
// @access  Private/Staff
exports.createSchedule = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const {
      movieId,
      theaterId,
      roomId,
      startTime,
      endTime,
      price,
      is3d = false,
      hasSubtitles = false,
      isDubbed = false
    } = req.body;

    // Check if movie exists
    const movie = await Movie.findById(movieId);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    // Check if theater exists
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({ message: 'Theater not found' });
    }

    // Check if room exists and belongs to theater
    const room = await Room.findOne({ _id: roomId, theater: theaterId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found in this theater' });
    }

    // Check for schedule conflicts
    const conflict = await Schedule.findOne({
      room: roomId,
      $or: [
        { startTime: { $lt: new Date(endTime) }, endTime: { $gt: new Date(startTime) } }
      ]
    });

    if (conflict) {
      return res.status(400).json({ 
        message: 'Schedule conflict: Another show is already scheduled in this room during the requested time' 
      });
    }

    // Create new schedule
    const schedule = new Schedule({
      movie: movieId,
      theater: theaterId,
      room: roomId,
      startTime,
      endTime,
      price,
      is3d,
      hasSubtitles,
      isDubbed,
      createdBy: req.user.id
    });

    await schedule.save();

    // Populate references for the response
    await schedule.populate('movie', 'title duration posterUrl')
                 .populate('theater', 'name location')
                 .populate('room', 'name capacity')
                 .execPopulate();

    res.status(201).json({
      success: true,
      data: schedule
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all schedules with filtering
// @route   GET /api/schedules
// @access  Public
exports.getSchedules = async (req, res, next) => {
  try {
    const { 
      movieId, 
      theaterId, 
      roomId, 
      date, 
      startTime, 
      endTime,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build query
    const query = {};
    
    if (movieId) query.movie = movieId;
    if (theaterId) query.theater = theaterId;
    if (roomId) query.room = roomId;
    
    // Filter by date
    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.startTime = { $gte: startOfDay, $lte: endOfDay };
    }
    
    // Filter by time range
    if (startTime) {
      const [hours, minutes] = startTime.split(':');
      const start = new Date();
      start.setHours(hours, minutes, 0, 0);
      query.startTime = { ...query.startTime, $gte: start };
    }
    
    if (endTime) {
      const [hours, minutes] = endTime.split(':');
      const end = new Date();
      end.setHours(hours, minutes, 0, 0);
      query.endTime = { ...query.endTime, $lte: end };
    }

    // Execute query with pagination
    const [schedules, count] = await Promise.all([
      Schedule.find(query)
        .populate('movie', 'title duration posterUrl')
        .populate('theater', 'name location')
        .populate('room', 'name capacity')
        .sort({ startTime: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      Schedule.countDocuments(query)
    ]);

    const totalPages = Math.ceil(count / limit);
    const hasMore = page < totalPages;

    res.status(200).json({
      success: true,
      count: schedules.length,
      total: count,
      totalPages,
      currentPage: parseInt(page),
      hasMore,
      data: schedules
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get schedule by ID
// @route   GET /api/schedules/:id
// @access  Public
exports.getScheduleById = async (req, res, next) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate('movie', 'title duration posterUrl')
      .populate('theater', 'name location')
      .populate('room', 'name capacity')
      .populate('createdBy', 'name email');

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (err) {
    console.error(err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update a schedule
// @route   PUT /api/schedules/:id
// @access  Private/Staff
exports.updateSchedule = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    let schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    // Check for schedule conflicts (excluding current schedule)
    if (req.body.startTime || req.body.endTime || req.body.roomId) {
      const start = req.body.startTime ? new Date(req.body.startTime) : schedule.startTime;
      const end = req.body.endTime ? new Date(req.body.endTime) : schedule.endTime;
      const room = req.body.roomId || schedule.room;

      const conflict = await Schedule.findOne({
        _id: { $ne: schedule._id },
        room,
        $or: [
          { startTime: { $lt: end }, endTime: { $gt: start } }
        ]
      });

      if (conflict) {
        return res.status(400).json({ 
          message: 'Schedule conflict: Another show is already scheduled in this room during the requested time' 
        });
      }
    }

    // Update fields
    const updates = {};
    const allowedUpdates = [
      'startTime', 'endTime', 'price', 'is3d', 'hasSubtitles', 'isDubbed', 'isActive'
    ];

    allowedUpdates.forEach(update => {
      if (req.body[update] !== undefined) {
        updates[update] = req.body[update];
      }
    });

    schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('movie', 'title duration posterUrl')
      .populate('theater', 'name location')
      .populate('room', 'name capacity');

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete a schedule
// @route   DELETE /api/schedules/:id
// @access  Private/Admin
exports.deleteSchedule = async (req, res, next) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    // Check if there are any bookings for this schedule
    const bookingCount = await Booking.countDocuments({ schedule: schedule._id });
    
    if (bookingCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete schedule with existing bookings. Cancel the bookings first.'
      });
    }

    await schedule.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error(err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get schedules by movie
// @route   GET /api/schedules/movie/:movieId
// @access  Public
exports.getSchedulesByMovie = async (req, res, next) => {
  try {
    const { movieId } = req.params;
    const { date, theaterId } = req.query;
    const now = new Date();

    const query = { 
      movie: movieId,
      startTime: { $gte: now } // Only future schedules
    };

    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.startTime = { ...query.startTime, $gte: startOfDay, $lte: endOfDay };
    }

    if (theaterId) {
      query.theater = theaterId;
    }

    const schedules = await Schedule.find(query)
      .populate('theater', 'name location')
      .populate('room', 'name')
      .sort({ startTime: 1 });

    // Group by date and theater
    const result = schedules.reduce((acc, schedule) => {
      const dateKey = schedule.startTime.toISOString().split('T')[0];
      const theaterId = schedule.theater._id.toString();
      
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      
      const theaterIndex = acc[dateKey].findIndex(t => t.theater._id.toString() === theaterId);
      
      if (theaterIndex === -1) {
        acc[dateKey].push({
          theater: schedule.theater,
          times: [{
            _id: schedule._id,
            time: schedule.startTime,
            room: schedule.room,
            price: schedule.price,
            is3d: schedule.is3d,
            hasSubtitles: schedule.hasSubtitles,
            isDubbed: schedule.isDubbed
          }]
        });
      } else {
        acc[dateKey][theaterIndex].times.push({
          _id: schedule._id,
          time: schedule.startTime,
          room: schedule.room,
          price: schedule.price,
          is3d: schedule.is3d,
          hasSubtitles: schedule.hasSubtitles,
          isDubbed: schedule.isDubbed
        });
      }
      
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error(err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid movie ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get schedules by theater
// @route   GET /api/schedules/theater/:theaterId
// @access  Public
exports.getSchedulesByTheater = async (req, res, next) => {
  try {
    const { theaterId } = req.params;
    const { date, movieId } = req.query;
    const now = new Date();

    const query = { 
      theater: theaterId,
      startTime: { $gte: now } // Only future schedules
    };

    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.startTime = { ...query.startTime, $gte: startOfDay, $lte: endOfDay };
    }

    if (movieId) {
      query.movie = movieId;
    }

    const schedules = await Schedule.find(query)
      .populate('movie', 'title duration posterUrl')
      .populate('room', 'name')
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules
    });
  } catch (err) {
    console.error(err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid theater ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get available time slots for scheduling
// @route   GET /api/schedules/available-times
// @access  Private/Staff
exports.getAvailableTimeSlots = async (req, res, next) => {
  try {
    const { theaterId, roomId, date, duration } = req.query;
    const durationMinutes = parseInt(duration);
    
    if (!theaterId || !roomId || !date || isNaN(durationMinutes)) {
      return res.status(400).json({
        success: false,
        message: 'Theater ID, room ID, date, and duration are required'
      });
    }

    // Convert date string to Date object
    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate);
    const endOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all scheduled shows for the room on the selected day
    const scheduledShows = await Schedule.find({
      room: roomId,
      $or: [
        { startTime: { $gte: startOfDay, $lte: endOfDay } },
        { endTime: { $gte: startOfDay, $lte: endOfDay } },
        { 
          $and: [
            { startTime: { $lte: startOfDay } },
            { endTime: { $gte: endOfDay } }
          ]
        }
      ]
    }).sort({ startTime: 1 });

    // Theater operating hours (example: 9 AM to 11 PM)
    const openTime = new Date(selectedDate);
    openTime.setHours(9, 0, 0, 0);
    
    const closeTime = new Date(selectedDate);
    closeTime.setHours(23, 0, 0, 0);

    // Generate 30-minute time slots within operating hours
    const timeSlots = [];
    let currentTime = new Date(openTime);
    
    while (currentTime < closeTime) {
      const slotEnd = new Date(currentTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);
      
      if (slotEnd <= closeTime) {
        timeSlots.push({
          start: new Date(currentTime),
          end: new Date(slotEnd)
        });
      }
      
      currentTime.setMinutes(currentTime.getMinutes() + 30); // Next slot starts 30 minutes after previous start
    }

    // Filter out unavailable time slots
    const availableSlots = timeSlots.filter(slot => {
      return !scheduledShows.some(show => {
        return (
          (slot.start >= show.startTime && slot.start < show.endTime) ||
          (slot.end > show.startTime && slot.end <= show.endTime) ||
          (slot.start <= show.startTime && slot.end >= show.endTime)
        );
      });
    });

    res.status(200).json({
      success: true,
      data: availableSlots.map(slot => ({
        startTime: slot.start,
        endTime: slot.end,
        formattedTime: `${slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${slot.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
