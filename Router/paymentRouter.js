const express = require('express');
const {
  getCheckoutSession,
  verifyPayment,
  getMyPayments,
  getAllPayments,
  webhookCheckout,
  checkEnrollment
} = require('./../controller/paymentController');
const { protect, restrictTo } = require('./../controller/authController');

const router = express.Router();

// Webhook endpoint (Stripe) should be public and mounted before auth protection
// It expects raw body for signature verification
// router.post('/webhook-checkout', express.raw({ type: 'application/json' }), webhookCheckout);

// Protected routes (require authentication)
router.use(protect);

router.route('/checkout-session/:courseId').get(getCheckoutSession);
router.route('/verify-payment').post(verifyPayment);
router.route('/my-payments').get(getMyPayments);
router.route('/check-enrollment/:courseId').get(checkEnrollment);

// Admin routes
router.use(restrictTo('admin'));

router.route('/').get(getAllPayments);

module.exports = router;
