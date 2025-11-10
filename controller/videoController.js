const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const multer = require('multer');
const { getVideoDurationInSeconds } = require('get-video-duration');
const fs = require('fs').promises;
const path = require('path');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('video')) {
    cb(null, true);
  } else {
    cb(new AppError('Not a video! Please upload only videos.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

exports.uploadVideo = upload.single('video');

exports.uploadVideoToStorage = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a video file', 400));
  }

  const courseId = req.body.in_course;

  if (!courseId) {
    return next(new AppError('Please provide course ID (in_course)', 400));
  }

  // Calculate video duration from buffer by writing to temp file
  const tempFilePath = path.join(
    __dirname,
    `temp-${Date.now()}-${Math.random()}.mp4`
  );

  try {
    // Write buffer to temporary file
    await fs.writeFile(tempFilePath, req.file.buffer);

    // Get video duration using get-video-duration
    const duration = await getVideoDurationInSeconds(tempFilePath);

    req.body.video_duration = Math.round(duration); // Duration in seconds

    // Delete temporary file
    await fs.unlink(tempFilePath);
  } catch (error) {
    // Try to delete temp file if it exists
    try {
      await fs.unlink(tempFilePath);
    } catch (unlinkError) {
      // Ignore unlink errors
    }
    return next(
      new AppError(
        'Failed to calculate video duration. Invalid video file.',
        400
      )
    );
  }

  const { data: existingVideos } = await supabase
    .from('videos')
    .select('order_index')
    .eq('in_course', courseId)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex =
    existingVideos && existingVideos.length > 0
      ? existingVideos[0].order_index + 1
      : 0;

  // Get original filename without extension
  const originalFilename = req.file.originalname.replace(/\.[^/.]+$/, '');

  // Use video_title if provided, otherwise use original filename
  let videoTitle = req.body.video_title;
  if (!videoTitle) {
    videoTitle = originalFilename;
    req.body.video_title = videoTitle;
  }

  // Create a sanitized filename from video_title
  const sanitizedTitle = videoTitle
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);

  const filename = `${courseId}/${sanitizedTitle}-${Date.now()}.mp4`;

  const { data, error } = await supabase.storage
    .from('courses')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (error) {
    return next(new AppError(`Failed to upload video: ${error.message}`, 400));
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from('courses').getPublicUrl(filename);

  req.body.video_url = publicUrl;
  req.body.order_index = nextOrderIndex;

  next();
});

exports.userUploadVideo = catchAsync(async (req, res, next) => {
  const { video_title, video_duration, in_course } = req.body;

  if (!in_course) {
    return next(new AppError('Please provide in_course (course ID)', 400));
  }

  // video_title and video_duration are now automatically set by uploadVideoToStorage middleware

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('author')
    .eq('courseid', in_course)
    .single();

  if (courseError || !course) {
    return next(new AppError('Course not found', 404));
  }

  if (course.author !== req.user.id) {
    return next(
      new AppError(
        'You are not authorized to upload videos to this course',
        403
      )
    );
  }

  const { data, error } = await supabase
    .from('videos')
    .insert([
      {
        video_title,
        video_duration,
        in_course,
        video_url: req.body.video_url,
        order_index: req.body.order_index
      }
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    message: 'Video uploaded successfully',
    data: {
      video: data[0]
    }
  });
});

exports.getAllVideos = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      videos: data
    }
  });
});

exports.getVideo = catchAsync(async (req, res, next) => {
  const videoId = req.params.id;

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('video_id', videoId)
    .single();

  if (error || !data) {
    return next(new AppError('No video found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      video: data
    }
  });
});

exports.getVideosByCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.courseId;

  const { data, error } = await supabase
    .from('videos')
    .select(
      'video_id, video_title, video_duration, video_url, order_index, created_at, updated_at, in_course'
    )
    .eq('in_course', courseId)
    .order('order_index', { ascending: true });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      videos: data
    }
  });
});

exports.getVideosWithProgress = catchAsync(async (req, res, next) => {
  const courseId = req.params.courseId;

  const { data: videos, error: videosError } = await supabase
    .from('videos')
    .select(
      'video_id, video_title, video_duration, video_url, order_index, created_at, updated_at, in_course'
    )
    .eq('in_course', courseId)
    .order('order_index', { ascending: true });

  if (videosError) {
    return next(new AppError(videosError.message, 400));
  }

  // If no authenticated user, return videos with default progress
  const userId = req.user?.id;

  if (!userId) {
    const mapped = (videos || []).map((v) => ({
      ...v,
      progress: { status: 'not_started', watched_seconds: 0 }
    }));

    return res.status(200).json({
      status: 'success',
      results: mapped.length,
      data: { videos: mapped }
    });
  }

  // Fetch progress rows for this user and these videos
  const videoIds = (videos || []).map((v) => v.video_id);

  let progressData = [];
  if (videoIds.length > 0) {
    const { data: pd, error: pdErr } = await supabase
      .from('video_progress')
      .select('video_id, status, watched_seconds, updated_at')
      .eq('user_id', userId)
      .in('video_id', videoIds);

    if (pdErr) {
      // If table doesn't exist or other error, ignore and return default progress
      progressData = [];
    } else {
      progressData = pd || [];
    }
  }

  const progMap = {};
  progressData.forEach((p) => {
    progMap[p.video_id] = p;
  });

  const mapped = (videos || []).map((v) => ({
    ...v,
    progress: progMap[v.video_id] || {
      status: 'not_started',
      watched_seconds: 0
    }
  }));

  res.status(200).json({
    status: 'success',
    results: mapped.length,
    data: { videos: mapped }
  });
});

exports.updateVideoProgress = catchAsync(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user?.id;

  if (!userId) return next(new AppError('Not authenticated', 401));

  const { status, watched_seconds } = req.body;

  if (!status && watched_seconds === undefined) {
    return next(new AppError('Please provide status or watched_seconds', 400));
  }

  // Build upsert object
  const upsertObj = {
    user_id: userId,
    video_id: videoId,
    status: status || 'in_progress',
    watched_seconds: watched_seconds || 0,
    updated_at: new Date().toISOString()
  };

  // Try to upsert into video_progress table
  const { data, error } = await supabase
    .from('video_progress')
    .upsert([upsertObj], { onConflict: ['user_id', 'video_id'] })
    .select();

  if (error) {
    // If the table doesn't exist or upsert fails, return a helpful message
    return next(
      new AppError(`Failed to update progress: ${error.message}`, 400)
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Progress updated',
    data: { progress: data[0] }
  });
});

exports.createVideo = catchAsync(async (req, res, next) => {
  const { video_title, video_duration, in_course, video_url, order_index } =
    req.body;

  if (!video_title || !video_duration || !in_course || !video_url) {
    return next(
      new AppError(
        'Please provide video_title, video_duration, in_course, and video_url',
        400
      )
    );
  }

  const { data, error } = await supabase
    .from('videos')
    .insert([
      {
        video_title,
        video_duration,
        in_course,
        video_url,
        order_index: order_index || 0
      }
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    message: 'Video created successfully',
    data: {
      video: data[0]
    }
  });
});

exports.updateVideo = catchAsync(async (req, res, next) => {
  const videoId = req.params.id;

  const allowedFields = {};
  if (req.body.video_title) allowedFields.video_title = req.body.video_title;
  if (req.body.video_duration)
    allowedFields.video_duration = req.body.video_duration;
  if (req.body.video_url) allowedFields.video_url = req.body.video_url;
  if (req.body.order_index !== undefined)
    allowedFields.order_index = req.body.order_index;

  if (Object.keys(allowedFields).length === 0) {
    return next(new AppError('No valid fields to update', 400));
  }

  const { data, error } = await supabase
    .from('videos')
    .update(allowedFields)
    .eq('video_id', videoId)
    .select();

  if (error || !data || data.length === 0) {
    return next(new AppError('No video found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Video updated successfully',
    data: {
      video: data[0]
    }
  });
});

exports.deleteVideo = catchAsync(async (req, res, next) => {
  const videoId = req.params.id;

  const { error } = await supabase
    .from('videos')
    .delete()
    .eq('video_id', videoId);

  if (error) {
    return next(new AppError('No video found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

exports.reorderVideos = catchAsync(async (req, res, next) => {
  const { courseId } = req.params;
  const { videoOrders } = req.body;

  if (!videoOrders || !Array.isArray(videoOrders)) {
    return next(
      new AppError(
        'Please provide videoOrders as an array of {video_id, order_index}',
        400
      )
    );
  }

  const updates = videoOrders.map(async (item) => {
    const { data, error } = await supabase
      .from('videos')
      .update({ order_index: item.order_index })
      .eq('video_id', item.video_id)
      .eq('in_course', courseId);

    if (error) throw error;
    return data;
  });

  try {
    await Promise.all(updates);
  } catch (error) {
    return next(
      new AppError(`Failed to reorder videos: ${error.message}`, 400)
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Videos reordered successfully'
  });
});
