/*jshint multistr: true */

(function(angular) {

    var makePopupHTML = function(content) {
        return (' \
        <div class="map_pop_up_container bottom center"> \
          <div class="arrow"></div> \
          <div class="map_pop_up_inner"> \
              ' + content + ' \
          </div> \
        </div>');
    };

    angular.module('BE.frontend.buildingMap')
        .controller('BuildingMapController', [
            '$scope',
            'geo_service',
            function($scope, geo) {

                var noop = function() {};
                $scope.config = $scope.getConfig() || {};
                var config = $scope.config = _.defaults($scope.config, {
                    markerIconActive: $scope.config.markerIcon,
                    onSiteClick: function(building) {},
                    onSiteMouseOver: function(building) {},
                    onSiteMouseOut: function(building) {},
                    popupHTML: function(building) {
                        return "" + building.address_line_1;
                    },
                    onViewportChange: noop,
                    onBuildingChange: noop,
                    loadAPI: {},
                });

                var _buildingWatches = [];
                var _buildingIndices = {};
                var _dynamicBuildings = {};  // mainly used to check if a building has been dynamically loaded yet
                $scope.sites = {};

                var loadBuilding = function(index, building) {
                    _buildingIndices[building.id] = index;
                    _dynamicBuildings[building.id] = building;
                    geo.cache_building(building);
                };

                var loadSite = function(siteData) {
                    var bid = siteData.building_snapshot_id;
                    if(!$scope.sites[bid]) {
                        $scope.sites[bid] = siteData;
                    }
                    return $scope.sites[bid];
                };

                /**
                 * get site corresponding to a building
                 * @param  {building} building
                 * @return {site or null}
                 */
                $scope.getSite = function(building) {
                    return $scope.sites[building.id];
                };

                /**
                 * get the building corresponding to a site
                 * @param  {site} site
                 * @return {building or null}
                 */
                $scope.getBuilding = function(site) {
                    return $scope.buildings[_buildingIndices[site.building_snapshot_id]];
                };


                $scope.createMap = function(element) {
                    var map;
                    var mapOptions = {
                        minZoom: 3,
                    };

                    if ($scope.tileset == 'mapquest-osm') {
                        map = L.map(element, mapOptions);
                        map.addLayer(
                            L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
                                attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
                                subdomains: '1234',
                                maxZoom: 18,  // Leaflet default
                            })
                        );
                    } else if ($scope.tileset == 'mapbox') {
                        if (!L.mapbox) {
                            console.error("No mapbox.js found!");
                        } else if (!L.mapbox.accessToken) {
                            console.error("Must supply L.mapbox.accessToken");
                        }
                        map = L.mapbox.map(element, $scope.mapboxId);
                        defaultMarkerIcon = L.mapbox.marker.icon({
                            'marker-size': 'small',
                            'marker-color': '#AA60D6',
                        });
                    } else {
                        console.error("Unknown map tileset: " + $scope.tileset);
                    }

                    return map;
                };

                /**
                 * Very important function to asynchronously fetch and load building info
                 * for a site, then do stuff. It's safe to call it a lot, since
                 * all loaded buildings are cached, letting the promise resolve
                 * immediately.
                 *
                 * @param  {site}   the site for which to fetch the building
                 * @param  {Function} callback  a callback which takes the \
                 *                              newly fetched building and \
                 *                              a cached argument, specifying \
                 *                              whether the building was already \
                 *                              loaded or not
                 */
                $scope.withDynamicBuilding = function(site, callback) {
                    var building = $scope.getBuilding(site);
                    if (building) {
                        callback(building, true);
                    } else {
                        var promise = geo.get_building_snapshot(site.canonical_building_id);
                        // console.log(_dynamicBuildings, site);
                        promise.then(function(data) {
                            // we don't actually care about data.cached since we're checking caching ourselves
                            var cached = data.cached;
                            if (! _dynamicBuildings[site.building_snapshot_id]) {
                                _dynamicBuildings[site.building_snapshot_id] = data.building;
                                setupDynamicBuildingSiteInterop(data.building, site);
                            } else {
                                cached = true;
                            }
                            callback(_dynamicBuildings[site.building_snapshot_id], cached);
                        });
                    }
                };

                var refreshDynamicBuildings = function() {
                    for (i in $scope.buildings) {
                        var building = $scope.buildings[i];
                        if (_dynamicBuildings[building.id]) {
                            $scope.buildings[i] = _dynamicBuildings[building.id];
                        }
                    }
                }

                $scope.sitePopupIsOpen = function(site) {
                    return $scope.map.hasLayer(site.marker.getPopup());
                };

                /**
                 * Stuff that needs to happen after all buildings and sites
                 * are initially loaded
                 */
                var setupStaticBuildingSiteInterop = function() {
                    setupBuildingWatches();
                };

                /**
                 * Stuff that needs to happen when a building is first dynamically
                 * loaded wrt. a site (e.g. when a site is clicked for a building
                 * that doesn't show in the table)
                 */
                var setupDynamicBuildingSiteInterop = function(building, site) {
                    // currently nothing special needs to happen...
                };

                var _markerClick = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteClick(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                var _markerMouseOver = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteMouseOver(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                var _markerMouseOut = function(e) {
                    var site = e.target.site;
                    $scope.withDynamicBuilding(site, function(building) {
                        config.onSiteMouseOut(building, site);
                        $scope.updateBuildingHighlight(building);
                        _applyBuildingChange(building, site);
                    });
                };

                /**
                 * Set various properties on the site object
                 * after loading. Gets called often, and shouldn't
                 * involve building data.
                 *
                 * @param  {site} site
                 */
                var setupSite = function(site) {

                    site.latlng = {
                        lat: parseFloat(site.latitude),
                        lng: parseFloat(site.longitude),
                    };
                    if (! site.marker) {
                        var marker = L.marker(site.latlng, {
                            icon: config.markerIcon,
                        });
                        marker.site = site;
                        site.marker = marker;
                        site.marker.on('click', _markerClick);
                        site.marker.on('mouseover', _markerMouseOver);
                        site.marker.on('mouseout', _markerMouseOut);
                    }

                    if (! $scope.siteLayer.hasLayer(site.marker)) {
                        $scope.siteLayer.addLayer(site.marker);
                    }

                    return site;
                };

                /**
                 * set up all relationships between building and site
                 * (if possible)
                 * @param  {building} building
                 * @param  {site} site
                 * Open the created popup immediately
                 */
                var setupPopup = function(building, site) {
                    var popup = L.popup({
                        autoPan: false,
                        minWidth: 400,
                        maxWidth: 400,
                        closeButton: false,
                    }).setContent(
                        makePopupHTML(config.popupHTML(building))
                    );
                    popup.site = site;
                    popup.marker = site.marker; // this is apparently the only way to access the popup's marker
                    site.marker.bindPopup(popup, {
                        openOnClick: false,
                    });
                };

                var _removeWatches = function() {
                    _buildingWatches.forEach(
                        function(cb) { cb(); }
                    );
                    _buildingWatches = [];
                };

                /**
                 * Just wraps _buildingChange in an $apply
                 */
                var _applyBuildingChange = _.debounce(function (building) {
                    $scope.$apply(function() { _buildingChange(building); });
                }, 100);

                /**
                 * Gets called during angular watches and various other places,
                 * helps keep sites and building state in sync
                 */
                var _buildingChange = function (building, site) {
                    if (! site) {
                        site = $scope.getSite(building);
                    }
                    config.onBuildingChange(building, site);
                };

                /**
                 * Sets up watches for building changes and tear down old ones
                 * must be invoked after sites are set up
                 * watches are only set for buildings with sites associated,
                 * which should be a small number due to pagination (< 100)
                 */
                var setupBuildingWatches = function() {
                    _removeWatches();
                    for (var index in $scope.buildings) {
                        building = $scope.buildings[index];
                        site = $scope.getSite(building);
                        if(site) {
                            var watch = $scope.$watch('buildings['+index+']', _buildingChange, true);
                            _buildingWatches.push(watch);
                        } // else, the building was not geocoded
                    }
                };

                /**
                 * Just watches the buildings object for changes
                 * This catches the search_service building refresh, which
                 * swaps out the entire object
                 */
                $scope.$watch('buildings', function() {
                    $scope.updateBuildings();
                });

                /**
                 * Open the marker's popup only after making sure the building
                 * data is loaded
                 */
                var openPopup = function(site, callback) {
                    $scope.withDynamicBuilding(site, function(building) {
                        if(!site.marker.getPopup()) {
                            setupPopup(building, site);
                        }
                        var popup = site.marker.openPopup();
                        if ('function' === typeof(callback)) {
                            callback(popup);
                        }
                    });
                };

                var closePopup = function() {
                    $scope.map.closePopup();
                };

                /**
                 * Custom toggle popup. You would think we could use
                 * Leaflet.marker.togglePopup() but we CAN'T!
                 */
                var togglePopup = function(site) {
                    if ($scope.sitePopupIsOpen(site)) closePopup();
                    else openPopup(site);
                };

                /**
                 * update building's highlight state based on
                 * config.buildingHightlight callback
                 * This should be very idempotent, it gets called a lot
                 */

                /**
                 * update building's highlight state based on
                 * config.buildingHightlight callback
                 * This should be very idempotent, it gets called a lot
                 * @param  {object} building The building to update
                 */
                $scope.updateBuildingHighlight = function(building) {
                    site = $scope.getSite(building);
                    var highlight = config.buildingHighlight(building, site);

                    if (site && site.marker && site.marker._map) {
                        if(highlight) {
                            site.marker.setIcon(config.markerIconActive);
                            site.marker.setZIndexOffset(250);
                            site._highlighted = true;
                        } else {
                            site.marker.setIcon(config.markerIcon);
                            site.marker.setZIndexOffset(0);
                            site._highlighted = false;
                        }
                    }
                };

                $scope.updateAllBuildingsHighlight = function(building) {
                    for (i in $scope.buildings) {
                        var building = $scope.buildings[i];
                        $scope.updateBuildingHighlight(building);
                    }
                };

                $scope.pruneMarkers = function() {
                    var currentMarkers = $scope.siteLayer.getLayers();
                    for (i in currentMarkers) {
                        var marker = currentMarkers[i];
                        if (!(marker.site && _.contains(_.pluck($scope.getSites(), 'building_snapshot_id'), marker.site.building_snapshot_id))) {
                            console.log('pruning:', marker);
                            console.log(marker.site.building_snapshot_id, _.pluck($scope.getSites(), 'building_snapshot_id'));
                            $scope.siteLayer.removeLayer(marker);
                        }
                    }
                }

                $scope.updateBuildings = function() {
                    var i;
                    var newSites = $scope.getSites();
                    var newSiteMap = {};
                    var building, site, siteData;

                    refreshDynamicBuildings();

                    for (i in newSites) {
                        newSiteMap[newSites[i].building_snapshot_id] = newSites[i];
                    }

                    for (i in $scope.buildings) {
                        building = $scope.buildings[i];
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

                        // loadSite will return an existing site object.
                        // This prevents sites from being destroyed and re-created
                        // every time the map moves.
                        site = loadSite(siteData);

                        // setupSite needs to happen every time
                        setupSite(site);
                    }

                    for (i in $scope.buildings) {
                        building = $scope.buildings[i];
                        site = $scope.getSite(building);
                        if(site) {
                            setupDynamicBuildingSiteInterop(building, site);
                        } // else, the building was not geocoded
                    }

                    setupStaticBuildingSiteInterop();
                };

                config.loadAPI({
                    'openPopup': openPopup,
                    'closePopup': closePopup,
                    'togglePopup': togglePopup,
                    'getBuilding': $scope.getBuilding, // TODO: remove
                    'getSite': $scope.getSite,
                    'sitePopupIsOpen': $scope.sitePopupIsOpen,
                    'updateBuilding': _buildingChange,
                    'updateBuildings': $scope.updateBuildings,
                    'updateBuildingHighlight': $scope.updateBuildingHighlight,
                    'updateAllBuildingsHighlight': $scope.updateAllBuildingsHighlight,
                    'withDynamicBuilding': $scope.withDynamicBuilding,
                    'centerOnMap': function(site, callback) {
                        $scope.siteLayer.zoomToShowLayer(site.marker, callback);
                    },
                    'pruneMarkers': $scope.pruneMarkers
                });

            }
        ]);
})(angular);