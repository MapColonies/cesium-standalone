define([
        '../Core/BoundingSphere',
        '../Core/buildModuleUrl',
        '../Core/Cartesian3',
        '../Core/Cartographic',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/EllipsoidTerrainProvider',
        '../Core/Event',
        '../Core/IntersectionTests',
        '../Core/Ray',
        '../Core/Rectangle',
        '../Core/Resource',
        '../Renderer/ShaderSource',
        '../Renderer/Texture',
        '../Shaders/GlobeFS',
        '../Shaders/GlobeVS',
        '../Shaders/GroundAtmosphere',
        '../ThirdParty/when',
        './GlobeSurfaceShaderSet',
        './GlobeSurfaceTileProvider',
        './ImageryLayerCollection',
        './QuadtreePrimitive',
        './SceneMode',
        './ShadowMode',
        './TileSelectionResult'
    ], function(
        BoundingSphere,
        buildModuleUrl,
        Cartesian3,
        Cartographic,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        Ellipsoid,
        EllipsoidTerrainProvider,
        Event,
        IntersectionTests,
        Ray,
        Rectangle,
        Resource,
        ShaderSource,
        Texture,
        GlobeFS,
        GlobeVS,
        GroundAtmosphere,
        when,
        GlobeSurfaceShaderSet,
        GlobeSurfaceTileProvider,
        ImageryLayerCollection,
        QuadtreePrimitive,
        SceneMode,
        ShadowMode,
        TileSelectionResult) {
    'use strict';

    /**
     * The globe rendered in the scene, including its terrain ({@link Globe#terrainProvider})
     * and imagery layers ({@link Globe#imageryLayers}).  Access the globe using {@link Scene#globe}.
     *
     * @alias Globe
     * @constructor
     *
     * @param {Ellipsoid} [ellipsoid=Ellipsoid.WGS84] Determines the size and shape of the
     * globe.
     */
    function Globe(ellipsoid) {
        ellipsoid = defaultValue(ellipsoid, Ellipsoid.WGS84);
        var terrainProvider = new EllipsoidTerrainProvider({
            ellipsoid : ellipsoid
        });
        var imageryLayerCollection = new ImageryLayerCollection();

        this._ellipsoid = ellipsoid;
        this._imageryLayerCollection = imageryLayerCollection;

        this._surfaceShaderSet = new GlobeSurfaceShaderSet();
        this._material = undefined;

        this._surface = new QuadtreePrimitive({
            tileProvider : new GlobeSurfaceTileProvider({
                terrainProvider : terrainProvider,
                imageryLayers : imageryLayerCollection,
                surfaceShaderSet : this._surfaceShaderSet
            })
        });

        this._terrainProvider = terrainProvider;
        this._terrainProviderChanged = new Event();

        makeShadersDirty(this);

        /**
         * Determines if the globe will be shown.
         *
         * @type {Boolean}
         * @default true
         */
        this.show = true;

        this._oceanNormalMapResourceDirty = true;
        this._oceanNormalMapResource = new Resource({
            url: buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg')
        });

        /**
         * The maximum screen-space error used to drive level-of-detail refinement.  Higher
         * values will provide better performance but lower visual quality.
         *
         * @type {Number}
         * @default 2
         */
        this.maximumScreenSpaceError = 2;

        /**
         * The size of the terrain tile cache, expressed as a number of tiles.  Any additional
         * tiles beyond this number will be freed, as long as they aren't needed for rendering
         * this frame.  A larger number will consume more memory but will show detail faster
         * when, for example, zooming out and then back in.
         *
         * @type {Number}
         * @default 100
         */
        this.tileCacheSize = 100;

        /**
         * Enable lighting the globe with the sun as a light source.
         *
         * @type {Boolean}
         * @default true
         */
        this.enableLighting = false;

        /**
         * Enable the ground atmosphere, which is drawn over the globe when viewed from a distance between <code>lightingFadeInDistance</code> and <code>lightingFadeOutDistance</code>.
         *
         * @demo {@link https://cesiumjs.org/Cesium/Apps/Sandcastle/index.html?src=Ground%20Atmosphere.html|Ground atmosphere demo in Sandcastle}
         *
         * @type {Boolean}
         * @default true
         */
        this.showGroundAtmosphere = true;

        /**
         * The distance where everything becomes lit. This only takes effect
         * when <code>enableLighting</code> or <code>showGroundAtmosphere</code> is <code>true</code>.
         *
         * @type {Number}
         * @default 10000000.0
         */
        this.lightingFadeOutDistance = 1.0e7;

        /**
         * The distance where lighting resumes. This only takes effect
         * when <code>enableLighting</code> or <code>showGroundAtmosphere</code> is <code>true</code>.
         *
         * @type {Number}
         * @default 20000000.0
         */
        this.lightingFadeInDistance = 2.0e7;

        /**
         * The distance where the darkness of night from the ground atmosphere fades out to a lit ground atmosphere.
         * This only takes effect when <code>showGroundAtmosphere</code> and <code>enableLighting</code> are <code>true</code>.
         *
         * @type {Number}
         * @default 10000000.0
         */
        this.nightFadeOutDistance = 1.0e7;

        /**
         * The distance where the darkness of night from the ground atmosphere fades in to an unlit ground atmosphere.
         * This only takes effect when <code>showGroundAtmosphere</code> and <code>enableLighting</code> are <code>true</code>.
         *
         * @type {Number}
         * @default 50000000.0
         */
        this.nightFadeInDistance = 5.0e7;

        /**
         * True if an animated wave effect should be shown in areas of the globe
         * covered by water; otherwise, false.  This property is ignored if the
         * <code>terrainProvider</code> does not provide a water mask.
         *
         * @type {Boolean}
         * @default true
         */
        this.showWaterEffect = true;

        /**
         * True if primitives such as billboards, polylines, labels, etc. should be depth-tested
         * against the terrain surface, or false if such primitives should always be drawn on top
         * of terrain unless they're on the opposite side of the globe.  The disadvantage of depth
         * testing primitives against terrain is that slight numerical noise or terrain level-of-detail
         * switched can sometimes make a primitive that should be on the surface disappear underneath it.
         *
         * @type {Boolean}
         * @default false
         *
         */
        this.depthTestAgainstTerrain = false;

        /**
         * Determines whether the globe casts or receives shadows from each light source. Setting the globe
         * to cast shadows may impact performance since the terrain is rendered again from the light's perspective.
         * Currently only terrain that is in view casts shadows. By default the globe does not cast shadows.
         *
         * @type {ShadowMode}
         * @default ShadowMode.RECEIVE_ONLY
         */
        this.shadows = ShadowMode.RECEIVE_ONLY;

        /**
         * The hue shift to apply to the atmosphere. Defaults to 0.0 (no shift).
         * A hue shift of 1.0 indicates a complete rotation of the hues available.
         * @type {Number}
         * @default 0.0
         */
        this.atmosphereHueShift = 0.0;

        /**
         * The saturation shift to apply to the atmosphere. Defaults to 0.0 (no shift).
         * A saturation shift of -1.0 is monochrome.
         * @type {Number}
         * @default 0.0
         */
        this.atmosphereSaturationShift = 0.0;

        /**
         * The brightness shift to apply to the atmosphere. Defaults to 0.0 (no shift).
         * A brightness shift of -1.0 is complete darkness, which will let space show through.
         * @type {Number}
         * @default 0.0
         */
        this.atmosphereBrightnessShift = 0.0;

        this._oceanNormalMap = undefined;
        this._zoomedOutOceanSpecularIntensity = undefined;
    }

    defineProperties(Globe.prototype, {
        /**
         * Gets an ellipsoid describing the shape of this globe.
         * @memberof Globe.prototype
         * @type {Ellipsoid}
         */
        ellipsoid : {
            get : function() {
                return this._ellipsoid;
            }
        },
        /**
         * Gets the collection of image layers that will be rendered on this globe.
         * @memberof Globe.prototype
         * @type {ImageryLayerCollection}
         */
        imageryLayers : {
            get : function() {
                return this._imageryLayerCollection;
            }
        },
        /**
         * Gets an event that's raised when an imagery layer is added, shown, hidden, moved, or removed.
         *
         * @memberof Globe.prototype
         * @type {Event}
         * @readonly
         */
        imageryLayersUpdatedEvent : {
            get : function() {
                return this._surface.tileProvider.imageryLayersUpdatedEvent;
            }
        },
        /**
         * Returns <code>true</code> when the tile load queue is empty, <code>false</code> otherwise.  When the load queue is empty,
         * all terrain and imagery for the current view have been loaded.
         * @memberof Globe.prototype
         * @type {Boolean}
         * @readonly
         */
        tilesLoaded: {
            get: function() {
                if (!defined(this._surface)) {
                    return true;
                }
                return (this._surface.tileProvider.ready && this._surface._tileLoadQueueHigh.length === 0 && this._surface._tileLoadQueueMedium.length === 0 && this._surface._tileLoadQueueLow.length === 0);
            }
        },
        /**
         * Gets or sets the color of the globe when no imagery is available.
         * @memberof Globe.prototype
         * @type {Color}
         */
        baseColor : {
            get : function() {
                return this._surface.tileProvider.baseColor;
            },
            set : function(value) {
                this._surface.tileProvider.baseColor = value;
            }
        },
        /**
         * A property specifying a {@link ClippingPlaneCollection} used to selectively disable rendering on the outside of each plane.
         *
         * @memberof Globe.prototype
         * @type {ClippingPlaneCollection}
         */
        clippingPlanes : {
            get : function() {
                return this._surface.tileProvider.clippingPlanes;
            },
            set : function(value) {
                this._surface.tileProvider.clippingPlanes = value;
            }
        },
        cartographicLimitRectangle : {
            get : function() {
                return this._surface.tileProvider.cartographicLimitRectangle;
            },
            set : function(value) {
                this._surface.tileProvider.cartographicLimitRectangle = value;
            }
        },
        /**
         * The normal map to use for rendering waves in the ocean.  Setting this property will
         * only have an effect if the configured terrain provider includes a water mask.
         * @memberof Globe.prototype
         * @type {String}
         * @default buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg')
         */
        oceanNormalMapUrl: {
            get: function() {
                return this._oceanNormalMapResource.url;
            },
            set: function(value) {
                this._oceanNormalMapResource.url = value;
                this._oceanNormalMapResourceDirty = true;
            }
        },
        /**
         * The terrain provider providing surface geometry for this globe.
         * @type {TerrainProvider}
         *
         * @memberof Globe.prototype
         * @type {TerrainProvider}
         *
         */
        terrainProvider : {
            get : function() {
                return this._terrainProvider;
            },
            set : function(value) {
                if (value !== this._terrainProvider) {
                    this._terrainProvider = value;
                    this._terrainProviderChanged.raiseEvent(value);
                    if (defined(this._material)) {
                        makeShadersDirty(this);
                    }
                }
            }
        },
        /**
         * Gets an event that's raised when the terrain provider is changed
         *
         * @memberof Globe.prototype
         * @type {Event}
         * @readonly
         */
        terrainProviderChanged : {
            get: function() {
                return this._terrainProviderChanged;
            }
        },
        /**
         * Gets an event that's raised when the length of the tile load queue has changed since the last render frame.  When the load queue is empty,
         * all terrain and imagery for the current view have been loaded.  The event passes the new length of the tile load queue.
         *
         * @memberof Globe.prototype
         * @type {Event}
         */
        tileLoadProgressEvent : {
            get: function() {
                return this._surface.tileLoadProgressEvent;
            }
        },

        /**
         * Gets or sets the material appearance of the Globe.  This can be one of several built-in {@link Material} objects or a custom material, scripted with
         * {@link https://github.com/AnalyticalGraphicsInc/cesium/wiki/Fabric|Fabric}.
         * @memberof Globe.prototype
         * @type {Material}
         */
        material: {
            get: function() {
                return this._material;
            },
            set: function(material) {
                if (this._material !== material) {
                    this._material = material;
                    makeShadersDirty(this);
                }
            }
        }
    });

    function makeShadersDirty(globe) {
        var defines = [];

        var requireNormals = defined(globe._material) && (globe._material.shaderSource.match(/slope/) || globe._material.shaderSource.match('normalEC'));

        var fragmentSources = [GroundAtmosphere];
        if (defined(globe._material) && (!requireNormals || globe._terrainProvider.requestVertexNormals)) {
            fragmentSources.push(globe._material.shaderSource);
            defines.push('APPLY_MATERIAL');
            globe._surface._tileProvider.uniformMap = globe._material._uniforms;
        } else {
            globe._surface._tileProvider.uniformMap = undefined;
        }
        fragmentSources.push(GlobeFS);

        globe._surfaceShaderSet.baseVertexShaderSource = new ShaderSource({
            sources : [GroundAtmosphere, GlobeVS],
            defines : defines
        });

        globe._surfaceShaderSet.baseFragmentShaderSource = new ShaderSource({
            sources : fragmentSources,
            defines : defines
        });
        globe._surfaceShaderSet.material = globe._material;
    }

    function createComparePickTileFunction(rayOrigin) {
        return function(a, b) {
            var aDist = BoundingSphere.distanceSquaredTo(a.pickBoundingSphere, rayOrigin);
            var bDist = BoundingSphere.distanceSquaredTo(b.pickBoundingSphere, rayOrigin);

            return aDist - bDist;
        };
    }

    var scratchArray = [];
    var scratchSphereIntersectionResult = {
        start : 0.0,
        stop : 0.0
    };

    /**
     * Find an intersection between a ray and the globe surface that was rendered. The ray must be given in world coordinates.
     *
     * @param {Ray} ray The ray to test for intersection.
     * @param {Scene} scene The scene.
     * @param {Cartesian3} [result] The object onto which to store the result.
     * @returns {Cartesian3|undefined} The intersection or <code>undefined</code> if none was found.  The returned position is in projected coordinates for 2D and Columbus View.
     *
     * @private
     */
    Globe.prototype.pickWorldCoordinates = function(ray, scene, result) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(ray)) {
            throw new DeveloperError('ray is required');
        }
        if (!defined(scene)) {
            throw new DeveloperError('scene is required');
        }
        //>>includeEnd('debug');

        var mode = scene.mode;
        var projection = scene.mapProjection;

        var sphereIntersections = scratchArray;
        sphereIntersections.length = 0;

        var tilesToRender = this._surface._tilesToRender;
        var length = tilesToRender.length;

        var tile;
        var i;

        for (i = 0; i < length; ++i) {
            tile = tilesToRender[i];
            var surfaceTile = tile.data;

            if (!defined(surfaceTile)) {
                continue;
            }

            var boundingVolume = surfaceTile.pickBoundingSphere;
            if (mode !== SceneMode.SCENE3D) {
                // TODO: ok to allocate / recreate the bounding sphere every time here?
                boundingVolume = BoundingSphere.fromRectangleWithHeights2D(tile.rectangle, projection, surfaceTile.tileBoundingRegion.minimumHeight, surfaceTile.tileBoundingRegion.maximumHeight, boundingVolume);
                Cartesian3.fromElements(boundingVolume.center.z, boundingVolume.center.x, boundingVolume.center.y, boundingVolume.center);
            } else if (defined(surfaceTile.renderedMesh)) {
                BoundingSphere.clone(surfaceTile.renderedMesh.boundingSphere3D, boundingVolume);
            } else {
                // So wait how did we render this thing then? It shouldn't be possible to get here.
                continue;
            }

            var boundingSphereIntersection = IntersectionTests.raySphere(ray, boundingVolume, scratchSphereIntersectionResult);
            if (defined(boundingSphereIntersection)) {
                sphereIntersections.push(surfaceTile);
            }
        }

        sphereIntersections.sort(createComparePickTileFunction(ray.origin));

        var intersection;
        length = sphereIntersections.length;
        for (i = 0; i < length; ++i) {
            intersection = sphereIntersections[i].pick(ray, scene.mode, scene.mapProjection, true, result);
            if (defined(intersection)) {
                break;
            }
        }

        return intersection;
    };

    var cartoScratch = new Cartographic();
    /**
     * Find an intersection between a ray and the globe surface that was rendered. The ray must be given in world coordinates.
     *
     * @param {Ray} ray The ray to test for intersection.
     * @param {Scene} scene The scene.
     * @param {Cartesian3} [result] The object onto which to store the result.
     * @returns {Cartesian3|undefined} The intersection or <code>undefined</code> if none was found.
     *
     * @example
     * // find intersection of ray through a pixel and the globe
     * var ray = viewer.camera.getPickRay(windowCoordinates);
     * var intersection = globe.pick(ray, scene);
     */
    Globe.prototype.pick = function(ray, scene, result) {
        result = this.pickWorldCoordinates(ray, scene, result);
        if (defined(result) && scene.mode !== SceneMode.SCENE3D) {
            result = Cartesian3.fromElements(result.y, result.z, result.x, result);
            var carto = scene.mapProjection.unproject(result, cartoScratch);
            result = scene.globe.ellipsoid.cartographicToCartesian(carto, result);
        }

        return result;
    };

    var scratchGetHeightCartesian = new Cartesian3();
    var scratchGetHeightIntersection = new Cartesian3();
    var scratchGetHeightCartographic = new Cartographic();
    var scratchGetHeightRay = new Ray();

    function tileIfContainsCartographic(tile, cartographic) {
        return Rectangle.contains(tile.rectangle, cartographic) ? tile : undefined;
    }

    /**
     * Get the height of the surface at a given cartographic.
     *
     * @param {Cartographic} cartographic The cartographic for which to find the height.
     * @returns {Number|undefined} The height of the cartographic or undefined if it could not be found.
     */
    Globe.prototype.getHeight = function(cartographic) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(cartographic)) {
            throw new DeveloperError('cartographic is required');
        }
        //>>includeEnd('debug');

        var levelZeroTiles = this._surface._levelZeroTiles;
        if (!defined(levelZeroTiles)) {
            return;
        }

        var tile;
        var i;

        var length = levelZeroTiles.length;
        for (i = 0; i < length; ++i) {
            tile = levelZeroTiles[i];
            if (Rectangle.contains(tile.rectangle, cartographic)) {
                break;
            }
        }

        if (i >= length) {
            return undefined;
        }

        while (tile._lastSelectionResult === TileSelectionResult.REFINED) {
            tile = tileIfContainsCartographic(tile.southwestChild, cartographic) ||
                   tileIfContainsCartographic(tile.southeastChild, cartographic) ||
                   tileIfContainsCartographic(tile.northwestChild, cartographic) ||
                   tile.northeastChild;
        }

        if (tile._lastSelectionResult !== TileSelectionResult.RENDERED) {
            // Tile was not rendered (culled).
            return undefined;
        }

        var ellipsoid = this._surface._tileProvider.tilingScheme.ellipsoid;

        //cartesian has to be on the ellipsoid surface for `ellipsoid.geodeticSurfaceNormal`
        var cartesian = Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0.0, ellipsoid, scratchGetHeightCartesian);

        var ray = scratchGetHeightRay;
        var surfaceNormal = ellipsoid.geodeticSurfaceNormal(cartesian, ray.direction);

        // Try to find the intersection point between the surface normal and z-axis.
        // minimum height (-11500.0) for the terrain set, need to get this information from the terrain provider
        var rayOrigin = ellipsoid.getSurfaceNormalIntersectionWithZAxis(cartesian, 11500.0, ray.origin);

        // Theoretically, not with Earth datums, the intersection point can be outside the ellipsoid
        if (!defined(rayOrigin)) {
            // intersection point is outside the ellipsoid, try other value
            // minimum height (-11500.0) for the terrain set, need to get this information from the terrain provider
            var magnitude = Math.min(defaultValue(tile.data.minimumHeight, 0.0), -11500.0);

            // multiply by the *positive* value of the magnitude
            var vectorToMinimumPoint = Cartesian3.multiplyByScalar(surfaceNormal, Math.abs(magnitude) + 1, scratchGetHeightIntersection);
            Cartesian3.subtract(cartesian, vectorToMinimumPoint, ray.origin);
        }

        var intersection = tile.data.pick(ray, undefined, undefined, false, scratchGetHeightIntersection);
        if (!defined(intersection)) {
            return undefined;
        }

        var height = ellipsoid.cartesianToCartographic(intersection, scratchGetHeightCartographic).height;

        // For low-detail tiles, large triangles often cut the the globe and appear to be at a much
        // lower height than actually makes any sense. So clamp the height to the actual height range
        // of the tile.
        height = Math.max(height, tile.data.tileBoundingRegion.minimumHeight);
        height = Math.min(height, tile.data.tileBoundingRegion.maximumHeight);
        return height;
    };

    /**
     * @private
     */
    Globe.prototype.update = function(frameState) {
        if (!this.show) {
            return;
        }

        if (frameState.passes.render) {
            this._surface.update(frameState);
        }
    };

    /**
     * @private
     */
    Globe.prototype.beginFrame = function(frameState) {
        var surface = this._surface;
        var tileProvider = surface.tileProvider;
        var terrainProvider = this.terrainProvider;
        var hasWaterMask = this.showWaterEffect && terrainProvider.ready && terrainProvider.hasWaterMask;

        if (hasWaterMask && this._oceanNormalMapResourceDirty) {
            // url changed, load new normal map asynchronously
            this._oceanNormalMapResourceDirty = false;
            var oceanNormalMapResource = this._oceanNormalMapResource;
            var oceanNormalMapUrl =  oceanNormalMapResource.url;
            if (defined(oceanNormalMapUrl)) {
                var that = this;
                when(oceanNormalMapResource.fetchImage(), function(image) {
                    if (oceanNormalMapUrl !== that._oceanNormalMapResource.url) {
                        // url changed while we were loading
                        return;
                    }

                    that._oceanNormalMap = that._oceanNormalMap && that._oceanNormalMap.destroy();
                    that._oceanNormalMap = new Texture({
                        context : frameState.context,
                        source : image
                    });
                });
            } else {
                this._oceanNormalMap = this._oceanNormalMap && this._oceanNormalMap.destroy();
            }
        }

        var pass = frameState.passes;
        var mode = frameState.mode;

        if (pass.render) {
            if (this.showGroundAtmosphere) {
                this._zoomedOutOceanSpecularIntensity = 0.4;
            } else {
                this._zoomedOutOceanSpecularIntensity = 0.5;
            }

            surface.maximumScreenSpaceError = this.maximumScreenSpaceError;
            surface.tileCacheSize = this.tileCacheSize;

            tileProvider.terrainProvider = this.terrainProvider;
            tileProvider.lightingFadeOutDistance = this.lightingFadeOutDistance;
            tileProvider.lightingFadeInDistance = this.lightingFadeInDistance;
            tileProvider.nightFadeOutDistance = this.nightFadeOutDistance;
            tileProvider.nightFadeInDistance = this.nightFadeInDistance;
            tileProvider.zoomedOutOceanSpecularIntensity = mode === SceneMode.SCENE3D ? this._zoomedOutOceanSpecularIntensity : 0.0;
            tileProvider.hasWaterMask = hasWaterMask;
            tileProvider.oceanNormalMap = this._oceanNormalMap;
            tileProvider.enableLighting = this.enableLighting;
            tileProvider.showGroundAtmosphere = this.showGroundAtmosphere;
            tileProvider.shadows = this.shadows;
            tileProvider.hueShift = this.atmosphereHueShift;
            tileProvider.saturationShift = this.atmosphereSaturationShift;
            tileProvider.brightnessShift = this.atmosphereBrightnessShift;

            surface.beginFrame(frameState);
        }
    };

    /**
     * @private
     */
    Globe.prototype.render = function(frameState) {
        if (!this.show) {
            return;
        }

        if (defined(this._material)) {
            this._material.update(frameState.context);
        }

        var surface = this._surface;
        var pass = frameState.passes;

        if (pass.render) {
            surface.render(frameState);
        }

        if (pass.pick) {
            surface.render(frameState);
        }
    };

    /**
     * @private
     */
    Globe.prototype.endFrame = function(frameState) {
        if (!this.show) {
            return;
        }

        if (frameState.passes.render) {
            this._surface.endFrame(frameState);
        }
    };

    /**
     * Returns true if this object was destroyed; otherwise, false.
     * <br /><br />
     * If this object was destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
     *
     * @returns {Boolean} True if this object was destroyed; otherwise, false.
     *
     * @see Globe#destroy
     */
    Globe.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
     * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
     * <br /><br />
     * Once an object is destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
     * assign the return value (<code>undefined</code>) to the object as done in the example.
     *
     * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
     *
     *
     * @example
     * globe = globe && globe.destroy();
     *
     * @see Globe#isDestroyed
     */
    Globe.prototype.destroy = function() {
        this._surfaceShaderSet = this._surfaceShaderSet && this._surfaceShaderSet.destroy();
        this._surface = this._surface && this._surface.destroy();
        this._oceanNormalMap = this._oceanNormalMap && this._oceanNormalMap.destroy();
        return destroyObject(this);
    };

    return Globe;
});
