const express = require('express');
const {
  getAllUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  getMe,
  deleteMe,
  uploadUserPhoto,
  resizeAndUploadUserPhoto,
  updateMe
} = require('./../controller/userController');

const {
  signup,
  login,
  protect,
  restrictTo,
  forgotPassword,
  resetPassword
} = require('./../controller/authController');

const router = express.Router();

router.route('/signup').post(signup);
router.route('/login').post(login);

router.route('/forget-password').post(forgotPassword);
router.route('/reset-password').post(resetPassword);

// Public route: get current user from token (cookie or header)
router.route('/getMe').get(getMe);

// Protect remaining routes
router.use(protect);

router
  .route('/updateMe')
  .patch(uploadUserPhoto, resizeAndUploadUserPhoto, updateMe);

router.route('/deleteMe').patch(deleteMe);

router.use(restrictTo('admin'));

router.route('/').get(getAllUsers).post(createUser);

router.route('/:id').get(getUser).patch(updateUser).delete(deleteUser);

module.exports = router;
