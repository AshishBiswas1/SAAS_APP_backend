const express = require('express');
const {
  createReview,
  getReviewsByCourse,
  getReviewsByUser,
  getMyReviews,
  getReview,
  updateReview,
  deleteReview,
  getAllReviews,
  adminDeleteReview
} = require('./../controller/review_ratingsController');
const { protect, restrictTo } = require('./../controller/authController');
const { getCourseStats } = require('./../controller/review_ratingsController');

const router = express.Router();

// Public routes
router.route('/course/:courseId').get(getReviewsByCourse);
router.route('/:courseId/course').get(getCourseStats);
router.route('/user/:userId').get(protect, getReviewsByUser);

// Protected routes (require authentication)
router.use(protect);

router.route('/').post(createReview);
router.route('/myreviews').get(getMyReviews);
router.route('/:id').get(getReview).patch(updateReview).delete(deleteReview);

// Admin routes
router.use(restrictTo('admin'));

router.route('/admin/all').get(getAllReviews);
router.route('/admin/:id').delete(adminDeleteReview);

module.exports = router;
