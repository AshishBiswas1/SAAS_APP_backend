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
  publishCourse,
  getMyCourses,
  updateMyCourse,
  unpublishCourse
} = require('./../controller/courseController');
const { protect, restrictTo } = require('./../controller/authController');
const { getCourseStats } = require('./../controller/review_ratingsController');

const router = express.Router();

router.route('/').get(getAllCourses);
// Protected route to fetch courses created by the logged-in user.
// Declare before the param route so '/my-courses' does not match '/:id'.
router.route('/my-courses').get(protect, getMyCourses);

router.route('/:id').get(getCourse);

router.use(protect);

router
  .route('/postCourse')
  .post(uploadCourseBanner, uploadBannerToStorage, userCreateCourse);

router.route('/:id/publish').patch(publishCourse);
router.route('/:id/unpublish').patch(unpublishCourse);

// Allow course authors to update their own course (protected)
router
  .route('/:id/update')
  .patch(uploadCourseBanner, uploadBannerToStorage, updateMyCourse);

router.use(restrictTo('admin'));

router.route('/').post(createCourse);

// Allow course banner upload on update as well
router
  .route('/:id')
  .patch(uploadCourseBanner, uploadBannerToStorage, updateCourse)
  .delete(deleteCourse);

module.exports = router;
