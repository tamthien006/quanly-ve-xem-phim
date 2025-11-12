const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: [true, 'Please add a title'],
      trim: true,
      index: true 
    },
    genres: [{
      type: String,
      trim: true,
      required: [true, 'Please add at least one genre']
    }],
    duration: {
      type: Number, // in minutes
      required: [true, 'Please add duration in minutes'],
      min: [1, 'Duration must be at least 1 minute']
    },
    description: {
      type: String,
      required: [true, 'Please add a description']
    },
    cast: [{
      type: String,
      trim: true
    }],
    director: {
      type: String,
      required: [true, 'Please add a director'],
      trim: true
    },
    trailerUrl: {
      type: String,
      match: [/^https?:\/\//, 'Please use a valid URL with HTTP or HTTPS']
    },
    posterUrl: {
      type: String,
      default: 'default-movie.jpg'
    },
    status: { 
      type: String, 
      enum: ['showing', 'upcoming', 'ended'], 
      default: 'upcoming',
      index: true 
    },
    releaseDate: {
      type: Date,
      required: [true, 'Please add release date']
    },
    endDate: {
      type: Date,
      required: [true, 'Please add end date']
    },
    rating: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
      set: val => Math.round(val * 10) / 10
    },
    numReviews: {
      type: Number,
      default: 0
    },
    ageRating: {
      type: String,
      enum: ['P', 'C13', 'C16', 'C18', 'K', 'T16+'],
      default: 'P',
      required: true
    },
    language: {
      type: String,
      default: 'Vietnamese',
      trim: true
    },
    isFeatured: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for reviews
movieSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'movie',
  justOne: false
});

// Virtual for showtimes
movieSchema.virtual('showtimes', {
  ref: 'Showtime',
  localField: '_id',
  foreignField: 'movie',
  justOne: false
});

// Indexes for better query performance
movieSchema.index({ title: 'text', director: 'text', cast: 'text' });
movieSchema.index({ releaseDate: 1 });
movieSchema.index({ endDate: 1 });
movieSchema.index({ status: 1 });
movieSchema.index({ rating: -1 });

// Add method to check if movie is showing now
movieSchema.methods.isShowing = function() {
  const now = new Date();
  return this.releaseDate <= now && this.endDate >= now;
};

// Add method to get upcoming showtimes
movieSchema.methods.getUpcomingShowtimes = async function(days = 7) {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + days);
  
  return await mongoose.model('Showtime').find({
    movie: this._id,
    startTime: { $gte: start, $lte: end },
    isActive: true
  })
  .populate('theater', 'name address')
  .populate('room', 'name')
  .sort('startTime');
};

// Calculate average rating
movieSchema.statics.getAverageRating = async function(movieId) {
  const obj = await this.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(movieId) }
    },
    {
      $lookup: {
        from: 'reviews',
        localField: '_id',
        foreignField: 'movieId',
        as: 'reviews'
      }
    },
    {
      $addFields: {
        averageRating: { $avg: '$reviews.rating' },
        numReviews: { $size: '$reviews' }
      }
    },
    {
      $project: {
        rating: { $ifNull: ['$averageRating', 0] },
        numReviews: 1
      }
    }
  ]);

  try {
    await this.model('Movie').findByIdAndUpdate(movieId, {
      rating: obj[0].rating.toFixed(1),
      numReviews: obj[0].numReviews
    });
  } catch (err) {
    console.error(err);
  }
};

// Call getAverageRating after save or delete review
movieSchema.post('save', function() {
  this.constructor.getAverageRating(this._id);
});

module.exports = mongoose.model('movies', movieSchema);
