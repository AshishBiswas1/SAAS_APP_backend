const { supabase } = require('./../util/supabaseclient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create checkout session for course purchase
exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  // 1) Get the course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('courseid, title, description, price, image')
    .eq('courseid', req.params.courseId)
    .single();

  if (courseError || !course) {
    return next(new AppError('Course not found', 404));
  }

  if (!course.price || course.price <= 0) {
    return next(new AppError('Invalid course price', 400));
  }

  // Check if user already purchased this course
  const { data: existingPurchase } = await supabase
    .from('payments')
    .select('payment_id')
    .eq('user_id', req.user.id)
    .eq('course_id', req.params.courseId)
    .eq('payment_status', 'succeeded')
    .single();

  if (existingPurchase) {
    return next(new AppError('You have already purchased this course', 400));
  }

  // 2) Create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    success_url: `${
      process.env.FRONTEND_URL || 'http://localhost:3000'
    }/courses/${
      req.params.courseId
    }?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${
      process.env.FRONTEND_URL || 'http://localhost:3000'
    }/courses/${req.params.courseId}`,
    customer_email: req.user.email,
    client_reference_id: req.params.courseId,
    line_items: [
      {
        price_data: {
          currency: 'inr',
          product_data: {
            name: course.title,
            description: course.description || 'Course purchase',
            images: course.image ? [course.image] : []
          },
          unit_amount: Math.round(course.price * 100) // Convert to paise (smallest unit of INR)
        },
        quantity: 1
      }
    ],
    mode: 'payment',
    metadata: {
      course_id: req.params.courseId,
      user_id: req.user.id
    }
  });

  // 3) Create session as response
  res.status(200).json({
    status: 'success',
    session
  });
});

// Verify payment and create enrollment (called after successful payment)
exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { session_id } = req.body;

  if (!session_id) {
    return next(new AppError('Please provide session_id', 400));
  }

  try {
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return next(new AppError('Payment not completed', 400));
    }

    const courseId = session.client_reference_id;
    const userId = session.metadata.user_id;
    const amount = session.amount_total / 100;

    // Check if payment already recorded
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('payment_id')
      .eq('stripe_session_id', session_id)
      .single();

    if (existingPayment) {
      return next(new AppError('Payment already recorded', 400));
    }

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert([
        {
          user_id: userId,
          course_id: courseId,
          amount: amount,
          payment_status: 'succeeded',
          stripe_session_id: session.id
        }
      ])
      .select();

    if (paymentError) {
      return next(new AppError(paymentError.message, 400));
    }

    // Create enrollment record
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .insert([
        {
          user_id: userId,
          course_id: courseId,
          enrollment_date: new Date().toISOString()
        }
      ])
      .select();

    if (enrollmentError) {
      return next(new AppError(enrollmentError.message, 400));
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment verified and enrollment created',
      data: {
        payment: payment[0],
        enrollment: enrollment[0]
      }
    });
  } catch (error) {
    return next(new AppError(`Stripe error: ${error.message}`, 400));
  }
});

// Get user's payment history
exports.getMyPayments = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      payment_id,
      amount,
      payment_status,
      created_at,
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
      payments: data
    }
  });
});

// Get all payments (Admin only)
exports.getAllPayments = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      payment_id,
      amount,
      payment_status,
      created_at,
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
      payments: data
    }
  });
});
