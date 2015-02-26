/**
 * Building Map Directive
 *
 * Creates a Leaflet map that displays clustered dynamically updated buildings
 * with popups and all kinds of bells and whistles.
 *
 * A lot of the complexity of this code comes from the fact that we have to keep
 * two distinct lists up to date and interoperating - the building list, which
 * show up in the building table, and the "mapBuilding", or "site" list, which
 * represents light-weight building objects that are displayed on the map.
 * In general there are many more sites than buildings
 * (up to 10,000 sites, up to 100 buildings), but when showing more information
 * on a site (e.g. in a popup), the entire building object be present. If it
 * already exists in the table, that object is used, but if not it is loaded
 * asynchronously and the necessary objects and events are created and bound
 * at that point
 *
 * Some key functions to understanding this code: (2014-11-26 MDD)
 * loadAPI - a callback that lets the parent receive a handy API into map
 *      functionality
 * withDynamicBuilding - accepts a callback that guarantees the existence of a
 *      building, crucial for working with the many times a building must be
 *      loaded asynchronously. It's safe to call this many times, as buildings
 *      are cached as they're loaded.
 * updateBuildings - winds up being called every time a new search query is
 *      fired. Existing sites are not updated, their markers and popups are
 *      preserved
 *
 */

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
                    link: function($scope, element, attrs) {

                        var config = $scope.config;

                        var defaultMarkerIcon = null;
                        var map = $scope.createMap(element[0]);

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

                        $scope.map = map;

                        $scope.siteLayer = new L.MarkerClusterGroup({
                            spiderfyDistanceMultiplier: 2,
                            maxClusterRadius: function(zoom) {
                                if (zoom <= 15) return 60;
                                else if (zoom <= 16) return 20;
                                else return 2;
                            },
                        });

                        map.addLayer($scope.siteLayer);

                        $scope.controlLayer = L.control.layers([], {
                            'Buildings': $scope.siteLayer,
                        }).addTo(map);


                        /************************
                        ** MAP EVENT LISTENERS **
                        ************************/

                        map.on('load', function(e) {
                            setMapBounds(map, $scope.siteLayer);

                            // debounce, and throw away the first invocation
                            map.on('zoomend dragend resize', _.debounce(_.after(2, function(e) {
                                // NOTE: DON'T use moveend,
                                // because that fires when the map loads!
                                config.onViewportChange(map);
                            }, 100)));
                            if (config.initialize) {
                                config.initialize(map, $scope.controlLayer);
                            }
                        });

                        map.on('popupopen', function(e) {
                            setPopupClass(map, e.popup);
                            $(e.popup._container).find('.close_it').one('click', function(e) {
                                map.closePopup();
                            });
                            e.popup.site.popupIsOpen = true;
                        });

                        map.on('popupclose', function(e) {
                            e.popup.site.popupIsOpen = false;
                        });

                        if($scope.initialCenter() && $scope.initialZoom()) {
                            map.setView($scope.initialCenter(), $scope.initialZoom());
                        } else {
                            setMapBounds(map, $scope.siteLayer);
                        }

                        var _markerHighlighted = function(marker) {
                            return marker.site._highlighted;
                        };

                        var _leaflet_id = function(cluster) {
                            return cluster._leaflet_id;
                        };

                        var updateClusterHighlight = function() {
                            var zoom = $scope.map.getZoom();
                            var clusters = [];
                            var markers = $scope.siteLayer.getLayers();

                            for (var m in markers) {
                                var marker = markers[m];
                                var site = marker.site;
                                if (site._highlighted) {
                                    clusters.push(marker.__parent);
                                }
                            }
                            clusters = _.uniq(clusters, _leaflet_id);
                            for (var c in clusters) {
                                var cluster = clusters[c];
                                while (cluster.__parent && cluster._zoom >= zoom) {
                                    if (cluster._icon) {
                                        $(cluster._icon).addClass('marker-cluster-highlighted');
                                    }
                                    cluster = cluster.__parent;
                                }
                            }

                        };

                        $scope.siteLayer.on('animationend', function(e) {
                            updateClusterHighlight();
                            $scope.updateAllBuildingsHighlight();
                            //
                            // if(!_activeSite || !isIndependent(_activeSite.marker)) {
                            //     map.closePopup();
                            // }
                        });

                    },
                };
        }]);
})(angular);
