const { supabase } = require("./../util/supabaseclient");
const catchAsync = require("./../util/catchAsync");
const AppError = require("./../util/appError");

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase.from("users").select("*");

  res.status(200).json({
    status: "success",
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
    return next(new AppError("User Cannot be created", 400));
  }

  res.status(200).json({
    status: "success",
    data,
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId);

  if (error || !data) {
    return next(new AppError("No user found with that id", 404));
  }

  res.status(200).json({
    status: "success",
    user: data,
  });
});

exports.updateUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data: updatedUser, error } = await supabase
    .from("users")
    .update(req.body)
    .eq("id", userId)
    .select();

  if (error || !updatedUser) {
    return next(new AppError("No user found with the specified Id", 404));
  }

  res.status(200).json({
    status: "success",
    user: updatedUser,
  });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  // Delete from users table
  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) {
    return next(
      new AppError(`Failed to delete user from database: ${error.message}`, 400)
    );
  }

  res.status(204).json({
    status: "success",
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { data: user, error } = await supabase
    .from("users")
    .eq("id", userId)
    .select();

  if (error) {
    return next(new AppError("No user found with that id", 404));
  }

  res.status(200).json({
    status: "success",
    user,
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  const { error } = await supabase
    .from("users")
    .update({ is_active: false })
    .eq("id", userId);

  if (error) {
    return next(new AppError("User does not exist", 404));
  }

  res.status(200).json({
    status: "success",
  });
});
