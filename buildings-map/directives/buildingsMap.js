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
						getSite: '=mapGetSite',
						// getSite is a function that needs to be accessible
						// from the controller and needs to be defined in this
						// directive
						initialCenter: '&',
						initialZoom: '&',
					},
					link: function(scope, element, attrs) {
						if(!L.mapbox.accessToken) {
							console.error("Must supply L.mapbox.accessToken");
						}
						var div = element[0];
						var map = L.mapbox.map(div, scope.mapboxId);
						var siteLayer = new L.MarkerClusterGroup({
							spiderfyDistanceMultiplier: 2,
							maxClusterRadius: function(zoom) {
								return Math.max(10, 64 - 1*Math.pow(zoom, 1.11));
							},
						});

						var config = _.defaults(scope.getConfig(), {
							markerIcon: L.mapbox.marker.icon({
								'marker-size': 'small',
								'marker-color': '#AA60D6',
							}),
							onViewportChange: function() {},
							onSiteClick: function(building) {},
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
								var markerText = building.address_line_1;
								site.marker.bindPopup(markerText, {
									offset: [0, -30],
								});

								if(openPopupImmediately) {
									site.marker.openPopup();
								}
							}
						};

						map.addLayer(siteLayer);


						/***********************
						** SCOPE DECLARATIONS **
						***********************/

						scope.sites = {};

						/**
						 * get site corresponding to a building
						 * @param  {building} building
						 * @return {site or null}
						 */
						scope.getSite = function(building, print) {
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

						if(scope.initialCenter() && scope.initialZoom()) {
							map.setView(scope.initialCenter(), scope.initialZoom());
						} else {
							setMapBounds(map, siteLayer);
						}

						map.on('moveend resize zoomend', _.debounce(function(e) {
							config.onViewportChange(map);
						}, 300));

						siteLayer.on('animationend', function(e) {
							if(!_activeSite || !isIndependent(_activeSite.marker)) {
								map.closePopup();
							}
						});

						scope.updateBuildings = function() {
							var newSites = scope.getSites();
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