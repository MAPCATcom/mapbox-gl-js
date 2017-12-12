// @flow

const {
    symbolLayoutAttributes,
    collisionVertexAttributes,
    collisionBoxLayout,
    collisionCircleLayout,
    dynamicLayoutAttributes
} = require('./symbol_attributes');

const {
    SymbolLayoutArray,
    SymbolDynamicLayoutArray,
    SymbolOpacityArray,
    CollisionBoxLayoutArray,
    CollisionCircleLayoutArray,
    CollisionVertexArray,
    PlacedSymbolArray,
    GlyphOffsetArray,
    SymbolLineVertexArray
} = require('../array_types');

const Point = require('@mapbox/point-geometry');
const {SegmentVector} = require('../segment');
const {ProgramConfigurationSet} = require('../program_configuration');
const {TriangleIndexArray, LineIndexArray} = require('../index_array_type');
const transformText = require('../../symbol/transform_text');
const mergeLines = require('../../symbol/mergelines');
const scriptDetection = require('../../util/script_detection');
const loadGeometry = require('../load_geometry');
const vectorTileFeatureTypes = require('@mapbox/vector-tile').VectorTileFeature.types;
const verticalizePunctuation = require('../../util/verticalize_punctuation');
const Anchor = require('../../symbol/anchor');
const {getSizeData} = require('../../symbol/symbol_size');
const {register} = require('../../util/web_worker_transfer');

import type {Feature as ExpressionFeature} from '../../style-spec/expression';
import type {
    Bucket,
    BucketParameters,
    IndexedFeature,
    PopulateParameters
} from '../bucket';
import type {CollisionBoxArray, CollisionBox} from '../array_types';
import type { StructArray, StructArrayMember } from '../../util/struct_array';
import type SymbolStyleLayer from '../../style/style_layer/symbol_style_layer';
import type Context from '../../gl/context';
import type IndexBuffer from '../../gl/index_buffer';
import type VertexBuffer from '../../gl/vertex_buffer';
import type {SymbolQuad} from '../../symbol/quads';
import type {SizeData} from '../../symbol/symbol_size';

export type SingleCollisionBox = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    anchorPointX: number;
    anchorPointY: number;
};

export type CollisionArrays = {
    textBox?: SingleCollisionBox;
    iconBox?: SingleCollisionBox;
    textCircles?: Array<number>;
};

export type SymbolInstance = {
    key: string,
    textBoxStartIndex: number,
    textBoxEndIndex: number,
    iconBoxStartIndex: number,
    iconBoxEndIndex: number,
    textOffset: [number, number],
    iconOffset: [number, number],
    anchor: Anchor,
    line: Array<Point>,
    featureIndex: number,
    feature: ExpressionFeature,
    textCollisionFeature?: {boxStartIndex: number, boxEndIndex: number},
    iconCollisionFeature?: {boxStartIndex: number, boxEndIndex: number},
    placedTextSymbolIndices: Array<number>;
    numGlyphVertices: number;
    numVerticalGlyphVertices: number;
    numIconVertices: number;
    // Populated/modified on foreground during placement
    isDuplicate: boolean;
    crossTileID: number;
    collisionArrays?: CollisionArrays;
    placedText?: boolean;
    placedIcon?: boolean;
    hidden?: boolean;
};

export type SymbolFeature = {|
    text: string | void,
    icon: string | void,
    index: number,
    sourceLayerIndex: number,
    geometry: Array<Array<Point>>,
    properties: Object,
    type: 'Point' | 'LineString' | 'Polygon',
    id?: any
|};

// Opacity arrays are frequently updated but don't contain a lot of information, so we pack them
// tight. Each Uint32 is actually four duplicate Uint8s for the four corners of a glyph
// 7 bits are for the current opacity, and the lowest bit is the target opacity

// actually defined in symbol_attributes.js
// const placementOpacityAttributes = [
//     { name: 'a_fade_opacity', components: 1, type: 'Uint32' }
// ];
const shaderOpacityAttributes = [
    { name: 'a_fade_opacity', components: 1, type: 'Uint8', offset: 0 }
];

type SymbolBufferConfiguration<IndexArray> = {
    LayoutArray: Class<StructArray>,
    layoutAttributes: Array<StructArrayMember>,
    IndexArray: Class<IndexArray>,
    dynamicLayout: boolean,
    opacity: boolean,
    collision: boolean
}

const symbolBufferConfigurations = {
    text: {
        LayoutArray: SymbolLayoutArray,
        layoutAttributes: symbolLayoutAttributes.members,
        IndexArray: TriangleIndexArray,
        dynamicLayout: true,
        opacity: true,
        collision: false
    },
    icon: {
        LayoutArray: SymbolLayoutArray,
        layoutAttributes: symbolLayoutAttributes.members,
        IndexArray: TriangleIndexArray,
        dynamicLayout: true,
        opacity: true,
        collision: false
    },
    collisionBox: { // used to render collision boxes for debugging purposes
        LayoutArray: CollisionBoxLayoutArray,
        layoutAttributes: collisionBoxLayout.members,
        IndexArray: LineIndexArray,
        dynamicLayout: false,
        opacity: false,
        collision: true
    },
    collisionCircle: { // used to render collision circles for debugging purposes
        LayoutArray: CollisionCircleLayoutArray,
        layoutAttributes: collisionCircleLayout.members,
        IndexArray: TriangleIndexArray,
        dynamicLayout: false,
        opacity: false,
        collision: true
    }
};

function addVertex(array, anchorX, anchorY, ox, oy, tx, ty, sizeVertex) {
    array.emplaceBack(
        // a_pos_offset
        anchorX,
        anchorY,
        Math.round(ox * 64),
        Math.round(oy * 64),

        // a_data
        tx, // x coordinate of symbol on glyph atlas texture
        ty, // y coordinate of symbol on glyph atlas texture
        sizeVertex ? sizeVertex[0] : undefined,
        sizeVertex ? sizeVertex[1] : undefined
    );
}

function addDynamicAttributes(dynamicLayoutVertexArray: StructArray, p: Point, angle: number) {
    dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
    dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
    dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
    dynamicLayoutVertexArray.emplaceBack(p.x, p.y, angle);
}

class SymbolBuffers<IndexArray: TriangleIndexArray | LineIndexArray> {
    layoutVertexArray: StructArray;
    layoutAttributes: Array<StructArrayMember>;
    layoutVertexBuffer: VertexBuffer;

    indexArray: IndexArray;
    indexBuffer: IndexBuffer;

    programConfigurations: ProgramConfigurationSet<SymbolStyleLayer>;
    segments: SegmentVector;

    dynamicLayoutVertexArray: SymbolDynamicLayoutArray;
    dynamicLayoutVertexBuffer: VertexBuffer;

    opacityVertexArray: SymbolOpacityArray;
    opacityVertexBuffer: VertexBuffer;

    collisionVertexArray: CollisionVertexArray;
    collisionVertexBuffer: VertexBuffer;

    constructor(configuration: SymbolBufferConfiguration<IndexArray>, programConfigurations: ProgramConfigurationSet<SymbolStyleLayer>) {
        this.layoutVertexArray = new configuration.LayoutArray();
        this.layoutAttributes = configuration.layoutAttributes;
        this.indexArray = new configuration.IndexArray();
        this.programConfigurations = programConfigurations;
        this.segments = new SegmentVector();

        if (configuration.dynamicLayout) {
            this.dynamicLayoutVertexArray = new SymbolDynamicLayoutArray();
        }

        if (configuration.opacity) {
            this.opacityVertexArray = new SymbolOpacityArray();
        }

        if (configuration.collision) {
            this.collisionVertexArray = new CollisionVertexArray();
        }
    }

    upload(context: Context, dynamicIndexBuffer: boolean = false) {
        this.layoutVertexBuffer = context.createVertexBuffer(this.layoutVertexArray, this.layoutAttributes);
        this.indexBuffer = context.createIndexBuffer(this.indexArray, dynamicIndexBuffer);
        this.programConfigurations.upload(context);

        if (this.dynamicLayoutVertexArray) {
            this.dynamicLayoutVertexBuffer = context.createVertexBuffer(this.dynamicLayoutVertexArray, dynamicLayoutAttributes.members, true);
        }
        if (this.opacityVertexArray) {
            this.opacityVertexBuffer = context.createVertexBuffer(this.opacityVertexArray, shaderOpacityAttributes, true);
            // This is a performance hack so that we can write to opacityVertexArray with uint32s
            // even though the shaders read uint8s
            this.opacityVertexBuffer.itemSize = 1;
        }
        if (this.collisionVertexArray) {
            this.collisionVertexBuffer = context.createVertexBuffer(this.collisionVertexArray, collisionVertexAttributes.members, true);
        }
    }

    destroy() {
        if (!this.layoutVertexBuffer) return;
        this.layoutVertexBuffer.destroy();
        this.indexBuffer.destroy();
        this.programConfigurations.destroy();
        this.segments.destroy();
        if (this.dynamicLayoutVertexBuffer) {
            this.dynamicLayoutVertexBuffer.destroy();
        }
        if (this.opacityVertexBuffer) {
            this.opacityVertexBuffer.destroy();
        }
        if (this.collisionVertexBuffer) {
            this.collisionVertexBuffer.destroy();
        }
    }
}

register('SymbolBuffers', SymbolBuffers);

/**
 * Unlike other buckets, which simply implement #addFeature with type-specific
 * logic for (essentially) triangulating feature geometries, SymbolBucket
 * requires specialized behavior:
 *
 * 1. WorkerTile#parse(), the logical owner of the bucket creation process,
 *    calls SymbolBucket#populate(), which resolves text and icon tokens on
 *    each feature, adds each glyphs and symbols needed to the passed-in
 *    collections options.glyphDependencies and options.iconDependencies, and
 *    stores the feature data for use in subsequent step (this.features).
 *
 * 2. WorkerTile asynchronously requests from the main thread all of the glyphs
 *    and icons needed (by this bucket and any others). When glyphs and icons
 *    have been received, the WorkerTile creates a CollisionIndex and invokes:
 *
 * 3. performSymbolLayout(bucket, stacks, icons) perform texts shaping and
 *    layout on a Symbol Bucket. This step populates:
 *      `this.symbolInstances`: metadata on generated symbols
 *      `this.collisionBoxArray`: collision data for use by foreground
 *      `this.text`: SymbolBuffers for text symbols
 *      `this.icons`: SymbolBuffers for icons
 *      `this.collisionBox`: Debug SymbolBuffers for collision boxes
 *      `this.collisionCircle`: Debug SymbolBuffers for collision circles
 *    The results are sent to the foreground for rendering
 *
 * 4. performSymbolPlacement(bucket, collisionIndex) is run on the foreground,
 *    and uses the CollisionIndex along with current camera settings to determine
 *    which symbols can actually show on the map. Collided symbols are hidden
 *    using a dynamic "OpacityVertexArray".
 *
 * @private
 */
class SymbolBucket implements Bucket {
    static MAX_GLYPHS: number;
    static addDynamicAttributes: typeof addDynamicAttributes;

    collisionBoxArray: CollisionBoxArray;
    zoom: number;
    overscaling: number;
    layers: Array<SymbolStyleLayer>;
    layerIds: Array<string>;
    index: number;
    sdfIcons: boolean;
    iconsNeedLinear: boolean;
    bucketInstanceId: number;

    textSizeData: SizeData;
    iconSizeData: SizeData;

    placedGlyphArray: PlacedSymbolArray;
    placedIconArray: PlacedSymbolArray;
    glyphOffsetArray: GlyphOffsetArray;
    lineVertexArray: SymbolLineVertexArray;
    features: Array<SymbolFeature>;
    symbolInstances: Array<SymbolInstance>;
    pixelRatio: number;
    tilePixelRatio: number;
    compareText: {[string]: Array<Point>};
    fadeStartTime: number;
    sortFeaturesByY: boolean;
    sortedAngle: number;

    text: SymbolBuffers<TriangleIndexArray>;
    icon: SymbolBuffers<TriangleIndexArray>;
    collisionBox: SymbolBuffers<LineIndexArray>;
    uploaded: boolean;
    collisionCircle: SymbolBuffers<TriangleIndexArray>;

    constructor(options: BucketParameters<SymbolStyleLayer>) {
        this.collisionBoxArray = options.collisionBoxArray;
        this.zoom = options.zoom;
        this.overscaling = options.overscaling;
        this.layers = options.layers;
        this.layerIds = this.layers.map(layer => layer.id);
        this.index = options.index;
        this.pixelRatio = options.pixelRatio;

        const layer = this.layers[0];
        const unevaluatedLayoutValues = layer._unevaluatedLayout._values;

        this.textSizeData = getSizeData(this.zoom, unevaluatedLayoutValues['text-size']);
        this.iconSizeData = getSizeData(this.zoom, unevaluatedLayoutValues['icon-size']);

        const layout = this.layers[0].layout;
        this.sortFeaturesByY = layout.get('text-allow-overlap') || layout.get('icon-allow-overlap') ||
            layout.get('text-ignore-placement') || layout.get('icon-ignore-placement');
    }

    createArrays() {
        this.text = new SymbolBuffers(symbolBufferConfigurations.text, new ProgramConfigurationSet(symbolLayoutAttributes.members, this.layers, this.zoom, property => /^text/.test(property)));
        this.icon = new SymbolBuffers(symbolBufferConfigurations.icon, new ProgramConfigurationSet(symbolLayoutAttributes.members, this.layers, this.zoom, property => /^icon/.test(property)));
        this.collisionBox = new SymbolBuffers(symbolBufferConfigurations.collisionBox, new ProgramConfigurationSet(collisionBoxLayout.members, this.layers, this.zoom, () => false));
        this.collisionCircle = new SymbolBuffers(symbolBufferConfigurations.collisionCircle, new ProgramConfigurationSet(collisionCircleLayout.members, this.layers, this.zoom, () => false));

        this.placedGlyphArray = new PlacedSymbolArray();
        this.placedIconArray = new PlacedSymbolArray();
        this.glyphOffsetArray = new GlyphOffsetArray();
        this.lineVertexArray = new SymbolLineVertexArray();
    }

    populate(features: Array<IndexedFeature>, options: PopulateParameters) {
        const layer = this.layers[0];
        const layout = layer.layout;

        const textFont = layout.get('text-font');
        const textField = layout.get('text-field');
        const iconImage = layout.get('icon-image');
        const hasText =
            (textField.value.kind !== 'constant' || textField.value.value.length > 0) &&
            (textFont.value.kind !== 'constant' || textFont.value.value.length > 0);
        const hasIcon = iconImage.value.kind !== 'constant' || iconImage.value.value && iconImage.value.value.length > 0;

        this.features = [];

        if (!hasText && !hasIcon) {
            return;
        }

        const icons = options.iconDependencies;
        const stacks = options.glyphDependencies;
        const globalProperties =  {zoom: this.zoom};

        for (const {feature, index, sourceLayerIndex} of features) {
            if (!layer._featureFilter(globalProperties, feature)) {
                continue;
            }

            let text;
            if (hasText) {
                text = layer.getValueAndResolveTokens('text-field', feature);
                text = transformText(text, layer, feature);
            }

            let icon;
            if (hasIcon) {
                icon = layer.getValueAndResolveTokens('icon-image', feature);
            }

            if (!text && !icon) {
                continue;
            }

            const symbolFeature: SymbolFeature = {
                text,
                icon,
                index,
                sourceLayerIndex,
                geometry: loadGeometry(feature),
                properties: feature.properties,
                type: vectorTileFeatureTypes[feature.type]
            };
            if (typeof feature.id !== 'undefined') {
                symbolFeature.id = feature.id;
            }
            this.features.push(symbolFeature);

            if (icon) {
                icons[icon] = true;
            }

            if (text) {
                const fontStack = textFont.evaluate(feature).join(',');
                const stack = stacks[fontStack] = stacks[fontStack] || {};
                const textAlongLine = layout.get('text-rotation-alignment') === 'map' && layout.get('symbol-placement') === 'line';
                const allowsVerticalWritingMode = scriptDetection.allowsVerticalWritingMode(text);
                for (let i = 0; i < text.length; i++) {
                    stack[text.charCodeAt(i)] = true;
                    if (textAlongLine && allowsVerticalWritingMode) {
                        const verticalChar = verticalizePunctuation.lookup[text.charAt(i)];
                        if (verticalChar) {
                            stack[verticalChar.charCodeAt(0)] = true;
                        }
                    }
                }
            }
        }

        if (layout.get('symbol-placement') === 'line') {
            // Merge adjacent lines with the same text to improve labelling.
            // It's better to place labels on one long line than on many short segments.
            this.features = mergeLines(this.features);
        }
    }


    isEmpty() {
        return this.symbolInstances.length === 0;
    }

    upload(context: Context) {
        this.text.upload(context, this.sortFeaturesByY);
        this.icon.upload(context, this.sortFeaturesByY);
        this.collisionBox.upload(context);
        this.collisionCircle.upload(context);
    }

    destroy() {
        this.text.destroy();
        this.icon.destroy();
        this.collisionBox.destroy();
        this.collisionCircle.destroy();
    }

    addToLineVertexArray(anchor: Anchor, line: any) {
        const lineStartIndex = this.lineVertexArray.length;
        if (anchor.segment !== undefined) {
            let sumForwardLength = anchor.dist(line[anchor.segment + 1]);
            let sumBackwardLength = anchor.dist(line[anchor.segment]);
            const vertices = {};
            for (let i = anchor.segment + 1; i < line.length; i++) {
                vertices[i] = { x: line[i].x, y: line[i].y, tileUnitDistanceFromAnchor: sumForwardLength };
                if (i < line.length - 1) {
                    sumForwardLength += line[i + 1].dist(line[i]);
                }
            }
            for (let i = anchor.segment || 0; i >= 0; i--) {
                vertices[i] = { x: line[i].x, y: line[i].y, tileUnitDistanceFromAnchor: sumBackwardLength };
                if (i > 0) {
                    sumBackwardLength += line[i - 1].dist(line[i]);
                }
            }
            for (let i = 0; i < line.length; i++) {
                const vertex = vertices[i];
                this.lineVertexArray.emplaceBack(vertex.x, vertex.y, vertex.tileUnitDistanceFromAnchor);
            }
        }
        return {
            lineStartIndex: lineStartIndex,
            lineLength: this.lineVertexArray.length - lineStartIndex
        };
    }

    addSymbols(arrays: SymbolBuffers<*>,
               quads: Array<SymbolQuad>,
               sizeVertex: any,
               lineOffset: [number, number],
               alongLine: boolean,
               feature: ExpressionFeature,
               writingMode: any,
               labelAnchor: Anchor,
               lineStartIndex: number,
               lineLength: number,
               placedSymbolArray: PlacedSymbolArray) {
        const indexArray = arrays.indexArray;
        const layoutVertexArray = arrays.layoutVertexArray;
        const dynamicLayoutVertexArray = arrays.dynamicLayoutVertexArray;

        const segment = arrays.segments.prepareSegment(4 * quads.length, arrays.layoutVertexArray, arrays.indexArray);
        const glyphOffsetArrayStart = this.glyphOffsetArray.length;
        const vertexStartIndex = segment.vertexLength;

        for (const symbol of quads) {

            const tl = symbol.tl,
                tr = symbol.tr,
                bl = symbol.bl,
                br = symbol.br,
                tex = symbol.tex;

            const index = segment.vertexLength;

            const y = symbol.glyphOffset[1];
            addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tl.x, y + tl.y, tex.x, tex.y, sizeVertex);
            addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tr.x, y + tr.y, tex.x + tex.w, tex.y, sizeVertex);
            addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, bl.x, y + bl.y, tex.x, tex.y + tex.h, sizeVertex);
            addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, br.x, y + br.y, tex.x + tex.w, tex.y + tex.h, sizeVertex);

            addDynamicAttributes(dynamicLayoutVertexArray, labelAnchor, 0);

            indexArray.emplaceBack(index, index + 1, index + 2);
            indexArray.emplaceBack(index + 1, index + 2, index + 3);

            segment.vertexLength += 4;
            segment.primitiveLength += 2;

            this.glyphOffsetArray.emplaceBack(symbol.glyphOffset[0]);
        }

        placedSymbolArray.emplaceBack(labelAnchor.x, labelAnchor.y,
            glyphOffsetArrayStart, this.glyphOffsetArray.length - glyphOffsetArrayStart, vertexStartIndex,
            lineStartIndex, lineLength, (labelAnchor.segment: any),
            sizeVertex ? sizeVertex[0] : 0, sizeVertex ? sizeVertex[1] : 0,
            lineOffset[0], lineOffset[1],
            writingMode, (false: any));

        arrays.programConfigurations.populatePaintArrays(arrays.layoutVertexArray.length, feature);
    }

    _addCollisionDebugVertex(layoutVertexArray: StructArray, collisionVertexArray: StructArray, point: Point, anchor: Point, extrude: Point) {
        collisionVertexArray.emplaceBack(0, 0);
        return layoutVertexArray.emplaceBack(
            // pos
            point.x,
            point.y,
            // a_anchor_pos
            anchor.x,
            anchor.y,
            // extrude
            Math.round(extrude.x),
            Math.round(extrude.y));
    }


    addCollisionDebugVertices(x1: number, y1: number, x2: number, y2: number, arrays: SymbolBuffers<TriangleIndexArray> | SymbolBuffers<LineIndexArray>, boxAnchorPoint: Point, symbolInstance: SymbolInstance, isCircle: boolean) {
        const segment = arrays.segments.prepareSegment(4, arrays.layoutVertexArray, arrays.indexArray);
        const index = segment.vertexLength;

        const layoutVertexArray = arrays.layoutVertexArray;
        const collisionVertexArray = arrays.collisionVertexArray;

        this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, symbolInstance.anchor, new Point(x1, y1));
        this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, symbolInstance.anchor, new Point(x2, y1));
        this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, symbolInstance.anchor, new Point(x2, y2));
        this._addCollisionDebugVertex(layoutVertexArray, collisionVertexArray, boxAnchorPoint, symbolInstance.anchor, new Point(x1, y2));

        segment.vertexLength += 4;
        if (isCircle) {
            const indexArray: TriangleIndexArray = (arrays.indexArray: any);
            indexArray.emplaceBack(index, index + 1, index + 2);
            indexArray.emplaceBack(index, index + 2, index + 3);

            segment.primitiveLength += 2;
        } else {
            const indexArray: LineIndexArray = (arrays.indexArray: any);
            indexArray.emplaceBack(index, index + 1);
            indexArray.emplaceBack(index + 1, index + 2);
            indexArray.emplaceBack(index + 2, index + 3);
            indexArray.emplaceBack(index + 3, index);

            segment.primitiveLength += 4;
        }
    }

    generateCollisionDebugBuffers() {
        for (const symbolInstance of this.symbolInstances) {
            symbolInstance.textCollisionFeature = {boxStartIndex: symbolInstance.textBoxStartIndex, boxEndIndex: symbolInstance.textBoxEndIndex};
            symbolInstance.iconCollisionFeature = {boxStartIndex: symbolInstance.iconBoxStartIndex, boxEndIndex: symbolInstance.iconBoxEndIndex};

            for (let i = 0; i < 2; i++) {
                const feature = symbolInstance[i === 0 ? 'textCollisionFeature' : 'iconCollisionFeature'];
                if (!feature) continue;

                for (let b = feature.boxStartIndex; b < feature.boxEndIndex; b++) {
                    const box: CollisionBox = (this.collisionBoxArray.get(b): any);
                    const x1 = box.x1;
                    const y1 = box.y1;
                    const x2 = box.x2;
                    const y2 = box.y2;

                    // If the radius > 0, this collision box is actually a circle
                    // The data we add to the buffers is exactly the same, but we'll render with a different shader.
                    const isCircle = box.radius > 0;
                    this.addCollisionDebugVertices(x1, y1, x2, y2, isCircle ? this.collisionCircle : this.collisionBox, box.anchorPoint, symbolInstance, isCircle);
                }
            }
        }
    }

    // These flat arrays are meant to be quicker to iterate over than the source
    // CollisionBoxArray
    deserializeCollisionBoxes(collisionBoxArray: CollisionBoxArray, textStartIndex: number, textEndIndex: number, iconStartIndex: number, iconEndIndex: number): CollisionArrays {
        const collisionArrays = {};
        for (let k = textStartIndex; k < textEndIndex; k++) {
            const box: CollisionBox = (collisionBoxArray.get(k): any);
            if (box.radius === 0) {
                collisionArrays.textBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };

                break; // Only one box allowed per instance
            } else {
                if (!collisionArrays.textCircles) {
                    collisionArrays.textCircles = [];
                }
                const used = 1; // May be updated at collision detection time
                collisionArrays.textCircles.push(box.anchorPointX, box.anchorPointY, box.radius, box.signedDistanceFromAnchor, used);
            }
        }
        for (let k = iconStartIndex; k < iconEndIndex; k++) {
            // An icon can only have one box now, so this indexing is a bit vestigial...
            const box: CollisionBox = (collisionBoxArray.get(k): any);
            if (box.radius === 0) {
                collisionArrays.iconBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, anchorPointX: box.anchorPointX, anchorPointY: box.anchorPointY };
                break; // Only one box allowed per instance
            }
        }
        return collisionArrays;
    }

    hasTextData() {
        return this.text.segments.get().length > 0;
    }

    hasIconData() {
        return this.icon.segments.get().length > 0;
    }

    hasCollisionBoxData() {
        return this.collisionBox.segments.get().length > 0;
    }

    hasCollisionCircleData() {
        return this.collisionCircle.segments.get().length > 0;
    }

    sortFeatures(angle: number) {
        if (!this.sortFeaturesByY) return;

        if (this.sortedAngle === angle) return;
        this.sortedAngle = angle;

        // The current approach to sorting doesn't sort across segments so don't try.
        // Sorting within segments separately seemed not to be worth the complexity.
        if (this.text.segments.get().length > 1 || this.icon.segments.get().length > 1) return;

        // If the symbols are allowed to overlap sort them by their vertical screen position.
        // The index array buffer is rewritten to reference the (unchanged) vertices in the
        // sorted order.

        // To avoid sorting the actual symbolInstance array we sort an array of indexes.
        const symbolInstanceIndexes = [];
        for (let i = 0; i < this.symbolInstances.length; i++) {
            symbolInstanceIndexes.push(i);
        }

        const sin = Math.sin(angle),
            cos = Math.cos(angle);

        symbolInstanceIndexes.sort((aIndex, bIndex) => {
            const a = this.symbolInstances[aIndex];
            const b = this.symbolInstances[bIndex];
            const aRotated = (sin * a.anchor.x + cos * a.anchor.y) | 0;
            const bRotated = (sin * b.anchor.x + cos * b.anchor.y) | 0;
            return (aRotated - bRotated) || (b.featureIndex - a.featureIndex);
        });

        this.text.indexArray.clear();
        this.icon.indexArray.clear();

        for (const i of symbolInstanceIndexes) {
            const symbolInstance = this.symbolInstances[i];

            for (const placedTextSymbolIndex of symbolInstance.placedTextSymbolIndices) {
                const placedSymbol = (this.placedGlyphArray.get(placedTextSymbolIndex): any);

                const endIndex = placedSymbol.vertexStartIndex + placedSymbol.numGlyphs * 4;
                for (let vertexIndex = placedSymbol.vertexStartIndex; vertexIndex < endIndex; vertexIndex += 4) {
                    this.text.indexArray.emplaceBack(vertexIndex, vertexIndex + 1, vertexIndex + 2);
                    this.text.indexArray.emplaceBack(vertexIndex + 1, vertexIndex + 2, vertexIndex + 3);
                }
            }

            const placedIcon = (this.placedIconArray.get(i): any);
            if (placedIcon.numGlyphs) {
                const vertexIndex = placedIcon.vertexStartIndex;
                this.icon.indexArray.emplaceBack(vertexIndex, vertexIndex + 1, vertexIndex + 2);
                this.icon.indexArray.emplaceBack(vertexIndex + 1, vertexIndex + 2, vertexIndex + 3);
            }
        }

        if (this.text.indexBuffer) this.text.indexBuffer.updateData(this.text.indexArray);
        if (this.icon.indexBuffer) this.icon.indexBuffer.updateData(this.icon.indexArray);
    }
}

register('SymbolBucket', SymbolBucket, {
    omit: ['layers', 'collisionBoxArray', 'features', 'compareText'],
    shallow: ['symbolInstances']
});

// this constant is based on the size of StructArray indexes used in a symbol
// bucket--namely, glyphOffsetArrayStart
// eg the max valid UInt16 is 65,535
// See https://github.com/mapbox/mapbox-gl-js/issues/2907 for motivation
// lineStartIndex and textBoxStartIndex could potentially be concerns
// but we expect there to be many fewer boxes/lines than glyphs
SymbolBucket.MAX_GLYPHS = 65535;

SymbolBucket.addDynamicAttributes = addDynamicAttributes;

module.exports = SymbolBucket;
