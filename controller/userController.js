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
  fileFilter: multerFilter
});

exports.uploadUserPhoto = upload.single('image');

exports.resizeAndUploadUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const userId = req.user.id;
  const filename = `user-${userId}.jpeg`;

  // Attempt to remove any previously stored image for this user. This covers
  // two cases:
  // 1) Previous image used the canonical filename `user-<id>.jpeg` (we'll try
  //    to remove that).
  // 2) Previous image URL stored in the user's `image` column used a
  //    different filename (e.g. older uploads). We try to parse the filename
  //    out of the previous public URL and remove that object.
  try {
    // First, try to delete the canonical filename (safe no-op if not present)
    const { error: removeErr1 } = await supabase.storage
      .from('user')
      .remove([filename]);
    if (removeErr1) {
      // Not fatal; just log
      // eslint-disable-next-line no-console
      console.warn(
        'Could not remove canonical user photo:',
        removeErr1.message || removeErr1
      );
    }

    // Next, fetch the user's current image URL from the DB and try to delete
    // that file explicitly (handles legacy filenames).
    const { data: existingUser } = await supabase
      .from('users')
      .select('image')
      .eq('id', userId)
      .single();

    const prevImageUrl = existingUser && existingUser.image;
    if (prevImageUrl) {
      try {
        // Remove query params
        const cleanUrl = prevImageUrl.split('?')[0];
        // Try to extract the path after '/user/' which is the object key
        const idx = cleanUrl.indexOf('/user/');
        if (idx !== -1) {
          const prevFilename = cleanUrl.slice(idx + '/user/'.length);
          if (prevFilename) {
            const { error: removeErr2 } = await supabase.storage
              .from('user')
              .remove([prevFilename]);
            if (removeErr2) {
              // eslint-disable-next-line no-console
              console.warn(
                'Could not remove previous user photo:',
                removeErr2.message || removeErr2
              );
            }
          }
        }
      } catch (delErr) {
        // eslint-disable-next-line no-console
        console.warn(
          'Error while attempting to remove previous user photo:',
          delErr
        );
      }
    }
  } catch (remErr) {
    // eslint-disable-next-line no-console
    console.warn(
      'Unexpected error while cleaning up previous user photos:',
      remErr
    );
  }

  const { data, error } = await supabase.storage
    .from('user')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true
    });

  if (error) {
    return next(new AppError(`Failed to upload image: ${error.message}`, 400));
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from('user').getPublicUrl(filename);

  // Add a cache-busting query string so browsers and CDNs load the new image
  // immediately after profile update. We store the full URL (including the
  // query param) in the user's `image` column so the frontend will receive
  // a new URL when it fetches the user and re-render the avatar.
  const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;
  req.body.image = cacheBustedUrl;

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
      user: updatedUser[0]
    }
  });
});

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase.from('users').select('*');

  res.status(200).json({
    status: 'success',
    length: data.length,
    data
  });
});

exports.createUser = catchAsync(async (req, res, next) => {
  const { email, password, name } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name
      }
    }
  });

  if (error) {
    return next(new AppError('User Cannot be created', 400));
  }

  res.status(200).json({
    status: 'success',
    data
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
    user: data
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
    user: updatedUser
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
    status: 'success'
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  // Public endpoint: read token from cookie or Authorization header,
  // resolve the Supabase session to get the user id, then fetch the
  // canonical user record from the `users` table.
  const token =
    (req.cookies && req.cookies.jwt) ||
    (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    // No token: return success with null user so frontend can treat as logged out
    return res.status(200).json({ status: 'success', data: { user: null } });
  }

  // Get user info from Supabase auth using the token
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getUser(token);

  if (sessionError || !sessionData?.user?.id) {
    // Token invalid or expired
    return res.status(200).json({ status: 'success', data: { user: null } });
  }

  const userId = sessionData.user.id;

  // Fetch the canonical user row from `users` table
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError || !userRow) {
    return res.status(200).json({ status: 'success', data: { user: null } });
  }

  res.status(200).json({ status: 'success', data: { user: userRow } });
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
    status: 'success'
  });
});
