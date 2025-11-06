const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');

// Create a review/rating
exports.createReview = catchAsync(async (req, res, next) => {
  const { course_id, rating, review } = req.body;

  if (!course_id || !rating) {
    return next(new AppError('Please provide course_id and rating', 400));
  }

  // Validate rating range
  if (rating < 1.0 || rating > 5.0) {
    return next(new AppError('Rating must be between 1.0 and 5.0', 400));
  }

  // Check if course exists
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('courseid')
    .eq('courseid', course_id)
    .single();

  if (courseError || !course) {
    return next(new AppError('Course not found', 404));
  }

  // Check if user already reviewed this course
  const { data: existingReview } = await supabase
    .from('review_ratings')
    .select('review_id')
    .eq('user_id', req.user.id)
    .eq('course_id', course_id)
    .single();

  if (existingReview) {
    return next(
      new AppError(
        'You have already reviewed this course. Use update instead.',
        400
      )
    );
  }

  // Create the review
  const { data, error } = await supabase
    .from('review_ratings')
    .insert([
      {
        user_id: req.user.id,
        course_id,
        rating,
        review: review || null
      }
    ])
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  // Only update course stats if review was successfully created
  if (data && data.length > 0) {
    // Update course review count and rating average
    const { data: allReviews, error: reviewsError } = await supabase
      .from('review_ratings')
      .select('rating')
      .eq('course_id', course_id);

    if (!reviewsError && allReviews) {
      const totalReviews = allReviews.length;
      const avgRating =
        totalReviews > 0
          ? allReviews.reduce((sum, item) => sum + Number(item.rating), 0) /
            totalReviews
          : 0;

      const { data: updateData, error: updateError } = await supabase
        .from('courses')
        .update({
          reviews: totalReviews,
          ratingavg: Number(avgRating.toFixed(1))
        })
        .eq('courseid', course_id)
        .select();

      if (updateError) {
        console.error('Error updating course stats:', updateError);
      }
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Review created successfully',
    data: {
      review: data[0]
    }
  });
});

// Get all reviews for a course
exports.getReviewsByCourse = catchAsync(async (req, res, next) => {
  const courseId = req.params.courseId;

  const { data, error } = await supabase
    .from('review_ratings')
    .select(
      `
      review_id,
      rating,
      review,
      created_at,
      updated_at,
      user_id,
      users (
        full_name,
        email
      )
    `
    )
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  // Calculate average rating
  const avgRating =
    data.length > 0
      ? data.reduce((sum, item) => sum + Number(item.rating), 0) / data.length
      : 0;

  res.status(200).json({
    status: 'success',
    results: data.length,
    averageRating: avgRating.toFixed(1),
    data: {
      reviews: data
    }
  });
});

// Get all reviews by a specific user
exports.getReviewsByUser = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;

  const { data, error } = await supabase
    .from('review_ratings')
    .select(
      `
      review_id,
      rating,
      review,
      created_at,
      updated_at,
      course_id,
      courses (
        title,
        image
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      reviews: data
    }
  });
});

// Get my reviews (current logged-in user)
exports.getMyReviews = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('review_ratings')
    .select(
      `
      review_id,
      rating,
      review,
      created_at,
      updated_at,
      course_id,
      courses (
        title,
        image
      )
    `
    )
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      reviews: data
    }
  });
});

// Get a single review
exports.getReview = catchAsync(async (req, res, next) => {
  const reviewId = req.params.id;

  const { data, error } = await supabase
    .from('review_ratings')
    .select(
      `
      review_id,
      rating,
      review,
      created_at,
      updated_at,
      user_id,
      course_id,
      users (
        full_name,
        email
      ),
      courses (
        title
      )
    `
    )
    .eq('review_id', reviewId)
    .single();

  if (error || !data) {
    return next(new AppError('No review found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      review: data
    }
  });
});

// Update a review
exports.updateReview = catchAsync(async (req, res, next) => {
  const reviewId = req.params.id;
  const { rating, review } = req.body;

  // Check if review exists and belongs to user
  const { data: existingReview, error: fetchError } = await supabase
    .from('review_ratings')
    .select('user_id')
    .eq('review_id', reviewId)
    .single();

  if (fetchError || !existingReview) {
    return next(new AppError('No review found with that ID', 404));
  }

  if (existingReview.user_id !== req.user.id) {
    return next(
      new AppError('You are not authorized to update this review', 403)
    );
  }

  // Prepare update object
  const updateFields = {};
  if (rating !== undefined) {
    if (rating < 1.0 || rating > 5.0) {
      return next(new AppError('Rating must be between 1.0 and 5.0', 400));
    }
    updateFields.rating = rating;
  }
  if (review !== undefined) {
    updateFields.review = review || null;
  }

  if (Object.keys(updateFields).length === 0) {
    return next(new AppError('No valid fields to update', 400));
  }

  const { data, error } = await supabase
    .from('review_ratings')
    .update(updateFields)
    .eq('review_id', reviewId)
    .select();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  // Only update course rating average if update was successful and rating was changed
  if (data && data.length > 0 && rating !== undefined) {
    const { data: reviewData } = await supabase
      .from('review_ratings')
      .select('course_id')
      .eq('review_id', reviewId)
      .single();

    if (reviewData) {
      const { data: allReviews, error: reviewsError } = await supabase
        .from('review_ratings')
        .select('rating')
        .eq('course_id', reviewData.course_id);

      if (!reviewsError && allReviews) {
        const totalReviews = allReviews.length;
        const avgRating =
          totalReviews > 0
            ? allReviews.reduce((sum, item) => sum + Number(item.rating), 0) /
              totalReviews
            : 0;

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            ratingavg: Number(avgRating.toFixed(1))
          })
          .eq('courseid', reviewData.course_id)
          .select();

        if (updateError) {
          console.error('Error updating course rating average:', updateError);
        }
      }
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Review updated successfully',
    data: {
      review: data[0]
    }
  });
});

// Delete a review
exports.deleteReview = catchAsync(async (req, res, next) => {
  const reviewId = req.params.id;

  // Check if review exists and belongs to user
  const { data: existingReview, error: fetchError } = await supabase
    .from('review_ratings')
    .select('user_id')
    .eq('review_id', reviewId)
    .single();

  if (fetchError || !existingReview) {
    return next(new AppError('No review found with that ID', 404));
  }

  if (existingReview.user_id !== req.user.id) {
    return next(
      new AppError('You are not authorized to delete this review', 403)
    );
  }

  // Get course_id before deleting
  const { data: reviewData } = await supabase
    .from('review_ratings')
    .select('course_id')
    .eq('review_id', reviewId)
    .single();

  const { error } = await supabase
    .from('review_ratings')
    .delete()
    .eq('review_id', reviewId);

  if (error) {
    return next(new AppError(error.message, 400));
  }

  // Only update course stats if deletion was successful
  if (!error && reviewData) {
    const { data: allReviews, error: reviewsError } = await supabase
      .from('review_ratings')
      .select('rating')
      .eq('course_id', reviewData.course_id);

    if (!reviewsError && allReviews) {
      const totalReviews = allReviews.length;
      const avgRating =
        totalReviews > 0
          ? allReviews.reduce((sum, item) => sum + Number(item.rating), 0) /
            totalReviews
          : 0;

      const { error: updateError } = await supabase
        .from('courses')
        .update({
          reviews: totalReviews,
          ratingavg: Number(avgRating.toFixed(1))
        })
        .eq('courseid', reviewData.course_id)
        .select();

      if (updateError) {
        console.error('Error updating course stats after delete:', updateError);
      }
    }
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get all reviews (Admin only)
exports.getAllReviews = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('review_ratings')
    .select(
      `
      review_id,
      rating,
      review,
      created_at,
      updated_at,
      user_id,
      course_id,
      users (
        full_name,
        email
      ),
      courses (
        title
      )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: {
      reviews: data
    }
  });
});

// Admin: Delete any review
exports.adminDeleteReview = catchAsync(async (req, res, next) => {
  const reviewId = req.params.id;

  // Get course_id before deleting
  const { data: reviewData } = await supabase
    .from('review_ratings')
    .select('course_id')
    .eq('review_id', reviewId)
    .single();

  const { error } = await supabase
    .from('review_ratings')
    .delete()
    .eq('review_id', reviewId);

  if (error) {
    return next(new AppError('No review found with that ID', 404));
  }

  // Only update course stats if deletion was successful
  if (!error && reviewData) {
    const { data: allReviews, error: reviewsError } = await supabase
      .from('review_ratings')
      .select('rating')
      .eq('course_id', reviewData.course_id);

    if (!reviewsError && allReviews) {
      const totalReviews = allReviews.length;
      const avgRating =
        totalReviews > 0
          ? allReviews.reduce((sum, item) => sum + Number(item.rating), 0) /
            totalReviews
          : 0;

      const { error: updateError } = await supabase
        .from('courses')
        .update({
          reviews: totalReviews,
          ratingavg: Number(avgRating.toFixed(1))
        })
        .eq('courseid', reviewData.course_id)
        .select();

      if (updateError) {
        console.error(
          'Error updating course stats after admin delete:',
          updateError
        );
      }
    }
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get course statistics (average rating, total reviews)
exports.getCourseStats = catchAsync(async (req, res, next) => {
  const courseId = req.params.courseId;

  const { data, error } = await supabase
    .from('review_ratings')
    .select('rating')
    .eq('course_id', courseId);

  if (error) {
    return next(new AppError(error.message, 400));
  }

  const totalReviews = data.length;
  const avgRating =
    totalReviews > 0
      ? data.reduce((sum, item) => sum + Number(item.rating), 0) / totalReviews
      : 0;

  // Calculate rating distribution
  const ratingDistribution = {
    5: data.filter((r) => Number(r.rating) === 5).length,
    4: data.filter((r) => Number(r.rating) >= 4 && Number(r.rating) < 5).length,
    3: data.filter((r) => Number(r.rating) >= 3 && Number(r.rating) < 4).length,
    2: data.filter((r) => Number(r.rating) >= 2 && Number(r.rating) < 3).length,
    1: data.filter((r) => Number(r.rating) >= 1 && Number(r.rating) < 2).length
  };

  res.status(200).json({
    status: 'success',
    data: {
      totalReviews,
      averageRating: avgRating.toFixed(1),
      ratingDistribution
    }
  });
});
