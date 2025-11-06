const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const multer = require('multer');

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

  const filename = `course-${Date.now()}-${Math.round(
    Math.random() * 1e9
  )}.jpeg`;

  const { data, error } = await supabase.storage
    .from('courses')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (error) {
    return next(new AppError(`Failed to upload image: ${error.message}`, 400));
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from('courses').getPublicUrl(filename);

  req.body.image = publicUrl;

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

  const { data, error } = await supabase
    .from('courses')
    .update(req.body)
    .eq('courseid', courseId)
    .select();

  if (error || !data || data.length === 0) {
    return next(new AppError('No course found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      course: data[0]
    }
  });
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
