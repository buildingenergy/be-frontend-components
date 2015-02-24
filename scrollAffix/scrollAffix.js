/**
 * :copyright: (c) 2015 Building Energy Inc
 * :license: see LICENSE for more details.
 */
(function (angular, _, $) {

  angular.module('scrollAffix', [])
  .directive('scrollAffix', function () {
    return {
      restrict: 'A',
      scope: {
        scrollAffixHeight: '@?',
        scrollAffixDebug: '@?'
      },
      link: function (scope, ele, attrs) {
        var w = angular.element(window);
        scope.scrollAffixHeight = scope.scrollAffixHeight || 147;
        scope.scrollAffixHeight = +scope.scrollAffixHeight;

        w.on('scroll', function (e) {
          var sc;
          sc = angular.element(window).scrollTop();
          if (scope.scrollAffixDebug) {
            console.log({scrollTop: sc});
          }
          if (sc > scope.scrollAffixHeight) {
            ele.addClass('fixie');
          } else {
            ele.removeClass('fixie');
          }
        });

        scope.$on('$destroy', function () {
          w.off('scroll');
        });
      }
    };
  });

})(window.angular, window._, window.$);
