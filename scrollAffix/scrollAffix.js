/**
 * :copyright: (c) 2015 Building Energy Inc
 * :license: see LICENSE for more details.
 */
(function (angular) {

  /**
   * like bootstrap affix, adds class `fixie` to pin elements when the
   * scroll-affix-height is met.
   * Usage:
   *  <div class="section_nav_container" scroll-affix scroll-affix-height="110">
   *      <div class="section_nav">
   *          <a href="#building" offset="45" du-smooth-scroll du-scrollspy>Building</a>
   *          <a href="#owner" offset="45" du-smooth-scroll du-scrollspy>Owner</a>
   *          <a href="#audit" offset="45" du-smooth-scroll du-scrollspy>Audit</a>
   *          <a href="#eems" offset="45" du-smooth-scroll du-scrollspy>EEMs</a>
   *          <a href="#confirm" offset="45" du-smooth-scroll du-scrollspy>Confirm</a>
   *          <a href="#comments" offset="45" du-smooth-scroll du-scrollspy><i class="fa fa-comments"></i> Comments</a>
   *      </div>
   *  </div>
   */
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

})(window.angular);
