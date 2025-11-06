const express = require('express');
const {
  getAllVideos,
  getVideo,
  getVideosByCourse,
  createVideo,
  updateVideo,
  deleteVideo,
  uploadVideo,
  uploadVideoToStorage,
  userUploadVideo,
  reorderVideos
} = require('./../controller/videoController');
const { protect, restrictTo } = require('./../controller/authController');

const router = express.Router();

router.route('/course/:courseId').get(getVideosByCourse);

router.use(protect);

router
  .route('/upload')
  .post(uploadVideo, uploadVideoToStorage, userUploadVideo);

router.route('/reorder/:courseId').patch(reorderVideos);

router.use(restrictTo('admin'));

router.route('/').get(getAllVideos).post(createVideo);

router.route('/:id').get(getVideo).patch(updateVideo).delete(deleteVideo);

module.exports = router;
