const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');

exports.signup = catchAsync(async (req, res, next) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

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
    return next(new AppError(error.message, 400));
  }

  res.status(201).json({
    status: 'success',
    message:
      'User created successfully. Please check your email to confirm your account.',
    data: {
      user: data.user
    }
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return next(new AppError('Invalid email or password', 401));
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    return next(new AppError('Authentication failed', 401));
  }

  res.cookie('jwt', accessToken, {
    // make the cookie accessible to client JS so logout can be fully client-side
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged in successfully',
    token: accessToken,
    data: {
      user: data.user
    }
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in. Please log in to get access', 401)
    );
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return next(
      new AppError('Invalid token or session expired. Please log in again', 401)
    );
  }

  req.user = data.user;
  next();
});

exports.restrictTo = (...roles) => {
  return catchAsync(async (req, res, next) => {
    const { data: userData, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || !userData) {
      return next(new AppError('Unable to verify user permissions', 403));
    }

    if (!roles.includes(userData.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  });
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`
  });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Password reset email sent successfully. Please check your email.',
    data
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { newPassword, accessToken } = req.body;

  if (!newPassword || !accessToken) {
    return next(
      new AppError('New password and access token are required', 400)
    );
  }

  const { createClient } = require('@supabase/supabase-js');

  const supabaseWithToken = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASEKEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );

  const { data, error } = await supabaseWithToken.auth.updateUser({
    password: newPassword
  });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully',
    data
  });
});
