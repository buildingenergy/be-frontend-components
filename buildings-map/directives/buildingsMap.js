(function(angular) {

	angular.module('BE.frontend.buildingsMap', [])
		.directive('buildingsMap', [
			'search_service',
			function(search) {

				return {
					restrict: 'A',
					scope: {
						buildings: '=buildings',
						sites: '=buildingSites',
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
						scope._siteIndices = {};
						scope._activeSite = null;

						scope.setMapBounds = _.debounce( function(map, layer) {
							if(layer.getLayers().length > 0) {
								var bounds = layer.getBounds();
								map.fitBounds(bounds, {padding: [20, 20]});
							}
						}, 300);

						var loadBuilding = function(index, building) {
							scope._buildingIndices[building.canonical_building] = index;
						}

						var loadSite = function(index, site) {
							scope._siteIndices[site.canonical_building_id] = index;
						}

						var isIndependent = function(marker) {
							var parent = siteLayer.getVisibleParent(marker);
							console.log(marker, parent, parent == marker, parent === marker);
							return parent === null || parent === marker
						}

						/**
						 * get site corresponding to a building
						 * @param  {building} building
						 * @return {site or null}
						 */
						scope.getSite = function(building) {
							return this.sites[this._siteIndices[building.canonical_building]];
						}

						/**
						 * get the building corresponding to a site
						 * @param  {site} site
						 * @return {building or null}
						 */
						scope.getBuilding = function(site) {
							return this.buildings[this._buildingIndices[site.canonical_building_id]];
						}

						/**
						 * set up all relationships between building and site
						 * if possible
						 * @param  {building} building
						 * @param  {site} site
						 * @param  {int or null} buildingIndex
						 * @param {bool} openPopupImmediately
						 * Open the created popup immediately
						 */
						scope.setupBuildingSite = function(building, site, buildingIndex, openPopupImmediately) {
							var popup = L.popup({
								offset: L.point(0, 0),
							}).setContent(building.address_line_1);
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
						}

						scope.$watch('buildings', function() {
							scope.updateBuildings();
						});

						scope.setMapBounds(map, siteLayer);

						map.on('moveend resize zoomend', _.debounce(function(e) {
							if(scope._activeSite && !isIndependent(scope._activeSite.marker)) {
								map.closePopup(scope._activeSite.popup);
							}
							config.onViewportChange(map);
						}, 300));

						var has=0, hasnt=0;

						scope.updateBuildings = function() {
							siteLayer.clearLayers();

							for (var i in scope.buildings) {
								var building = scope.buildings[i];
								loadBuilding(i, building);
							}

							for (var i in scope.sites) {
								var site = scope.sites[i];

								if(!site.latitude) {
									// if the site wasn't geocoded, don't even bother
									// TODO: in the future, the backend response shouldn't
									// even include non-geocoded sites
									continue;
								}

								loadSite(i, site);

								var latlng = site.latlng = {
									lat: parseFloat(site.latitude),
									lng: parseFloat(site.longitude),
								}
								if(!(site.marker && siteLayer.hasLayer(site.marker))) {
									var marker = L.marker(latlng, {
										icon: config.markerIcon,
									});
									marker.site = site;
									siteLayer.addLayer(marker);
									site.marker = marker;
								}


								// var building = scope.getBuilding(site);

								(function(i, site) {
									site.centerOnMap = function() {
										map.setView(site.latlng, Math.max(17, map.getZoom()));
										site.marker.togglePopup();
									};
									site.marker.on('click', function(e) {
										var promise = search.get_building_snapshot(site.canonical_building_id);
										promise.then(function(building) {
											var site = scope.getSite(building);
											scope.setupBuildingSite(building, site, null, true);
											if(!site) {
												console.error("Site not available! (TODO: need get_lightweight_building to also get the building site if not already loaded");
											}
											config.onSiteClick(building, site);
										});
									});
								})(i, site);
							}

							for (var i in scope.buildings) {
								var building = scope.buildings[i];
								var site = scope.getSite(building);
								if(site) {
									scope.setupBuildingSite(building, site, i);

									if(siteLayer.hasLayer(site.marker)) {
										has += 1;
									} else {
										hasnt += 1;
									}
								} // else, the building was not geocoded
							}
							console.log(has, hasnt);
						}
					},
				}
		}]);
})(angular);