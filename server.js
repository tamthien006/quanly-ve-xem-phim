require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const colors = require('colors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Trust proxy for rate limiting behind reverse proxy (like Nginx, Heroku, etc.)
app.set('trust proxy', 1);

// Set security HTTP headers
app.use(helmet());

// Development logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Enable CORS
app.use(cors());

// Limit requests from same API
const limiter = rateLimit({
  max: 100, // 100 requests per windowMs
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
  whitelist: [
    'duration', 'ratingsQuantity', 'ratingsAverage', 'maxGroupSize', 'difficulty', 'price'
  ]
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Documentation
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Movie Ticket API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Test middleware
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

// API Routes
app.use('/api/v1/auth', require('./routes/userRoutes'));
app.use('/api/v1/movies', require('./routes/movieRoutes'));
app.use('/api/v1/cinemas', require('./routes/cinemaRoutes'));
app.use('/api/v1/rooms', require('./routes/roomRoutes'));
app.use('/api/v1/schedules', require('./routes/scheduleRoutes'));
app.use('/api/v1/tickets', require('./routes/ticketRoutes'));
app.use('/api/v1/payments', require('./routes/paymentRoutes'));
app.use('/api/v1/promotions', require('./routes/promotionRoutes'));
app.use('/api/v1/combos', require('./routes/comboRoutes'));
app.use('/api/v1/reviews', require('./routes/reviewRoutes'));
app.use('/api/v1/dashboard', require('./routes/dashboardRoutes'));

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: req.requestTime,
    environment: NODE_ENV,
    version: '1.0.0'
  });
});

// Handle 404 - Not Found
app.all('*', (req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

// Global error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`
  Server running in ${NODE_ENV} mode on port ${PORT}
  `.yellow.bold);
  console.log(`  API Documentation: http://localhost:${PORT}/api/v1/docs`.cyan);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
  server.close(() => process.exit(1));
});
