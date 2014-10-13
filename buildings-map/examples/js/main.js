
// must set mapbox accessToken
L.mapbox.accessToken = 'pk.eyJ1IjoiYnVpbGRpbmdlbmVyZ3kiLCJhIjoiVTktdUY4OCJ9.w0n83ar92Qf0n6RvQaZHrA';

angular.module('BE.widgets.buildingsMap')
	.controller('BuildingsMap', ['$scope', function($scope) {
		var test_buildings = [];
		var seattle = {
			lat: 47.60060732292067,
			lng: -122.32589721679688,
		}

		function randLatLng() {
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


		for(var b=1; b <= 100; b++) {
			test_buildings.push({
				name: 'Building ' + b,
				latlng: randLatLng(),
				checked: Math.random() < 0.1,
			});
		}
		$scope.buildings = test_buildings;
	}]);