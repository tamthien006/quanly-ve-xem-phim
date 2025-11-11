const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required']
    },
    showtime: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
      required: [true, 'Showtime is required']
    },
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Movie',
      required: [true, 'Movie is required']
    },
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Theater is required']
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'Room is required']
    },
    seats: [{
      code: {
        type: String,
        required: [true, 'Seat code is required'],
        trim: true,
        uppercase: true
      },
      type: {
        type: String,
        enum: ['standard', 'vip'],
        required: [true, 'Seat type is required']
      },
      price: {
        type: Number,
        required: [true, 'Seat price is required'],
        min: [0, 'Price cannot be negative']
      },
      row: { type: Number, required: true },
      column: { type: Number, required: true }
    }],
    combos: [{
      combo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Combo',
        required: true
      },
      name: {
        type: String,
        required: [true, 'Combo name is required']
      },
      quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [1, 'Quantity must be at least 1']
      },
      price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
      },
      image: String
    }],
    voucher: {
      code: {
        type: String,
        trim: true
      },
      discountValue: {
        type: Number,
        min: 0
      },
      discountType: {
        type: String,
        enum: ['percent', 'fixed'],
        default: 'fixed'
      },
      maxDiscount: {
        type: Number,
        min: 0
      },
      minOrderValue: {
        type: Number,
        min: 0
      }
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative']
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, 'Tax cannot be negative']
    },
    serviceFee: {
      type: Number,
      default: 0,
      min: [0, 'Service fee cannot be negative']
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    payment: {
      method: {
        type: String,
        enum: ['momo', 'zalopay', 'vnpay', 'credit_card', 'cash'],
        required: [true, 'Payment method is required']
      },
      transactionId: String,
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
      },
      paidAt: Date,
      paymentDetails: mongoose.Schema.Types.Mixed
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'refunded', 'expired'],
      default: 'pending',
      index: true
    },
    qrCode: {
      type: String,
      unique: true,
      sparse: true
    },
    expiresAt: {
      type: Date,
      default: function() {
        // Set expiration to 15 minutes from creation
        const date = new Date();
        date.setMinutes(date.getMinutes() + 15);
        return date;
      },
      index: { expires: 0 } // Will be handled by TTL index below
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: Date,
    cancellationReason: String
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ showtime: 1, status: 1 });
bookingSchema.index({ 'payment.transactionId': 1 }, { unique: true, sparse: true });
bookingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // Auto-delete after 30 days
bookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired bookings

// Add text index for search
bookingSchema.index(
  {
    'payment.transactionId': 'text',
    'voucher.code': 'text'
  },
  {
    name: 'booking_search_index',
    weights: {
      'payment.transactionId': 5,
      'voucher.code': 3
    }
  }
);

// Pre-save hook to set default values
bookingSchema.pre('save', function(next) {
  // Calculate total amount if not set
  if (this.isNew || this.isModified('seats') || this.isModified('combos')) {
    this.calculateTotals();
  }
  next();
});

// Calculate booking totals
bookingSchema.methods.calculateTotals = function() {
  // Calculate seats subtotal
  const seatsSubtotal = this.seats.reduce((sum, seat) => sum + (seat.price || 0), 0);
  
  // Calculate combos subtotal
  const combosSubtotal = this.combos.reduce((sum, combo) => sum + (combo.price * combo.quantity || 0), 0);
  
  // Calculate subtotal
  this.subtotal = seatsSubtotal + combosSubtotal;
  
  // Calculate discount if voucher is applied
  let discount = 0;
  if (this.voucher && this.voucher.discountValue) {
    if (this.voucher.discountType === 'percent') {
      discount = (this.subtotal * this.voucher.discountValue) / 100;
      if (this.voucher.maxDiscount && discount > this.voucher.maxDiscount) {
        discount = this.voucher.maxDiscount;
      }
    } else {
      discount = Math.min(this.voucher.discountValue, this.subtotal);
    }
  }
  
  this.discount = discount;
  
  // Calculate total (subtotal - discount + tax + service fee)
  this.totalAmount = this.subtotal - this.discount + (this.tax || 0) + (this.serviceFee || 0);
  
  // Ensure total is not negative
  this.totalAmount = Math.max(0, this.totalAmount);
};

// Method to cancel a booking
bookingSchema.methods.cancel = async function(userId, reason = '') {
  if (this.status === 'cancelled') {
    throw new Error('Booking is already cancelled');
  }
  
  if (this.status === 'confirmed' && this.payment.status === 'completed') {
    // In a real app, you would process a refund here
    this.payment.status = 'refunded';
  }
  
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  
  await this.save();
  return this;
};

// Static method to get user's booking history
bookingSchema.statics.getUserBookings = async function(userId, options = {}) {
  const { 
    limit = 10, 
    page = 1, 
    status, 
    fromDate, 
    toDate,
    sortBy = '-createdAt'
  } = options;
  
  const query = { user: userId };
  
  // Filter by status if provided
  if (status) {
    query.status = status;
  }
  
  // Filter by date range if provided
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endOfDay;
    }
  }
  
  const skip = (page - 1) * limit;
  
  const [bookings, total] = await Promise.all([
    this.find(query)
      .populate('movie', 'title posterUrl')
      .populate('theater', 'name address')
      .populate('room', 'name')
      .populate('showtime', 'startTime endTime')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    bookings,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

// Static method to get booking summary for a user
bookingSchema.statics.getUserBookingSummary = async function(userId) {
  const [upcoming, past, cancelled] = await Promise.all([
    this.find({ 
      user: userId,
      status: 'confirmed',
      'showtime.startTime': { $gte: new Date() }
    }).countDocuments(),
    this.find({ 
      user: userId,
      status: 'confirmed',
      'showtime.startTime': { $lt: new Date() }
    }).countDocuments(),
    this.find({ 
      user: userId,
      status: 'cancelled'
    }).countDocuments()
  ]);
  
  return {
    upcoming,
    past,
    cancelled,
    stats: {
      totalBookings: upcoming + past + cancelled,
      upcoming,
      past,
      cancelled
    }
  };
};

// Static method to get available seats for a showtime
bookingSchema.statics.getAvailableSeats = async function(showtimeId) {
  const showtime = await this.model('Showtime').findById(showtimeId)
    .populate('room')
    .populate({
      path: 'bookings',
      match: { 
        status: { $in: ['confirmed', 'pending'] },
        'payment.status': { $ne: 'refunded' }
      },
      select: 'seats'
    });
  
  if (!showtime || !showtime.room) {
    throw new Error('Showtime or room not found');
  }
  
  // Get all booked seat codes
  const bookedSeats = new Set();
  showtime.bookings.forEach(booking => {
    booking.seats.forEach(seat => {
      bookedSeats.add(seat.code);
    });
  });
  
  // Return all seats with availability status
  return showtime.room.seats.map(seat => ({
    ...seat.toObject(),
    isAvailable: !bookedSeats.has(seat.code) && seat.status === 'available'
  }));
};

module.exports = mongoose.model('Booking', bookingSchema);
