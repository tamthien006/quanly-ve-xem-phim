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
    required: true 
  },
  price: { 
    type: Number, 
    required: true,
    min: 0
  }
});

const comboItemSchema = new mongoose.Schema({
  comboId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Combo' 
  },
  name: {
    type: String,
    required: true
  },
  qty: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
});

const ticketSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: [true, 'User is required'],
      index: true 
    },
    showtime: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Showtime', 
      required: [true, 'Showtime is required'],
      index: true 
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
    // Seat information
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
    
    // Combo items
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
    
    // Voucher information
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
    
    // Pricing information
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
    
    // Payment information
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
    
    // Ticket status
    status: { 
      type: String, 
      enum: ['pending', 'confirmed', 'cancelled', 'refunded', 'expired'], 
      default: 'pending'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    qrCode: {
      type: String,
      unique: true,
      sparse: true
    },
    checkInTime: Date,
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    },
    cancellationReason: {
      type: String,
      maxlength: [500, 'Cancellation reason cannot be more than 500 characters']
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: Date,
    pendingExpiresAt: { 
      type: Date, 
      default: () => new Date(Date.now() + 10*60*1000), // 10 minutes
      index: { expireAfterSeconds: 0 } 
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index to prevent double booking of seats for the same schedule
ticketSchema.index(
  { scheduleId: 1, 'seats.code': 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $ne: 'cancelled' } 
    },
    message: 'One or more seats are already booked for this show.'
  }
);

// All virtual fields have been removed to prevent conflicts with existing schema fields
// Use populate() in controllers instead, for example:
// Ticket.find().populate('user').populate('movie').populate('theater').populate('room')

// Calculate ticket totals before saving
ticketSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('seats') || this.isModified('combos') || this.isModified('voucher')) {
    // Calculate subtotal from seats and combos
    const seatTotal = this.seats.reduce((sum, seat) => sum + seat.price, 0);
    const comboTotal = this.combos.reduce((sum, combo) => sum + (combo.price * combo.qty), 0);
    this.subtotal = seatTotal + comboTotal;
    
    // Apply voucher discount if applicable
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
    this.totalAmount = this.subtotal - this.discount;
  }
  
  next();
});

// Generate QR code before saving a new ticket
ticketSchema.pre('save', async function(next) {
  if (this.isNew) {
    // In a real app, you would generate a unique QR code here
    // For example: this.qrCode = `TICKET-${this._id}-${Date.now()}`;
    // For now, we'll use a simple string
    this.qrCode = `TICKET-${this._id}`;
  }
  next();
});

// Update schedule occupancy after saving
// Update schedule occupancy after saving
ticketSchema.post('save', async function(doc) {
  try {
    const Schedule = mongoose.model('Schedule');
    const schedule = await Schedule.findById(doc.scheduleId);
    
    if (schedule) {
      await schedule.updateOccupancy();
    }
  } catch (err) {
    console.error('Error updating schedule occupancy:', err);
  }
});

// Update schedule occupancy after removing
ticketSchema.post('remove', async function(doc) {
  try {
    const Schedule = mongoose.model('Schedule');
    const schedule = await Schedule.findById(doc.scheduleId);
    
    if (schedule) {
      await schedule.updateOccupancy();
    }
  } catch (err) {
    console.error('Error updating schedule occupancy after removal:', err);
  }
});

// Pre-save hook to set default values
ticketSchema.pre('save', function(next) {
  // Calculate total amount if not set
  if (this.isNew || this.isModified('seats') || this.isModified('combos')) {
    this.calculateTotals();
  }
  next();
});

// Calculate ticket totals
ticketSchema.methods.calculateTotals = function() {
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

// Method to cancel a ticket
ticketSchema.methods.cancel = async function(userId, reason = '') {
  if (this.status === 'cancelled') {
    throw new Error('Ticket is already cancelled');
  }
  
  // In a real app, you might want to add more validation here
  // For example, check if the show has already started
  
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  
  await this.save();
  
  // In a real app, you would also process a refund here if needed
  
  return this;
};

// Static method to get user's booking history
ticketSchema.statics.getUserBookings = async function(userId, options = {}) {
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
  
  const [tickets, total] = await Promise.all([
    this.find(query)
      .populate('movie', 'title posterUrl')
      .populate('theater', 'name address')
      .populate('room', 'name')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    tickets,
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
ticketSchema.statics.getUserBookingSummary = async function(userId) {
  const Ticket = this;
  
  const [upcoming, past, cancelled] = await Promise.all([
    Ticket.find({ 
      userId,
      status: 'paid',
      'schedule.startTime': { $gte: new Date() }
    })
    .sort('schedule.startTime')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title poster'),
    
    Ticket.find({ 
      userId,
      status: 'paid',
      'schedule.startTime': { $lt: new Date() }
    })
    .sort('-schedule.startTime')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title poster'),
    
    Ticket.find({ 
      userId,
      status: 'cancelled'
    })
    .sort('-updatedAt')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title')
  ]);
  
  return {
    upcoming,
    past,
    cancelled,
    stats: {
      totalBookings: upcoming.length + past.length + cancelled.length,
      upcoming: upcoming.length,
      past: past.length,
      cancelled: cancelled.length
    }
  };
};

// Indexes for better query performance
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ showtime: 1, status: 1 });
ticketSchema.index({ 'payment.transactionId': 1 }, { unique: true, sparse: true });
ticketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // Auto-delete after 30 days

// Add text index for search
ticketSchema.index(
  { 
    'payment.transactionId': 'text',
    'voucher.code': 'text'
  },
  { 
    name: 'ticket_search_index',
    weights: {
      'payment.transactionId': 5,
      'voucher.code': 3
    }
  }
);

module.exports = mongoose.model('Ticket', ticketSchema);
