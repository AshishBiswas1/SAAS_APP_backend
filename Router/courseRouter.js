const express = require('express');
const {
  getAllCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} = require('./../controller/courseController');
const { protect, restrictTo } = require('./../controller/authController');

const router = express.Router();

router.route('/').get(getAllCourses);

router.use(protect, restrictTo('admin'));

router.route('/').post(createCourse);

router.route('/:id').get(getCourse).patch(updateCourse).delete(deleteCourse);

module.exports = router;
