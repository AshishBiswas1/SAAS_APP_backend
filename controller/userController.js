const { supabase } = require('./../util/supabaseclient');
const catchAsync = require('./../util/catchAsync');
const AppError = require('./../util/appError');
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
  fileFilter: multerFilter,
});

exports.uploadUserPhoto = upload.single('image');

exports.resizeAndUploadUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const userId = req.user.id;
  const filename = `user-${userId}.jpeg`;

  const { data, error } = await supabase.storage
    .from('user')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    });

  if (error) {
    return next(new AppError(`Failed to upload image: ${error.message}`, 400));
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('user').getPublicUrl(filename);

  req.body.image = publicUrl;

  next();
});

exports.updateMe = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  if (req.body.password) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updatePassword',
        400
      )
    );
  }

  const allowedFields = {};
  if (req.body.full_name) allowedFields.full_name = req.body.full_name;
  if (req.body.email) allowedFields.email = req.body.email;
  if (req.body.image) allowedFields.image = req.body.image;

  if (Object.keys(allowedFields).length === 0) {
    return next(
      new AppError(
        'Please provide at least one field to update (full_name, email, or image)',
        400
      )
    );
  }

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(allowedFields)
    .eq('id', userId)
    .select();

  if (error || !updatedUser) {
    return next(new AppError('Failed to update user profile', 400));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser[0],
    },
  });
});

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase.from('users').select('*');

  res.status(200).json({
    status: 'success',
    length: data.length,
    data,
  });
});

exports.createUser = catchAsync(async (req, res, next) => {
  const { email, password, name } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name,
      },
    },
  });

  if (error) {
    return next(new AppError('User Cannot be created', 400));
  }

  res.status(200).json({
    status: 'success',
    data,
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId);

  if (error || !data) {
    return next(new AppError('No user found with that id', 404));
  }

  res.status(200).json({
    status: 'success',
    user: data,
  });
});

exports.updateUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(req.body)
    .eq('id', userId)
    .select();

  if (error || !updatedUser) {
    return next(new AppError('No user found with the specified Id', 404));
  }

  res.status(200).json({
    status: 'success',
    user: updatedUser,
  });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  // Delete from users table
  const { error } = await supabase.from('users').delete().eq('id', userId);

  if (error) {
    return next(
      new AppError(`Failed to delete user from database: ${error.message}`, 400)
    );
  }

  res.status(204).json({
    status: 'success',
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data: user, error } = await supabase
    .from('users')
    .eq('id', userId)
    .select();

  if (error) {
    return next(new AppError('No user found with that id', 404));
  }

  res.status(200).json({
    status: 'success',
    user,
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', userId);

  if (error) {
    return next(new AppError('User does not exist', 404));
  }

  res.status(200).json({
    status: 'success',
  });
});
