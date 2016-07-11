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

// from http://stackoverflow.com/questions/12700145/how-to-format-a-telephone-number-in-angularjs
/**
 * telephone filter:
 * usage:
 *  HTML: {{ phoneNumber | tel }}
 *  JS:
 *      phoneNumber = 6142225555
 *      $filter('tel')(phoneNumber) // outputs "(614) 222-5555"
 */
angular.module('tel', []).filter('tel', function () {
    return function (tel) {
        if (!tel) { return ''; }

        var value = tel.toString().trim().replace(/^\+/, '');

        if (value.match(/[^0-9]/)) {
            return tel;
        }

        var country, city, number;

        switch (value.length) {
            case 10: // +1PPP####### -> C (PPP) ###-####
                country = 1;
                city = value.slice(0, 3);
                number = value.slice(3);
                break;

            case 11: // +CPPP####### -> CCC (PP) ###-####
                country = value[0];
                city = value.slice(1, 4);
                number = value.slice(4);
                break;

            case 12: // +CCCPP####### -> CCC (PP) ###-####
                country = value.slice(0, 3);
                city = value.slice(3, 5);
                number = value.slice(5);
                break;

            default:
                return tel;
        }

        if (country === 1) {
            country = "";
        }

        number = number.slice(0, 3) + '-' + number.slice(3);

        return (country + " (" + city + ") " + number).trim();
    };
});

(function(angular) {
    angular.module('BE.frontend.buildingMap', []);
})(angular);
/*jshint multistr: true */

(function(angular) {

    var makePopupHTML = function(content) {
        return (' \
        <div class="map_pop_up_container bottom center"> \
          <div class="arrow"></div> \
          <div class="map_pop_up_inner"> \
              ' + content + ' \
          </div> \
        </div>');
    };

    angular.module('BE.frontend.buildingMap')
        .controller('BuildingMapController', [
            '$scope',
            'geo_service',
            function($scope, geo) {

                var noop = function() {};
                $scope.config = $scope.getConfig() || {};
                var config = $scope.config = _.defaults($scope.config, {
                    markerIconActive: $scope.config.markerIcon,
                    onSiteClick: function(building) {},
                    onSiteMouseOver: function(building) {},
                    onSiteMouseOut: function(building) {},
                    popupHTML: function(building) {
                        return "" + building.address_line_1;
                    },
                    onViewportChange: noop,
                    onBuildingChange: noop,
                    loadAPI: {},
                });

                var _buildingWatches = [];
                var _buildingIndices = {};
                var _dynamicBuildings = {};  // mainly used to check if a building has been dynamically loaded yet
                $scope.sites = {};

                var loadBuilding = function(index, building) {
                    _buildingIndices[building.id] = index;
                    _.assign(_dynamicBuildings[building.id], building);
                    geo.cache_building(building);
                };

                var loadSite = function(siteData) {
                    var bid = siteData.building_snapshot_id;
                    if(!$scope.sites[bid]) {
                        $scope.sites[bid] = siteData;
                    }
                    return $scope.sites[bid];
                };

                /**
                 * get site corresponding to a building
                 * @param  {building} building
                 * @return {site or null}
                 */
                $scope.getSite = function(building) {
                    return $scope.sites[building.id];
                };

                /**
                 * get the building corresponding to a site
                 * @param  {site} site
                 * @return {building or null}
                 */
                $scope.getBuilding = function(site) {
                    return $scope.buildings[_buildingIndices[site.building_snapshot_id]];
                };


                $scope.createMap = function(element) {
                    var map;
                    var mapOptions = {
                        minZoom: 3,
                        zoom: 12,
                    };
                    var tempOptions;

                    if ($scope.tileset === 'mapquest-osm') {
                        tempOptions = angular.copy(mapOptions);
                        if (!MQ || !MQ.mapLayer) {
                            console.error("MapQuest layer missing! Make sure the MapQuest Maps plugin for Leaflet with AppKey is present. https://developer.mapquest.com/documentation/leaflet-plugins/maps");
                        }
                        tempOptions.layers = MQ.mapLayer();
                        map = L.map(element, tempOptions);
                        // 7/11/2016 AKL - I normally remove commented code, but Michael D. has a fork of leaflet and a
                        // fork of a leaflet plugin being used for something, check his commit log for details. I
                        // cloned the two repos to BE today for reference. Today, MapQuest stopped allowing tiles
                        // without an AppKey, so I had to update this code to use MapQuest's Leaflet plugin, which I
                        // couldn't get working with the commented code below.
                        //
                        // BEGIN COMMENTED CODE
                        // map.addLayer(
                        //     L.tileLayer('https://otile{s}-s.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
                        //         attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
                        //         subdomains: '1234',
                        //         maxZoom: 17,  // Leaflet default
                        //     })
                        // );
                        // END COMMENTED CODE
                    } else if ($scope.tileset == 'mapbox') {
                        if (!L.mapbox) {
                            console.error("No mapbox.js found!");
                        } else if (!L.mapbox.accessToken) {
                            console.error("Must supply L.mapbox.accessToken");
                        }
                        map = L.mapbox.map(element, $scope.mapboxId);
                        defaultMarkerIcon = L.mapbox.marker.icon({
                            'marker-size': 'small',
                            'marker-color': '#AA60D6',
                        });
                    } else {
                        console.error("Unknown map tileset: " + $scope.tileset);
                    }

                    return map;
                };

                /**
                 * Very important function to asynchronously fetch and load building info
                 * for a site, then do stuff. It's safe to call it a lot, since
                 * all loaded buildings are cached, letting the promise resolve
                 * immediately.
                 *
                 * @param  {site}   the site for which to fetch the building
                 * @param  {Function} callback  a callback which takes the \
                 *                              newly fetched building and \
                 *                              a cached argument, specifying \
                 *                              whether the building was already \
                 *                              loaded or not
                 */
                $scope.withDynamicBuilding = function(site, callback) {
                    var building = $scope.getBuilding(site);
                    if (building) {
                        callback(building, true);
                    } else {
                        var promise = geo.get_building_snapshot(site.canonical_building_id);
                        // console.log(_dynamicBuildings, site);
                        promise.then(function(data) {
                            // we don't actually care about data.cached since we're checking caching ourselves
                            var cached = data.cached;
                            if (! _dynamicBuildings[site.building_snapshot_id]) {
                                _dynamicBuildings[site.building_snapshot_id] = data.building;
                                setupDynamicBuildingSiteInterop(data.building, site);
                            } else {
                                cached = true;
                            }
                            callback(_dynamicBuildings[site.building_snapshot_id], cached);
                        });
                    }
                };

                var refreshDynamicBuildings = function() {
                    for (var i in $scope.buildings) {
                        var building = $scope.buildings[i];
                        if (_dynamicBuildings[building.id]) {
                            $scope.buildings[i] = _dynamicBuildings[building.id];
                        }
                    }
                };

                $scope.sitePopupIsOpen = function(site) {
                    return $scope.map.hasLayer(site.marker.getPopup());
                };

                /**
                 * Stuff that needs to happen after all buildings and sites
                 * are initially loaded
                 */
                var setupStaticBuildingSiteInterop = function() {
                    setupBuildingWatches();
                };

                /**
                 * Stuff that needs to happen when a building is first dynamically
                 * loaded wrt. a site (e.g. when a site is clicked for a building
                 * that doesn't show in the table)
                 */
                var setupDynamicBuildingSiteInterop = function(building, site) {
                    // currently nothing special needs to happen...
                };

                var _markerClick = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteClick(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                var _markerMouseOver = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteMouseOver(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                var _markerMouseOut = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteMouseOut(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                /**
                 * Set various properties on the site object
                 * after loading. Gets called often, and shouldn't
                 * involve building data.
                 *
                 * @param  {site} site
                 */
                var setupSite = function(site) {

                    site.latlng = {
                        lat: parseFloat(site.latitude),
                        lng: parseFloat(site.longitude),
                    };
                    if (! site.marker) {
                        var marker = L.marker(site.latlng, {
                            icon: config.markerIcon,
                        });
                        marker.site = site;
                        site.marker = marker;
                        site.marker.on('click', _markerClick);
                        site.marker.on('mouseover', _markerMouseOver);
                        site.marker.on('mouseout', _markerMouseOut);
                    }

                    if (! $scope.siteLayer.hasLayer(site.marker)) {
                        $scope.siteLayer.addLayer(site.marker);
                    }

                    return site;
                };

                /**
                 * set up all relationships between building and site
                 * (if possible)
                 * @param  {building} building
                 * @param  {site} site
                 * Open the created popup immediately
                 */
                var setupPopup = function(building, site) {
                    var popup = L.popup({
                        autoPan: false,
                        minWidth: 400,
                        maxWidth: 400,
                        closeButton: false,
                    }).setContent(
                        makePopupHTML(config.popupHTML(building))
                    );
                    popup.site = site;
                    popup.marker = site.marker; // this is apparently the only way to access the popup's marker
                    site.marker.bindPopup(popup, {
                        openOnClick: false,
                    });
                };

                var _removeWatches = function() {
                    _buildingWatches.forEach(
                        function(cb) { cb(); }
                    );
                    _buildingWatches = [];
                };

                /**
                 * Just wraps _buildingChange in an $apply
                 */
                var _applyBuildingChange = _.debounce(function (building) {
                    $scope.$apply(function() { _buildingChange(building); });
                }, 100);

                /**
                 * Gets called during angular watches and various other places,
                 * helps keep sites and building state in sync
                 */
                var _buildingChange = function (building, site) {
                    if (! site) {
                        site = $scope.getSite(building);
                    }
                    config.onBuildingChange(building, site);
                };

                /**
                 * Sets up watches for building changes and tear down old ones
                 * must be invoked after sites are set up
                 * watches are only set for buildings with sites associated,
                 * which should be a small number due to pagination (< 100)
                 */
                var setupBuildingWatches = function() {
                    _removeWatches();
                    for (var index in $scope.buildings) {
                        building = $scope.buildings[index];
                        site = $scope.getSite(building);
                        if(site) {
                            var watch = $scope.$watch('buildings['+index+']', _buildingChange, true);
                            _buildingWatches.push(watch);
                        } // else, the building was not geocoded
                    }
                };

                /**
                 * Just watches the buildings object for changes
                 * This catches the search_service building refresh, which
                 * swaps out the entire object
                 */
                $scope.$watch('buildings', function() {
                    $scope.updateBuildings();
                });

                /**
                 * Open the marker's popup only after making sure the building
                 * data is loaded
                 */
                var openPopup = function(site, callback) {
                    $scope.withDynamicBuilding(site, function(building) {
                        if(!site.marker.getPopup()) {
                            setupPopup(building, site);
                        }
                        var popup = site.marker.openPopup();
                        if ('function' === typeof(callback)) {
                            callback(popup);
                        }
                    });
                };

                var closePopup = function() {
                    $scope.map.closePopup();
                };

                /**
                 * Custom toggle popup. You would think we could use
                 * Leaflet.marker.togglePopup() but we CAN'T!
                 */
                var togglePopup = function(site) {
                    if ($scope.sitePopupIsOpen(site)) closePopup();
                    else openPopup(site);
                };

                /**
                 * update building's highlight state based on
                 * config.buildingHightlight callback
                 * This should be very idempotent, it gets called a lot
                 */

                /**
                 * update building's highlight state based on
                 * config.buildingHightlight callback
                 * This should be very idempotent, it gets called a lot
                 * @param  {object} building The building to update
                 */
                $scope.updateBuildingHighlight = function(building) {
                    site = $scope.getSite(building);
                    var highlight = config.buildingHighlight(building, site);

                    if (site && site.marker && site.marker._map) {
                        if(highlight) {
                            site.marker.setIcon(config.markerIconActive);
                            site.marker.setZIndexOffset(250);
                            site._highlighted = true;
                        } else {
                            site.marker.setIcon(config.markerIcon);
                            site.marker.setZIndexOffset(0);
                            site._highlighted = false;
                        }
                    }
                };

                $scope.updateAllBuildingsHighlight = function(building) {
                    for (var i in $scope.buildings) {
                        building = $scope.buildings[i];
                        $scope.updateBuildingHighlight(building);
                    }
                };

                $scope.pruneMarkers = function() {
                    var currentMarkers = $scope.siteLayer.getLayers();
                    for (var i in currentMarkers) {
                        var marker = currentMarkers[i];
                        if (!(marker.site)) {
                            $scope.siteLayer.removeLayer(marker);
                        }
                    }
                };

                $scope.updateBuildings = function() {
                    var i;
                    var newSites = $scope.getSites();
                    var newSiteMap = {};
                    var building, site, siteData;

                    refreshDynamicBuildings();

                    for (i in newSites) {
                        newSiteMap[newSites[i].building_snapshot_id] = newSites[i];
                    }

                    for (i in $scope.buildings) {
                        building = $scope.buildings[i];
                        loadBuilding(i, building);
                    }

                    for (i in newSites) {
                        siteData = newSites[i];

                        if(!siteData.latitude) {
                            // if the site wasn't geocoded, don't even bother
                            // TODO: in the future, the backend response shouldn't
                            // even include non-geocoded sites
                            continue;
                        }

                        // loadSite will return an existing site object.
                        // This prevents sites from being destroyed and re-created
                        // every time the map moves.
                        site = loadSite(siteData);

                        // setupSite needs to happen every time
                        setupSite(site);
                    }

                    // remove markers that don't match the search query
                    for (var bid in $scope.sites) {
                        if (!newSiteMap[bid]) {
                            $scope.siteLayer.removeLayer($scope.sites[bid].marker);
                        }
                    }

                    for (i in $scope.buildings) {
                        building = $scope.buildings[i];
                        site = $scope.getSite(building);
                        if(site) {
                            setupDynamicBuildingSiteInterop(building, site);
                        } // else, the building was not geocoded
                    }

                    setupStaticBuildingSiteInterop();
                };

                config.loadAPI({
                    'openPopup': openPopup,
                    'closePopup': closePopup,
                    'togglePopup': togglePopup,
                    'getBuilding': $scope.getBuilding, // TODO: remove
                    'getSite': $scope.getSite,
                    'sitePopupIsOpen': $scope.sitePopupIsOpen,
                    'updateBuilding': _buildingChange,
                    'updateBuildings': $scope.updateBuildings,
                    'updateBuildingHighlight': $scope.updateBuildingHighlight,
                    'updateAllBuildingsHighlight': $scope.updateAllBuildingsHighlight,
                    'withDynamicBuilding': $scope.withDynamicBuilding,
                    'centerOnMap': function(site, callback) {
                        $scope.siteLayer.zoomToShowLayer(site.marker, callback);
                    },
                    'pruneMarkers': $scope.pruneMarkers
                });

            }
        ]);
})(angular);

/**
 * Building Map Directive
 *
 * Creates a Leaflet map that displays clustered dynamically updated buildings
 * with popups and all kinds of bells and whistles.
 *
 * A lot of the complexity of this code comes from the fact that we have to keep
 * two distinct lists up to date and interoperating - the building list, which
 * show up in the building table, and the "mapBuilding", or "site" list, which
 * represents light-weight building objects that are displayed on the map.
 * In general there are many more sites than buildings
 * (up to 10,000 sites, up to 100 buildings), but when showing more information
 * on a site (e.g. in a popup), the entire building object be present. If it
 * already exists in the table, that object is used, but if not it is loaded
 * asynchronously and the necessary objects and events are created and bound
 * at that point
 *
 * Some key functions to understanding this code: (2014-11-26 MDD)
 * loadAPI - a callback that lets the parent receive a handy API into map
 *      functionality
 * withDynamicBuilding - accepts a callback that guarantees the existence of a
 *      building, crucial for working with the many times a building must be
 *      loaded asynchronously. It's safe to call this many times, as buildings
 *      are cached as they're loaded.
 * updateBuildings - winds up being called every time a new search query is
 *      fired. Existing sites are not updated, their markers and popups are
 *      preserved
 *
 */

(function(angular) {

    /**
     * Get class name based on relative map position
     * @param  {L.Map} map
     * @param  {L.Point} position The marker position
     * @return {String}          The popup class name
     */
    var popupClassName = function(map, position) {
        var dim = map.getSize();
        var xClass, yClass;

        if (position.x <= dim.x/3) {
            xClass = 'left';
        } else if (position.x <= dim.x*2/3) {
            xClass = 'center';
        } else {
            xClass = 'right';
        }

        if (position.y <= dim.y/2) {
            yClass = 'top';
        } else {
            yClass = 'bottom';
        }
        return xClass + ' ' + yClass;
    };

    /**
     * Set popup class based on its position on the map
     * @param {L.Map} map
     * @param {L.Popup} popup
     */
    var setPopupClass = function(map, popup) {

        var position = map.latLngToContainerPoint(popup.marker.getLatLng());
        $(popup._container).removeClass('top bottom left right center').addClass(
            popupClassName(map, position) + ' has_value'
        );
    };

    angular.module('BE.frontend.buildingMap')
        .directive('buildingMap', [
            function() {
                return {
                    restrict: 'A',
                    scope: {
                        buildings: '=buildings',
                        getSites: '&buildingSites',
                        getConfig: '&config',
                        tileset: '@',
                        initialCenter: '&',
                        initialZoom: '&',
                    },
                    controller: 'BuildingMapController',
                    link: function($scope, element, attrs) {

                        var config = $scope.config;

                        var defaultMarkerIcon = null;
                        var map = $scope.createMap(element[0]);

                        var _activeSite = null;

                        /**
                         * Determine if this marker is independent, or absorbed
                         * into a cluster
                         * @param  {[type]}  marker
                         * @return {Boolean}
                         */
                        var isIndependent = function(marker) {
                            var parent = $scope.siteLayer.getVisibleParent(marker);
                            return parent === null || parent === marker;
                        };

                        /**
                         * Fit map bounds to markers displayed
                         * @param  {L.Map} map
                         * @param  {L.LayerGroup} layer
                         */
                        var setMapBounds = _.debounce( function(map, layer) {
                            if(layer.getLayers().length > 0) {
                                var bounds = layer.getBounds();
                                map.fitBounds(bounds, {padding: [20, 20]});
                            } else {
                                map.setView([40, -95], 4);
                            }
                        }, 300);

                        $scope.map = map;

                        $scope.siteLayer = new L.MarkerClusterGroup({
                            spiderfyDistanceMultiplier: 2,
                            maxClusterRadius: function(zoom) {
                                if (zoom <= 15) return 60;
                                else if (zoom <= 16) return 20;
                                else return 2;
                            },
                        });

                        map.addLayer($scope.siteLayer);

                        $scope.controlLayer = L.control.layers([], {
                            'Buildings': $scope.siteLayer,
                        }).addTo(map);


                        /************************
                        ** MAP EVENT LISTENERS **
                        ************************/

                        map.on('load', function(e) {
                            setMapBounds(map, $scope.siteLayer);

                            // debounce, and throw away the first invocation
                            map.on('zoomend dragend resize', _.debounce(function(e) {
                                // NOTE: DON'T use moveend,
                                // because that fires when the map loads!
                                config.onViewportChange(map);
                            }, 100));
                            if (config.initialize) {
                                config.initialize(map, $scope.controlLayer);
                            }
                        });

                        map.on('popupopen', function(e) {
                            setPopupClass(map, e.popup);
                            $(e.popup._container).find('.close_it').one('click', function(e) {
                                map.closePopup();
                            });
                            e.popup.site.popupIsOpen = true;
                        });

                        map.on('popupclose', function(e) {
                            e.popup.site.popupIsOpen = false;
                        });

                        if($scope.initialCenter() && $scope.initialZoom()) {
                            map.setView($scope.initialCenter(), $scope.initialZoom());
                        } else {
                            setMapBounds(map, $scope.siteLayer);
                        }

                        var _markerHighlighted = function(marker) {
                            return marker.site._highlighted;
                        };

                        var _leaflet_id = function(cluster) {
                            return cluster._leaflet_id;
                        };

                        var updateClusterHighlight = function() {
                            var zoom = $scope.map.getZoom();
                            var clusters = [];
                            var markers = $scope.siteLayer.getLayers();

                            for (var m in markers) {
                                var marker = markers[m];
                                var site = marker.site;
                                if (site._highlighted) {
                                    clusters.push(marker.__parent);
                                }
                            }
                            clusters = _.uniq(clusters, _leaflet_id);
                            for (var c in clusters) {
                                var cluster = clusters[c];
                                while (cluster.__parent && cluster._zoom >= zoom) {
                                    if (cluster._icon) {
                                        $(cluster._icon).addClass('marker-cluster-highlighted');
                                    }
                                    cluster = cluster.__parent;
                                }
                            }

                        };

                        $scope.siteLayer.on('animationend', function(e) {
                            updateClusterHighlight();
                            $scope.updateAllBuildingsHighlight();
                            //
                            // if(!_activeSite || !isIndependent(_activeSite.marker)) {
                            //     map.closePopup();
                            // }
                        });

                    },
                };
        }]);
})(angular);
