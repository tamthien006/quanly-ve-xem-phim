const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true,
    trim: true,
    uppercase: true
  },
  type: { 
    type: String, 
    enum: ['standard', 'vip'], 
    default: 'standard' 
  },
  status: { 
    type: String, 
    enum: ['available', 'maintenance'], 
    default: 'available' 
  },
  row: { type: Number, required: true },
  column: { type: Number, required: true }
});

const roomSchema = new mongoose.Schema(
  {
    theater: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Theater', 
      required: [true, 'Please specify a theater'],
      index: true 
    },
    name: { 
      type: String, 
      required: [true, 'Please add a room name'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    capacity: {
      type: Number,
      required: [true, 'Please specify room capacity'],
      min: [1, 'Capacity must be at least 1'],
      max: [500, 'Capacity cannot exceed 500']
    },
    rows: {
      type: Number,
      required: [true, 'Please specify number of rows'],
      min: [1, 'Must have at least 1 row']
    },
    seatsPerRow: {
      type: Number,
      required: [true, 'Please specify seats per row'],
      min: [1, 'Must have at least 1 seat per row']
    },
    seats: [seatSchema],
    screenType: {
      type: String,
      enum: ['standard', '3d', 'imax', '4dx', 'premium', 'vip'],
      default: 'standard'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    features: [{
      type: String,
      enum: [
        'dolby-atmos', 
        'wheelchair-access', 
        'recliner-seats', 
        'sofa',
        '4k',
        'atmos-sound',
        'dolby-vision',
        'laser-projection',
        '3d-glasses',
        'bean-bags',
        'love-seats',
        'food-service'
      ]
    }]
  }, 
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Create seat map before saving
roomSchema.pre('save', function(next) {
  if (this.isNew || this.isModified(['rows', 'seatsPerRow'])) {
    this.seats = this.generateSeatMap();
    this.capacity = this.rows * this.seatsPerRow;
  }
  next();
});

// Generate seat map based on rows and seatsPerRow
roomSchema.methods.generateSeatMap = function() {
  const seats = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  // Determine VIP rows (first 2 rows by default)
  const vipRows = 2;
  
  for (let row = 0; row < this.rows; row++) {
    const rowLetter = alphabet[row % alphabet.length];
    const isVip = row < vipRows;
    
    for (let col = 1; col <= this.seatsPerRow; col++) {
      seats.push({
        code: `${rowLetter}${col}`,
        type: isVip ? 'vip' : 'standard',
        status: 'available',
        row: row,
        column: col - 1
      });
    }
  }
  
  return seats;
};

// Get available seats for a specific showtime
roomSchema.methods.getAvailableSeats = async function(showtimeId) {
  // Get all booked seats for this showtime
  const bookedTickets = await mongoose.model('Ticket').find({
    showtime: showtimeId,
    status: { $in: ['booked', 'confirmed'] }
  });
  
  // Get all seat codes that are booked
  const bookedSeats = new Set();
  bookedTickets.forEach(ticket => {
    if (ticket.seats && Array.isArray(ticket.seats)) {
      ticket.seats.forEach(seat => {
        if (seat && seat.code) {
          bookedSeats.add(seat.code);
        }
      });
    }
  });
  
  // Return available seats with status
  return this.seats.map(seat => ({
    ...seat.toObject(),
    status: bookedSeats.has(seat.code) ? 'booked' : 'available'
  }));
};

// Virtual for showtimes
roomSchema.virtual('showtimes', {
  ref: 'Showtime',
  localField: '_id',
  foreignField: 'room',
  justOne: false
});

// Virtual for theater details
roomSchema.virtual('theaterInfo', {
  ref: 'Theater',
  localField: 'theater',
  foreignField: '_id',
  justOne: true
});

// Indexes for better query performance
roomSchema.index({ theater: 1, name: 1 }, { unique: true });
roomSchema.index({ screenType: 1 });
roomSchema.index({ isActive: 1 });

// Cascade delete showtimes when a room is deleted
roomSchema.pre('remove', async function(next) {
  console.log(`Showtimes being removed for room ${this._id}`);
  await this.model('Showtime').deleteMany({ room: this._id });
  next();
});

// Compound index to ensure unique room names within a theater
roomSchema.index({ theater: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
