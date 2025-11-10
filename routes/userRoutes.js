const express = require('express');
const { check } = require('express-validator');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  createStaff
} = require('../controllers/userController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and authentication
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *         - role
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         name:
 *           type: string
 *           description: The user's full name
 *         email:
 *           type: string
 *           format: email
 *           description: The user's email address (must be unique)
 *         password:
 *           type: string
 *           format: password
 *           minLength: 6
 *           description: The user's password (min 6 characters)
 *         role:
 *           type: string
 *           enum: [user, staff, admin]
 *           default: user
 *           description: The user's role
 *         phone:
 *           type: string
 *           description: The user's phone number
 *         avatar:
 *           type: string
 *           description: URL to the user's avatar image
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date the user was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date the user was last updated
 *       example:
 *         id: 60d0fe4f5311236168a109ca
 *         name: John Doe
 *         email: john@example.com
 *         role: user
 *         phone: "+1234567890"
 *         avatar: https://example.com/avatar.jpg
 *         createdAt: 2023-07-24T10:30:00.000Z
 *         updatedAt: 2023-07-24T10:30:00.000Z
 * 
 *     LoginCredentials:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: password123
 * 
 *     TokenResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT token for authentication
 *         user:
 *           $ref: '#/components/schemas/User'
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         message:
 *           type: string
 *           example: Error message describing what went wrong
 */


/**
 * @swagger
 * /api/v1/users/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account with the provided details
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: password123
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/register',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  register
);

// @route   POST /api/users/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
  ],
  login
);

// @route   GET /api/users/me
// @desc    Get user profile
// @access  Private
router.get('/me', protect, getProfile);

// @route   PUT /api/users/me
// @desc    Update user profile
// @access  Private
router.put(
  '/me',
  protect,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  updateProfile
);

// @route   PUT /api/users/me/password
// @desc    Change user password
// @access  Private
router.put(
  '/me/password',
  protect,
  [
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'Please enter a new password with 6 or more characters').isLength({ min: 6 })
  ],
  changePassword
);

// @route   GET /api/users
// @desc    Get all users (Admin)
// @access  Private/Admin
router.get('/', protect, admin, getUsers);

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin)
// @access  Private/Admin
router.get('/:id', protect, admin, getUserById);

// @route   PUT /api/users/:id
// @desc    Update user (Admin)
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('role', 'Please include a valid role').isIn(['user', 'staff', 'admin']),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  updateUser
);

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin)
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteUser);

// @route   POST /api/staff
// @desc    Create staff user (Admin)
// @access  Private/Admin
router.post(
  '/staff',
  protect,
  admin,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  createStaff
);

module.exports = router;
