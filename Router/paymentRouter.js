const express = require('express');
const {
  getCheckoutSession,
  verifyPayment,
  getMyPayments,
  getAllPayments
} = require('./../controller/paymentController');
const { protect, restrictTo } = require('./../controller/authController');

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

router.route('/checkout-session/:courseId').get(getCheckoutSession);
router.route('/verify-payment').post(verifyPayment);
router.route('/my-payments').get(getMyPayments);

// Admin routes
router.use(restrictTo('admin'));

router.route('/').get(getAllPayments);

module.exports = router;
