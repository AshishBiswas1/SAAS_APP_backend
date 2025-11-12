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
  reorderVideos,
  getVideosWithProgress,
  updateVideoProgress
} = require('./../controller/videoController');
const { protect, restrictTo } = require('./../controller/authController');

const router = express.Router();

router.route('/course/:courseId').get(getVideosByCourse);
// return videos with per-user progress (requires authentication)
router.route('/course/:courseId/progress').get(protect, getVideosWithProgress);

router.use(protect);

router
  .route('/upload')
  .post(uploadVideo, uploadVideoToStorage, userUploadVideo);

router.route('/reorder/:courseId').patch(reorderVideos);

// expose per-video progress endpoint for authenticated users BEFORE admin restriction
router.route('/:id/progress').post(protect, updateVideoProgress);

router.use(restrictTo('admin'));

router.route('/').get(getAllVideos).post(createVideo);

router.route('/:id').get(getVideo).patch(updateVideo).delete(deleteVideo);

module.exports = router;
