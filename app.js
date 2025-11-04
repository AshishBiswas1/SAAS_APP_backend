const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const userRouter = require('./Router/userRouter');
const courseRouter = require('./Router/courseRouter');
const AppError = require('./util/appError');
const { globalErrorHandler } = require('./controller/errorController');

const app = express();

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(cookieParser());

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to saas app',
  });
});

app.use('/api/saas/user/', userRouter);
app.use('/api/saas/course', courseRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`));
});

app.use(globalErrorHandler);

module.exports = app;
