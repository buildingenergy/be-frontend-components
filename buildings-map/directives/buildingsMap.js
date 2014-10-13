angular.module('BE.widgets.buildingsMap', [])
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
				'buildings': '=',
				'mapboxId': '@',
			},
			link: function(scope, element, attrs) {
				var div = element[0];
				var map = L.mapbox.map(div, scope.mapboxId);
				var visibleBuildingLayer = L.featureGroup().addTo(map);
				var buildingLayer = L.featureGroup();
				var icon = L.mapbox.marker.icon({
					'marker-size': 'small',
					'marker-color': '#AA60D6',
				});
				var setBounds = _.debounce( function(map, layer) {
					if(layer.getLayers().length > 0) {
						var bounds = layer.getBounds();
						map.fitBounds(bounds, {padding: [20, 20]});
					}
				}, 300);

				for (var i in scope.buildings) {
					var building = scope.buildings[i];
					var latlng = building.latlng || randLatLng();  // TODO: Remove this!
					var marker = L.marker(latlng, {icon: icon});
					var popup = L.popup({closeButton: false}).setContent(building.name);
					marker.bindPopup(popup);
					marker.building = building;
					building.marker = marker;
					buildingLayer.addLayer(marker);

					(function(i, building, marker) {
						scope.$watch('buildings['+i+'].checked', function(checked) {
							checked ? visibleBuildingLayer.addLayer(marker) : visibleBuildingLayer.removeLayer(marker);
							if(visibleBuildingLayer.getLayers().length > 0) {
								setBounds(map, visibleBuildingLayer);
							} else {
								setBounds(map, buildingLayer);
							}
						});
					})(i, building, marker);
				}
			},
		}
	});