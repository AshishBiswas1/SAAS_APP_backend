const express = require('express');
const {
  getAllCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  uploadCourseBanner,
  uploadBannerToStorage,
  userCreateCourse,
  publishCourse
} = require('./../controller/courseController');
const { protect, restrictTo } = require('./../controller/authController');
const { getCourseStats } = require('./../controller/review_ratingsController');

const router = express.Router();

router.route('/').get(getAllCourses);

router.use(protect);

router
  .route('/postCourse')
  .post(uploadCourseBanner, uploadBannerToStorage, userCreateCourse);

router.route('/:id/publish').patch(publishCourse);

router.use(restrictTo('admin'));

router.route('/').post(createCourse);

router.route('/:id').get(getCourse).patch(updateCourse).delete(deleteCourse);

module.exports = router;
