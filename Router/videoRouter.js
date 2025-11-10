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

router.use(restrictTo('admin'));

router.route('/').get(getAllVideos).post(createVideo);

router.route('/:id').get(getVideo).patch(updateVideo).delete(deleteVideo);
// update or create progress for a video for the current user
router.route('/:id/progress').post(protect, updateVideoProgress);

module.exports = router;
