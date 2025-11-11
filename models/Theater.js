const mongoose = require('mongoose');

const theaterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a theater name'],
    trim: true,
    unique: true
  },
  address: {
    street: { type: String, required: [true, 'Please add street address'] },
    district: { type: String, required: [true, 'Please add district'] },
    city: { type: String, required: [true, 'Please add city'] },
    country: { type: String, default: 'Vietnam' }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: [true, 'Please add coordinates [longitude, latitude]']
    }
  },
  phone: {
    type: String,
    required: [true, 'Please add a contact phone number'],
    match: [/^[0-9]{10,15}$/, 'Please add a valid phone number']
  },
  email: {
    type: String,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
  },
  openingHours: {
    weekdays: { type: String, default: '09:00 - 23:00' },
    weekends: { type: String, default: '09:00 - 24:00' },
    holidays: { type: String, default: '09:00 - 24:00' }
  },
  facilities: [{
    type: String,
    enum: [
      'parking', 'wheelchair', 'food', '3d', 'imax', 
      'atm', 'wifi', 'vip', 'couple', 'kids'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create geospatial index for location-based queries
theaterSchema.index({ location: '2dsphere' });

// Virtual for rooms
theaterSchema.virtual('rooms', {
  ref: 'Room',
  localField: '_id',
  foreignField: 'theater',
  justOne: false
});

// Virtual for showtimes
theaterSchema.virtual('showtimes', {
  ref: 'Showtime',
  localField: '_id',
  foreignField: 'theater',
  justOne: false
});

// Cascade delete rooms when a theater is deleted
theaterSchema.pre('remove', async function(next) {
  await this.model('Room').deleteMany({ theater: this._id });
  next();
});

// Static method to get theaters near a location
theaterSchema.statics.getNearbyTheaters = function(lng, lat, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)]
        },
        $maxDistance: maxDistance // in meters
      }
    },
    isActive: true
  }).select('-__v -createdAt -updatedAt');
};

module.exports = mongoose.model('Theater', theaterSchema);
