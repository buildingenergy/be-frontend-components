(function(angular) {

	function formatLatLng(latlng) {
		if(!latlng) {
			return null;
		} else if(latlng.lat && latlng.lng) {
			return latlng;
		} else if(latlng.length == 2) {
			return {
				lat: latlng[0],
				lng: latlng[1],
			}
		} else {
			return null;
		}
	}

	angular.module('BE.frontend.buildingsMap', [])
		.directive('buildingsMap', function() {

			function randLatLng() {
				console.warn("WARNING: Using random lat/lng!!");
				var seattle = {
					lat: 47.60060732292067,
					lng: -122.32589721679688,
				}
				function gaussian() { 
					var r = Math.random;
					return (r() + r() + r() + r() - 2) / 2; 
				}
				return {lat: seattle.lat + gaussian()/4, lng: seattle.lng + gaussian()/3};
			}

			if(!L.mapbox.accessToken) {
				console.error("Must supply L.mapbox.accessToken");
			}

			return {
				restrict: 'A',
				scope: {
					buildings: '=buildings',
					mapboxId: '@',
					get_config: '&config',
				},
				link: function(scope, element, attrs) {
					var div = element[0];
					var map = L.mapbox.map(div, scope.mapboxId);
					var buildingLayer = new L.MarkerClusterGroup({
						spiderfyDistanceMultiplier: 2,
						maxClusterRadius: function(zoom) {
							return Math.max(10, 64 - 1*Math.pow(zoom, 1.11));
						},
					});
					map.addLayer(buildingLayer);
					for(i in _.range(1,300)) {
						scope.buildings.push({});
					}

					var config = _.defaults(scope.get_config(), {
						mapVisibleProperty: 'mapVisible',
						onViewportChange: function() {},
						markerIcon: L.mapbox.marker.icon({
							'marker-size': 'small',
							'marker-color': '#AA60D6',
						}),
					});

					scope.setMapBounds = _.debounce( function(map, layer) {
						if(layer.getLayers().length > 0) {
							var bounds = layer.getBounds();
							map.fitBounds(bounds, {padding: [20, 20]});
						}
					}, 300);

					scope.$watch('buildings', function() {
						scope.updateBuildings();
					});

					scope.updateBuildings = function() {
						buildingLayer.clearLayers();

						for (var i in scope.buildings) {
							var building = scope.buildings[i];
							var latlng = building.latlng = {
								lat: building.latitude, 
								lng: building.longitude,
							}

							if(!latlng || !latlng.lat || !latlng.lng) {
								latlng = building.latlng = randLatLng();
							}

							var marker = L.marker(latlng, {
								icon: config.markerIcon,
							});
							// var popup = L.popup({
							// 	closeButton: false
							// }).setContent(building.name);
							// marker.bindPopup(popup);
							marker.building = building;

							buildingLayer.addLayer(marker);

							building[config.mapVisibleProperty] = true;
							building.marker = marker;

							// (function(i, building, marker) {
							// 	// NOTE: this change doesn't stick after paginating and coming back to these results.
							// 	// marker.on('click', function(e) {
							// 	// 	var building = this.building;
							// 	// 	scope.$apply(function() { building.checked = !building.checked; });
							// 	// });
							// 	scope.$watch('buildings['+i+'].checked', function() {
							// 		config.onBuildingCheckedChange(building, i);
							// 	});
							// })(i, building, marker);
						}

						// map.on('moveend resize zoomend', function(e) {
						// 	scope.$apply( function(scope) {
						// 		var bounds = map.getBounds();
						// 		for(var i in scope.buildings) {
						// 			var building = scope.buildings[i];
						// 			if(bounds.contains(L.latLng(building.latlng))) {
						// 				building[config.mapVisibleProperty] = true;
						// 			} else {
						// 				building[config.mapVisibleProperty] = false;
						// 			}
						// 			config.onViewportChange(map, building, i);
						// 		}
						// 	});
						// });

						scope.setMapBounds(map, buildingLayer);
					}
				},
			}
		});
})(angular);