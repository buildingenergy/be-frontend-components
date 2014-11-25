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

    var makePopupHTML = function(content) {
        return ' \
        <div class="map_pop_up_container bottom center"> \
          <div class="arrow"></div> \
          <div class="map_pop_up_inner"> \
              ' + content + ' \
          </div> \
        </div>';
    };

	angular.module('BE.frontend.buildingMap')
		.controller('BuildingMapController', [
			'$scope',
			'geo_service',
			function($scope, geo) {

				var noop = function() {};
				var config = $scope.config = _.defaults($scope.getConfig() || {}, {
					markerIcon: null,
					onSiteClick: function(building) {},
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
					_buildingIndices[building.canonical_building] = index;
					geo.cache_building(building);
				};

				var loadSite = function(siteData) {
					var bid = siteData.canonical_building_id;
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
					return $scope.sites[building.canonical_building];
				};

				/**
				 * get the building corresponding to a site
				 * @param  {site} site
				 * @return {building or null}
				 */
				$scope.getBuilding = function(site) {
					return $scope.buildings[_buildingIndices[site.canonical_building_id]];
				};


				$scope.createMap = function(element) {
					var map;
					var mapOptions = {
						minZoom: 3,
					};

					if ($scope.tileset == 'mapquest-osm') {
						map = L.map(element, mapOptions);
						map.addLayer(
							L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
								attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
								subdomains: '1234',
								maxZoom: 18,  // Leaflet default
							})
						);
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

                var withDynamicBuilding = function(site, callback) {
                    var promise = geo.get_building_snapshot(site.canonical_building_id);
                    promise.then(function(data) {
                        // we don't actually care about data.cached since we're checking caching ourselves
                        var cached = data.cached;
                        if (! _dynamicBuildings[site.canonical_building_id]) {
                            _dynamicBuildings[site.canonical_building_id] = data.building;
                        } else {
                            cached = true;
                        }
                        if (! cached) {
                            setupDynamicBuildingSiteInterop(data.building, site);
                        }
                        callback(data.building, cached);
                    });
                }

                /**
                 * Stuff that needs to happen after all buildings and sites
                 * are initially loaded
                 */
                var setupStaticBuildingSiteInterop = function() {
                    setupBuildingWatches();
                }

                /**
                 * Stuff that needs to happen when a building is dynamically
                 * loaded wrt. a site (e.g. when a site is clicked for a building
                 * that doesn't show in the table)
                 *
                 * Ideally these functions should be idempotent so we don't have
                 * to check if they've already been called.
                 */
                var setupDynamicBuildingSiteInterop = function(building, site) {
                    setupPopup(building, site);
                }


				/**
				 * set various properties on the site object
				 * after loading
				 * @param  {site} site
				 */
				var setupSite = function(site) {

					site.latlng = {
						lat: parseFloat(site.latitude),
						lng: parseFloat(site.longitude),
					};

					if(!(site.marker && $scope.siteLayer.hasLayer(site.marker))) {
						var marker = L.marker(site.latlng, {
							icon: config.markerIcon,
						});
						$scope.siteLayer.addLayer(marker);
						site.marker = marker;
						marker.site = site;
					}

					// TODO: define function once, use `this`
					site.marker.on('click', function(e) {
						_activeSite = site;
						withDynamicBuilding(site, function(building) {
                            config.onSiteClick(building, site);
                        });
					});
				};

				/**
				 * set up all relationships between building and site
				 * (if possible)
				 * @param  {building} building
				 * @param  {site} site
				 * Open the created popup immediately
				 */
				var setupPopup = function(building, site) {
					if(!site.marker.getPopup()) {
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
						site.marker.bindPopup(popup, {});
					}
				};

				var _removeWatches = function() {
					_buildingWatches.forEach(
						function(cb) { cb(); }
					);
					_buildingWatches = [];
				};

				/**
				 * set up watches for building changes and tear down old ones
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
							var watch = $scope.$watch('buildings['+index+']', function(building) {
								var site = $scope.getSite(building);
								config.onBuildingChange(building, site);
							}, true);
							_buildingWatches.push(watch);
						} // else, the building was not geocoded
					}
				}

				$scope.$watch('buildings', function() {
					$scope.updateBuildings();
				});

                var openPopup = function(site) {
                    withDynamicBuilding(site, function(building) {
                        site.marker.openPopup();
                    });
                };

                var closePopup = function() {
                    map.closePopup();
                };

                var togglePopup = function(site) {
                    withDynamicBuilding(site, function(building) {
                        site.marker.togglePopup();
                    });
                };

				config.loadAPI({
                    'openPopup': openPopup,
                    'closePopup': closePopup,
                    'togglePopup': togglePopup,
					'getSite': $scope.getSite,
                    'withDynamicBuilding': withDynamicBuilding,
                    'centerOnMap': function(site) {
                        $scope.map.setView(site.latlng, Math.max(17, $scope.map.getZoom()));
                    }
				});

				$scope.updateBuildings = function() {
					var i;
					var newSites = $scope.getSites();
					var newSiteMap = {};
					var currentMarkers = $scope.siteLayer.getLayers();
					var building, site, siteData;

					for (i in newSites) {
						newSiteMap[newSites[i].canonical_building_id] = newSites[i];
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

						site = loadSite(siteData);
						setupSite(site);
					}

					for (i in currentMarkers) {
						var marker = currentMarkers[i];
						if (!(marker.site.canonical_building_id in newSiteMap)) {
							$scope.siteLayer.removeLayer(marker);
						}
					}

					for (i in $scope.buildings) {
						building = $scope.buildings[i];
						site = $scope.getSite(building);
						if(site) {
							setupPopup(building, site, i);
						} // else, the building was not geocoded
					}

					setupStaticBuildingSiteInterop();

				};
			}
		]);
})(angular);