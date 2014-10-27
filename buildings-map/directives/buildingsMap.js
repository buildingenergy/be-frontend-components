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
							mapVisibleProperty: 'mapVisible',
							markerIcon: L.mapbox.marker.icon({
								'marker-size': 'small',
								'marker-color': '#AA60D6',
							}),
							onViewportChange: function() {},
							onSiteClick: function(building) {},
						});

						scope.setMapBounds = _.debounce( function(map, layer) {
							if(layer.getLayers().length > 0) {
								var bounds = layer.getBounds();
								map.fitBounds(bounds, {padding: [20, 20]});
							}
						}, 300);

						scope.getSite = function(building) {
							return this.sites[this._siteIndices[building.canonical_building]];
						}

						scope.getBuilding = function(site) {
							return this.buildings[this._buildingIndices[site.canonical_building_id]];
						}

						scope._buildingIndices = {};
						scope._siteIndices = {};

						scope.loadBuilding = function(i, building) {
							this._buildingIndices[building.canonical_building] = i;
						}

						scope.initBuilding = function(i, building, site) {
							building[config.mapVisibleProperty] = true;
							var popup = L.popup({
								offset: L.point(0, 0),
							}).setContent(building.address_line_1);
							if(site) {
								building.site = site;
								site.marker.bindPopup(popup);
								if(i !== undefined && i !== null) {
									scope.$watch('buildings['+i+'].checked', function() {
										config.onBuildingCheckedChange(building, site);
									});
								}
							}
						}

						scope.loadSite = function(i, site) {
							this._siteIndices[site.canonical_building_id] = i;
						}

						scope.$watch('buildings', function() {
							scope.updateBuildings();
						});

						scope.setMapBounds(map, siteLayer);

						scope.updateBuildings = function() {
							siteLayer.clearLayers();

							for (var i in scope.buildings) {
								var building = scope.buildings[i];
								this.loadBuilding(i, building);
							}

							for (var i in scope.sites) {
								var site = scope.sites[i];

								if(!site.latitude) {
									continue;
								}

								this.loadSite(i, site);

								var latlng = site.latlng = {
									lat: parseFloat(site.latitude),
									lng: parseFloat(site.longitude),
								}

								if(!site.marker) {
									var marker = L.marker(latlng, {
										icon: config.markerIcon,
									});
									marker.site = site;
									siteLayer.addLayer(marker);
									site.marker = marker;
								}

								var building = scope.getBuilding(site);
								if(building) {
									var popup = L.popup({
										offset: L.point(0, 0),
									}).setContent(building.address_line_1);
									site.marker.bindPopup(popup);
								}

								(function(i, site) {
									site.centerOnMap = function() {
										map.setView(site.latlng, Math.max(17, map.getZoom()));
										site.marker.togglePopup();
									};
									site.marker.on('click', function(e) {
										var promise = search.get_building_snapshot(site.canonical_building_id);
										promise.then(function(building) {
											var site = scope.getSite(building);
											scope.initBuilding(null, building, site);
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
								scope.initBuilding(i, building, site);
							}
						}

						map.on('moveend resize zoomend', _.debounce(function(e) {
							// scope.$apply( function(scope) {
							// 	var bounds = map.getBounds();
							// 	for(var i in scope.buildings) {
							// 		var building = scope.buildings[i];
							// 		if(!building.site || bounds.contains(L.latLng(building.site.latlng))) {
							// 			building[config.mapVisibleProperty] = true;
							// 		} else {
							// 			building[config.mapVisibleProperty] = false;
							// 		}
							// 	}
							// });
							config.onViewportChange(map);
						}, 300));
					},
				}
		}]);
})(angular);