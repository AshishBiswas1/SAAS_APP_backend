const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const multer = require('multer');
const sharp = require('sharp');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadCourseBanner = upload.single('image');

exports.uploadBannerToStorage = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  // Resize the uploaded image to match frontend banner holder dimensions
  // Assumption: frontend banner holder displays roughly a wide banner.
  // We'll resize to 1200x400 using cover fit to ensure consistent aspect ratio
  // and visual cropping. This reduces upload size and ensures consistent
  // display across the site.
  const filename = `course-${Date.now()}-${Math.round(
    Math.random() * 1e9
  )}.jpeg`;

  let uploadBuffer = req.file.buffer;
  try {
    // Resize and convert to jpeg with reasonable quality
    uploadBuffer = await sharp(req.file.buffer)
      .resize({ width: 1200, height: 400, fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (sharpErr) {
    // If resizing fails, log and continue with original buffer
    // eslint-disable-next-line no-console
    console.warn('Image resize failed, uploading original image:', sharpErr);
    uploadBuffer = req.file.buffer;
  }

  const { data, error } = await supabase.storage
    .from('courses')
    .upload(filename, uploadBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    return next(new AppError(`Failed to upload image: ${error.message}`, 400));
  }

  // Check if bucket is public, if not use signed URL
  const { data: publicUrlData } = supabase.storage
    .from('courses')
    .getPublicUrl(filename);

  // For public buckets, use publicUrl directly
  // For private buckets, you'd need to create a signed URL with expiry
  req.body.image = publicUrlData.publicUrl;

  next();
});

exports.userCreateCourse = catchAsync(async (req, res, next) => {
  const { title, price, description, requirements, category } = req.body;

  if (!title || !price) {
    return next(new AppError('Please provide title and price', 400));
  }

  let parsedRequirements = requirements;
  if (typeof requirements === 'string') {
    try {
      parsedRequirements = JSON.parse(requirements);
    } catch (err) {
      return next(
        new AppError(
          'Invalid requirements format. Please provide a valid JSON array',
          400
        )
      );
    }
  }

  const { data, error } = await supabase
    .from('courses')
    .insert([
      {
        title,
        price,
        author: req.user.id,
        description,
        image: req.body.image || null,
        requirements: parsedRequirements,
        category
      }
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    message: 'Course created successfully',
    data: {
      course: data[0]
    }
  });
});

exports.getAllCourses = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('courses')
    .select('*, author:users(full_name)')
    .eq('published', true);

  if (error) {
    return next(new AppError(error.message, 400));
  }

  const courses = data.map((course) => ({
    ...course,
    author: course.author?.full_name || 'Unknown'
  }));

  res.status(200).json({
    status: 'success',
    results: courses.length,
    data: {
      courses
    }
  });
});

exports.getCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  const { data, error } = await supabase
    .from('courses')
    .select('*, author:users(full_name)')
    .eq('courseid', courseId)
    .single();

  if (error || !data) {
    return next(new AppError('No course found with that ID', 404));
  }

  const course = {
    ...data,
    author: data.author?.full_name || 'Unknown'
  };

  res.status(200).json({
    status: 'success',
    data: {
      course
    }
  });
});

exports.createCourse = catchAsync(async (req, res, next) => {
  const { title, price, author, description, image, requirements, category } =
    req.body;

  if (!title || !price || !author) {
    return next(new AppError('Please provide title, price, and author', 400));
  }

  const { data, error } = await supabase
    .from('courses')
    .insert([
      {
        title,
        price,
        author,
        description,
        image,
        requirements,
        category
      }
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    data: {
      course: data[0]
    }
  });
});

exports.updateCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  // Try to locate the course first. Some projects use different id
  // column names (courseid vs id). Try both to be robust.
  let found = null;
  try {
    const { data: byCourseId, error: err1 } = await supabase
      .from('courses')
      .select('*')
      .eq('courseid', courseId)
      .single();
    if (!err1 && byCourseId)
      found = { key: 'courseid', value: byCourseId.courseid, row: byCourseId };
  } catch (e) {
    // ignore
  }

  if (!found) {
    try {
      const { data: byId, error: err2 } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();
      if (!err2 && byId) found = { key: 'id', value: byId.id, row: byId };
    } catch (e) {
      // ignore
    }
  }

  if (!found) {
    return next(new AppError('No course found with that ID', 404));
  }

  // Perform update using the located key
  const match = {};
  match[found.key] = found.value;

  // Build a clean payload to avoid sending unexpected types to Supabase
  const payload = {};
  if (req.body.title !== undefined) payload.title = req.body.title;
  if (req.body.price !== undefined && req.body.price !== '') {
    // Coerce numeric price if possible
    const p = Number(req.body.price);
    payload.price = Number.isNaN(p) ? req.body.price : p;
  }
  if (req.body.description !== undefined)
    payload.description = req.body.description;
  if (req.body.category !== undefined) payload.category = req.body.category;
  if (req.body.image !== undefined) payload.image = req.body.image;

  if (req.body.requirements !== undefined) {
    let reqs = req.body.requirements;
    if (typeof reqs === 'string') {
      try {
        reqs = JSON.parse(reqs);
      } catch (e) {
        // leave as string if parse fails
      }
    }
    payload.requirements = reqs;
  }

  try {
    const { data: updated, error } = await supabase
      .from('courses')
      .update(payload)
      .match(match)
      .select();

    if (error || !updated || updated.length === 0) {
      // Return the Supabase error message if available for easier debugging
      const msg = error?.message || 'Failed to update course';
      return next(new AppError(msg, 400));
    }

    res.status(200).json({
      status: 'success',
      data: {
        course: updated[0]
      }
    });
  } catch (e) {
    return next(new AppError(e.message || 'Failed to update course', 400));
  }

  res.status(200).json({
    status: 'success',
    data: {
      course: updated[0]
    }
  });
});

// Allow course authors to update their own courses (used by frontend EditCourse)
exports.updateMyCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  // Locate course by courseid or id (reuse logic)
  let found = null;
  try {
    const { data: byCourseId, error: err1 } = await supabase
      .from('courses')
      .select('*')
      .eq('courseid', courseId)
      .single();
    if (!err1 && byCourseId)
      found = { key: 'courseid', value: byCourseId.courseid, row: byCourseId };
  } catch (e) {}

  if (!found) {
    try {
      const { data: byId, error: err2 } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();
      if (!err2 && byId) found = { key: 'id', value: byId.id, row: byId };
    } catch (e) {}
  }

  if (!found) return next(new AppError('No course found with that ID', 404));

  // Ensure the logged-in user is the author
  if (String(found.row.author) !== String(req.user.id)) {
    return next(new AppError('You are not the author of this course', 403));
  }

  // Build payload (same normalization as updateCourse)
  const payload = {};
  if (req.body.title !== undefined) payload.title = req.body.title;
  if (req.body.price !== undefined && req.body.price !== '') {
    const p = Number(req.body.price);
    payload.price = Number.isNaN(p) ? req.body.price : p;
  }
  if (req.body.description !== undefined)
    payload.description = req.body.description;
  if (req.body.category !== undefined) payload.category = req.body.category;
  if (req.body.image !== undefined) payload.image = req.body.image;

  if (req.body.requirements !== undefined) {
    let reqs = req.body.requirements;
    if (typeof reqs === 'string') {
      try {
        reqs = JSON.parse(reqs);
      } catch (e) {
        // leave as-is
      }
    }
    payload.requirements = reqs;
  }

  const match = {};
  match[found.key] = found.value;

  try {
    const { data: updated, error } = await supabase
      .from('courses')
      .update(payload)
      .match(match)
      .select();

    if (error || !updated || updated.length === 0) {
      const msg = error?.message || 'Failed to update course';
      return next(new AppError(msg, 400));
    }

    res.status(200).json({ status: 'success', data: { course: updated[0] } });
  } catch (e) {
    return next(new AppError(e.message || 'Failed to update course', 400));
  }
});

exports.deleteCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('courseid', courseId);

  if (error) {
    return next(new AppError('No course found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

exports.publishCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  const { data: course, error } = await supabase
    .from('courses')
    .select('*')
    .eq('courseid', courseId)
    .eq('author', req.user.id)
    .single();

  if (error || !course) {
    return next(
      new AppError(
        'No course found with that ID or you are not the author',
        404
      )
    );
  }

  const missingFields = [];

  if (!course.title) missingFields.push('title');
  if (!course.price && course.price !== 0) missingFields.push('price');
  if (!course.author) missingFields.push('author');
  if (!course.description) missingFields.push('description');
  if (!course.image) missingFields.push('image');
  if (!course.requirements) missingFields.push('requirements');
  if (!course.category) missingFields.push('category');

  if (missingFields.length > 0) {
    return next(
      new AppError(
        `Cannot publish course. Please fill the following fields: ${missingFields.join(
          ', '
        )}`,
        400
      )
    );
  }

  const { data: publishedCourse, error: updateError } = await supabase
    .from('courses')
    .update({ published: true })
    .eq('courseid', courseId)
    .select();

  if (updateError) {
    return next(
      new AppError(`Failed to publish course: ${updateError.message}`, 400)
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Course published successfully',
    data: {
      course: publishedCourse[0]
    }
  });
});

// Unpublish course (author only)
exports.unpublishCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.id;

  const { data: course, error } = await supabase
    .from('courses')
    .select('*')
    .eq('courseid', courseId)
    .eq('author', req.user.id)
    .single();

  if (error || !course) {
    return next(
      new AppError(
        'No course found with that ID or you are not the author',
        404
      )
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('courses')
    .update({ published: false })
    .eq('courseid', courseId)
    .select();

  if (updateError) {
    return next(
      new AppError(`Failed to unpublish course: ${updateError.message}`, 400)
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Course unpublished successfully',
    data: {
      course: updated[0]
    }
  });
});

// Get courses created by the logged-in user
exports.getMyCourses = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('author', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      courses: data
    }
  });
});
