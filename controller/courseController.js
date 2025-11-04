const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');

exports.getAllCourses = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('courses')
    .select('*, author:users(full_name)');

  if (error) {
    return next(new AppError(error.message, 400));
  }

  const courses = data.map((course) => ({
    ...course,
    author: course.author?.full_name || 'Unknown',
  }));

  res.status(200).json({
    status: 'success',
    results: courses.length,
    data: {
      courses,
    },
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
    author: data.author?.full_name || 'Unknown',
  };

  res.status(200).json({
    status: 'success',
    data: {
      course,
    },
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
        category,
      },
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    data: {
      course: data[0],
    },
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
      course: data[0],
    },
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
    data: null,
  });
});
