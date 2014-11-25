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
		.controller('BuildingMapController', [
			'$scope',
			'search_service',
			function(scope, search) {

				var noop = function() {};
				var config = scope.config = _.defaults(scope.getConfig() || {}, {
					markerIcon: null,
					onSiteClick: function(building) {},
					popupContent: function(building) {
						return "" + building.address_line_1;
					},
					onViewportChange: noop,
					onBuildingCheckedChange: noop,
					hackyScopePasser: noop,
				});

				var _buildingWatches = [];
				var _buildingIndices = {};
				scope.sites = {};


				var loadBuilding = function(index, building) {
					_buildingIndices[building.canonical_building] = index;
					search.building_snapshot_cache[building.canonical_building] = building;
				};

				var loadSite = function(siteData) {
					var bid = siteData.canonical_building_id;
					if(!scope.sites[bid]) {
						scope.sites[bid] = siteData;
					}
					return scope.sites[bid];
				};


				/**
				 * get site corresponding to a building
				 * @param  {building} building
				 * @return {site or null}
				 */
				scope.getSite = function(building) {
					return scope.sites[building.canonical_building];
				};

				/**
				 * get the building corresponding to a site
				 * @param  {site} site
				 * @return {building or null}
				 */
				scope.getBuilding = function(site) {
					return scope.buildings[_buildingIndices[site.canonical_building_id]];
				};


				scope.createMap = function(element) {
					var map;
					var mapOptions = {
						minZoom: 3,
					};

					if (scope.tileset == 'mapquest-osm') {
						map = L.map(element, mapOptions);
						map.addLayer(
							L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
								attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
								subdomains: '1234',
								maxZoom: 18,  // Leaflet default
							})
						);
					} else if (scope.tileset == 'mapbox') {
						if (!L.mapbox) {
							console.error("No mapbox.js found!");
						} else if (!L.mapbox.accessToken) {
							console.error("Must supply L.mapbox.accessToken");
						}
						map = L.mapbox.map(element, scope.mapboxId);
						defaultMarkerIcon = L.mapbox.marker.icon({
							'marker-size': 'small',
							'marker-color': '#AA60D6',
						});
					} else {
						console.error("Unknown map tileset: " + scope.tileset);
					}

					return map;
				};



				/**
				 * Determine if this marker is independent, or absorbed
				 * into a cluster
				 * @param  {[type]}  marker
				 * @return {Boolean}
				 */
				var isIndependent = function(marker) {
					var parent = scope.siteLayer.getVisibleParent(marker);
					return parent === null || parent === marker;
				};

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

					if(!(site.marker && scope.siteLayer.hasLayer(site.marker))) {
						var marker = L.marker(site.latlng, {
							icon: config.markerIcon,
						});
						scope.siteLayer.addLayer(marker);
						site.marker = marker;
						marker.site = site;
					}

					// TODO: make function available to controller which
					// takes a site argument
					site.centerOnMap = function() {
						map.setView(site.latlng, Math.max(17, map.getZoom()));
						site.marker.togglePopup();
					};

					// TODO: define function once, use `this`
					site.marker.on('click', function(e) {
						_activeSite = site;
						var promise = search.get_building_snapshot(site.canonical_building_id);
						promise.then(function(building) {
							setupBuildingSiteInterop(building, site, null, true);
							if(!site) {
								console.error("Site not available! (TODO: need get_lightweight_building to also get the building site if not already loaded");
							}
							config.onSiteClick(building, site);
						});
					});
				};

				/**
				 * set up all relationships between building and site
				 * (if possible)
				 * @param  {building} building
				 * @param  {site} site
				 * @param  {int or null} buildingIndex
				 * @param {bool} openPopupImmediately
				 * Open the created popup immediately
				 */
				var setupBuildingSiteInterop = function(building, site, buildingIndex, openPopupImmediately) {
					if(buildingIndex !== undefined && buildingIndex !== null) {
						var watch = scope.$watch('buildings['+buildingIndex+'].checked', function() {
							config.onBuildingCheckedChange(building, scope.getSite(building));
						});
						_buildingWatches.push(watch);
					}
					if(!site.marker.getPopup()) {
						var popup = L.popup({
							autoPan: false,
							minWidth: 400,
							maxWidth: 400,
							closeButton: false,
						}).setContent(config.popupContent(building));
						popup.site = site;
						popup.marker = site.marker; // this is apparently the only way to access the popup's marker
						site.marker.bindPopup(popup, {});
					}
				};


				scope.$watch('buildings', function() {
					scope.updateBuildings();
				});

				config.hackyScopePasser({
					'getSite': scope.getSite,
				});


				var _removeWatches = function() {
					_buildingWatches.forEach(
						function(cb) { cb(); }
					);
					_buildingWatches = [];
				};



				scope.updateBuildings = function() {
					var i;
					var newSites = scope.getSites();
					var newSiteMap = {};
					var currentMarkers = scope.siteLayer.getLayers();
					var building, site, siteData;

					for (i in newSites) {
						newSiteMap[newSites[i].canonical_building_id] = newSites[i];
					}

					for (i in scope.buildings) {
						building = scope.buildings[i];
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
							scope.siteLayer.removeLayer(marker);
						}
					}

					_removeWatches();

					for (i in scope.buildings) {
						building = scope.buildings[i];
						site = scope.getSite(building);
						if(site) {
							setupBuildingSiteInterop(building, site, i);
						} // else, the building was not geocoded
					}
				};
			}
		]);
})(angular);