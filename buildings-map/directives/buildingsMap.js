(function(angular) {

	angular.module('BE.frontend.buildingsMap', [])
		.directive('buildingsMap', [
			'search_service',
			function(search) {
				return {
					restrict: 'A',
					scope: {
						buildings: '=buildings',
						getSites: '&buildingSites',
						mapboxId: '@',
						getConfig: '&config',
						tileset: '@',
						// getSite is a function that needs to be accessible
						// from the controller and needs to be defined in this
						// directive
						initialCenter: '&',
						initialZoom: '&',
					},
					link: function(scope, element, attrs) {
						var div = element[0];
						var siteLayer = new L.MarkerClusterGroup({
							spiderfyDistanceMultiplier: 2,
							maxClusterRadius: function(zoom) {
								return Math.max(10, 64 - 1*Math.pow(zoom, 1.11));
							},
						});
						var defaultMarkerIcon = null;
						var map;
						var mapOptions = {
							minZoom: 3,
						};

						if (scope.tileset == 'mapquest-osm') {
							map = L.map(div, mapOptions);
							map.addLayer(
								L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
									attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
									subdomains: '1234',
									maxZoom: 18,  // Leaflet default
								})
							);
						} else { //if (scope.tileset == 'mapbox') {
							if(!L.mapbox.accessToken) {
								console.error("Must supply L.mapbox.accessToken");
							}
							map = L.mapbox.map(div, scope.mapboxId);
							defaultMarkerIcon = L.mapbox.marker.icon({
								'marker-size': 'small',
								'marker-color': '#AA60D6',
							});
						}

						var config = _.defaults(scope.getConfig(), {
							markerIcon: defaultMarkerIcon,
							onViewportChange: function() {},
							onSiteClick: function(building) {},
							popupContent: function(building) {
								return "" + building.address_line_1;
							},
						});

						var _buildingWatches = [];
						var _buildingIndices = {};
						var _activeSite = null;


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


						var _removeWatches = function() {
							_buildingWatches.forEach(
								function(cb) { cb(); }
							);
							_buildingWatches = [];
						};

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
						 * Determine if this marker is independent, or absorbed
						 * into a cluster
						 * @param  {[type]}  marker
						 * @return {Boolean}
						 */
						var isIndependent = function(marker) {
							var parent = siteLayer.getVisibleParent(marker);
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

							if(!(site.marker && siteLayer.hasLayer(site.marker))) {
								var marker = L.marker(site.latlng, {
									icon: config.markerIcon,
								});
								siteLayer.addLayer(marker);
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

						map.addLayer(siteLayer);

						var controlLayer = L.control.layers([], {
							'Buildings': siteLayer,
						}).addTo(map);

						/***********************
						** SCOPE DECLARATIONS **
						***********************/

						scope.sites = {};

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


						scope.$watch('buildings', function() {
							scope.updateBuildings();
						});

						config.hackyScopePasser({
							'getSite': scope.getSite,
						});

						map.on('load', function(e) {
							setMapBounds(map, siteLayer);

							// debounce, and throw away the first invocation
							map.on('zoomend dragend resize', _.debounce(_.after(2, function(e) {
								// NOTE: DON'T use moveend,
								// because that fires when the map loads!
								config.onViewportChange(map);
							}, 100)));
							if (config.initialize) {
								config.initialize(map, controlLayer);
							}
						});

						if(scope.initialCenter() && scope.initialZoom()) {
							map.setView(scope.initialCenter(), scope.initialZoom());
						} else {
							setMapBounds(map, siteLayer);
						}

						siteLayer.on('animationend', function(e) {
							if(!_activeSite || !isIndependent(_activeSite.marker)) {
								map.closePopup();
							}
						});

						scope.updateBuildings = function() {
							var newSites = scope.getSites();
							var newSiteMap = {};
							for (var i in newSites) {
								newSiteMap[newSites[i].canonical_building_id] = newSites[i];
							}
							var currentMarkers = siteLayer.getLayers();
							var i, building, site, siteData;

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
									siteLayer.removeLayer(marker);
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
					},
				};
		}]);
})(angular);