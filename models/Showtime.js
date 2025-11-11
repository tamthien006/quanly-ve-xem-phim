const mongoose = require('mongoose');

const showtimeSchema = new mongoose.Schema({
  movie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie',
    required: true
  },
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cinema',
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  availableSeats: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for better query performance
showtimeSchema.index({ movie: 1 });
showtimeSchema.index({ theater: 1 });
showtimeSchema.index({ startTime: 1 });
showtimeSchema.index({ endTime: 1 });

// Virtual for bookings
showtimeSchema.virtual('bookings', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'showtime',
  justOne: false
});

// Pre-save hook to set endTime if not provided
showtimeSchema.pre('save', async function(next) {
  if (!this.endTime && this.startTime && this.movie) {
    const movie = await mongoose.model('Movie').findById(this.movie);
    if (movie) {
      this.endTime = new Date(this.startTime.getTime() + movie.duration * 60000);
    }
  }
  next();
});

// Static method to get available showtimes
showtimeSchema.statics.findAvailable = function(movieId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    movie: movieId,
    startTime: { $gte: startOfDay, $lte: endOfDay },
    isActive: true
  })
  .populate('theater', 'name address')
  .populate('room', 'name capacity')
  .sort('startTime');
};

const Showtime = mongoose.model('Showtime', showtimeSchema);

module.exports = Showtime;
