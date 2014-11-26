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
		.directive('buildingMap', [
			function() {
				return {
					restrict: 'A',
					scope: {
						buildings: '=buildings',
						getSites: '&buildingSites',
						getConfig: '&config',
						tileset: '@',
						initialCenter: '&',
						initialZoom: '&',
					},
					controller: 'BuildingMapController',
					link: function(scope, element, attrs) {

						var config = scope.config;

						var defaultMarkerIcon = null;
						var map = scope.createMap(element[0]);

						var _activeSite = null;


						/**
						 * Determine if this marker is independent, or absorbed
						 * into a cluster
						 * @param  {[type]}  marker
						 * @return {Boolean}
						 */
						var isIndependent = function(marker) {
							var parent = $scope.siteLayer.getVisibleParent(marker);
							return parent === null || parent === marker;
						};

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

						scope.map = map;

						var siteLayer = scope.siteLayer = new L.MarkerClusterGroup({
							spiderfyDistanceMultiplier: 2,
							maxClusterRadius: function(zoom) {
								if (zoom <= 15) return 60;
								else if (zoom <= 16) return 20;
								else return 2;
							},
						});

						map.addLayer(siteLayer);

						scope.controlLayer = L.control.layers([], {
							'Buildings': siteLayer,
						}).addTo(map);


						/************************
						** MAP EVENT LISTENERS **
						************************/


						map.on('load', function(e) {
							setMapBounds(map, scope.siteLayer);

							// debounce, and throw away the first invocation
							map.on('zoomend dragend resize', _.debounce(_.after(2, function(e) {
								// NOTE: DON'T use moveend,
								// because that fires when the map loads!
								config.onViewportChange(map);
							}, 100)));
							if (config.initialize) {
								config.initialize(map, scope.controlLayer);
							}
						});

						map.on('popupopen', function(e) {
						    setPopupClass(map, e.popup);
						    $(e.popup._container).find('.close_it').one('click', function(e) {
						        map.closePopup();
						    });
						    e.popup.site.popupIsOpen = true;
							scope.withDynamicBuilding(e.popup.site, function(building) {
								scope.updateBuildingHighlight(building);
							});
						});

						map.on('popupclose', function(e) {
							e.popup.site.popupIsOpen = false;
							scope.withDynamicBuilding(e.popup.site, function(building) {
								scope.updateBuildingHighlight(building);
							});
						});

						if(scope.initialCenter() && scope.initialZoom()) {
							map.setView(scope.initialCenter(), scope.initialZoom());
						} else {
							setMapBounds(map, scope.siteLayer);
						}

						// scope.siteLayer.on('animationend', function(e) {
						// 	if(!_activeSite || !isIndependent(_activeSite.marker)) {
						// 		map.closePopup();
						// 	}
						// });

					},
				};
		}]);
})(angular);