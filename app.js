const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const userRouter = require('./Router/userRouter');
const courseRouter = require('./Router/courseRouter');
const videoRouter = require('./Router/videoRouter');
const reviewRouter = require('./Router/reviewRouter');
const paymentRouter = require('./Router/paymentRouter');
const AppError = require('./util/appError');
const { globalErrorHandler } = require('./controller/errorController');

const app = express();

// CORS Configuration
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(cookieParser());

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to saas app'
  });
});

app.use('/api/saas/user/', userRouter);
app.use('/api/saas/course', courseRouter);
app.use('/api/saas/video', videoRouter);
app.use('/api/saas/review', reviewRouter);
app.use('/api/saas/payment', paymentRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`));
});

app.use(globalErrorHandler);

module.exports = app;
