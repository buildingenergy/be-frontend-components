// sampled from https://github.com/oblador/angular-scroll/blob/master/gulpfile.js
var gulp   = require('gulp');
var jshint = require('gulp-jshint');
var less = require('gulp-less');
var concat = require('gulp-concat');

var sources = [
  'scrollAffix/scrollAffix.js',
  'tel/tel.js',
  'building-map/controllers/buildingMapCtrl.js',
  'building-map/directives/buildingMap.js'
];

gulp.task('build', function () {
  return gulp.src(sources)
    .pipe(concat('be-frontend-components.js'))
    .pipe(gulp.dest('build/js'));
});

gulp.task('lint', function() {
  return gulp.src(sources)
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
    .pipe(jshint.reporter('fail'));
});

gulp.task('less', function () {
  return gulp.src('scrollAffix/scrollAffix.less')
    .pipe(less())
    .pipe(gulp.dest('scrollAffix'));
});


gulp.task('test', ['lint']);
gulp.task('default', ['test', 'less', 'build']);
