(function(angular) {

	angular.module('BE.frontend.buildingsMap', [])
		.directive('buildingsMap', [
			'search_service',
			function(search) {

				return {
					restrict: 'A',
					scope: {
						buildings: '=buildings',
						getSite: '=mapGetSite',
						getSites: '&buildingSites',
						mapboxId: '@',
						getConfig: '&config',
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

						map.addLayer(siteLayer);

						var config = _.defaults(scope.getConfig(), {
							markerIcon: L.mapbox.marker.icon({
								'marker-size': 'small',
								'marker-color': '#AA60D6',
							}),
							onViewportChange: function() {},
							onSiteClick: function(building) {},
						});

						scope._buildingIndices = {};
						scope._activeSite = null;
						scope.sites = {};

						scope.setMapBounds = _.debounce( function(map, layer) {
							if(layer.getLayers().length > 0) {
								var bounds = layer.getBounds();
								map.fitBounds(bounds, {padding: [20, 20]});
							}
						}, 300);

						var loadBuilding = function(index, building) {
							scope._buildingIndices[building.canonical_building] = index;
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
							return scope.buildings[this._buildingIndices[site.canonical_building_id]];
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

							site.centerOnMap = function() {
								map.setView(site.latlng, Math.max(17, map.getZoom()));
								site.marker.togglePopup();
							};

							site.marker.on('click', function(e) {
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
								scope.$watch('buildings['+buildingIndex+'].checked', function() {
									config.onBuildingCheckedChange(building, site);
								});
							}
							if(!site.popup) {
								var onMarkerClick = function(e) {
									map.openPopup(site.popup);
									scope._activeSite = site;
								};
								var popup = L.popup({
									offset: L.point(0, -30),
								})
								.setContent(building.address_line_1)
								.setLatLng(site.latlng);

								site.popup = popup;
								site.marker.on('click', onMarkerClick);
								if(openPopupImmediately) {
									onMarkerClick();
								}
							}
						};

						scope.$watch('buildings', function() {
							scope.updateBuildings();
						});

						map.on('load', function(e) {
							scope.setMapBounds(map, siteLayer);
							map.on('zoomend dragend resize', _.debounce(function(e) {
								// NOTE: DON'T use moveend,
								// because that fires when the map loads!
								config.onViewportChange(map);
							}, 100));
						})

						map.on('zoomend', function(e) {
							// this timeout is necessary because L.markercluster
							// currently doesn't update its getVisibleParent
							// until after the zoom animation is completed.
							setTimeout(function() {
								if(!scope._activeSite || !isIndependent(scope._activeSite.marker)) {
									map.closePopup();
								}
							}, 600);
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