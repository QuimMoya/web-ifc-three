import * as WebIFC from 'web-ifc';
import { ExportObject } from './subsets/ExportObject';
import { IFCParser, ParserAPI, ParserProgress } from './IFCParser';
import { SubsetManager } from './subsets/SubsetManager';
import { PropertyManager } from './properties/PropertyManager';
import { IfcElements } from './IFCElementsMap';
import { TypeManager } from './TypeManager';
import { SubsetConfig, IfcState, JSONObject } from '../BaseDefinitions';
import { BoxGeometry, BufferGeometry, Material, Mesh, MeshBasicMaterial, Object3D, CylinderGeometry, RingGeometry, Scene, Vector3 } from 'three';
import { IFCModel } from './IFCModel';
import { BvhManager } from './BvhManager';
import { IFCBUILDING, IFCBUILDINGSTOREY, IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCSITE, IFCWALL, IfcWall, LoaderSettings } from 'web-ifc';
import { IFCWorkerHandler } from '../web-workers/IFCWorkerHandler';
import { PropertyManagerAPI } from './properties/BaseDefinitions';
import { MemoryCleaner } from './MemoryCleaner';
import { IFCUtils } from './IFCUtils';
import { Data } from './sequence/Data'
import { IfcTypesMap } from './IfcTypesMap';
import { ExportHelper, pt } from './ExportHelper';

/**
 * Contains all the logic to work with the loaded IFC files (select, edit, etc).
 */
export class IFCManager {
    state: IfcState = {
        models: [],
        api: new WebIFC.IfcAPI(),
        useJSON: false,
        worker: { active: false, path: '' }
    };

    BVH = new BvhManager();
    typesMap: { [key: number]: string } = IfcTypesMap;
    parser: ParserAPI = new IFCParser(this.state, this.BVH);
    subsets = new SubsetManager(this.state, this.BVH);
    utils = new IFCUtils(this.state)
    sequenceData = new Data(this.state)
    private properties: PropertyManagerAPI = new PropertyManager(this.state);
    private types = new TypeManager(this.state);
    private cleaner = new MemoryCleaner(this.state);
    private worker?: IFCWorkerHandler;

    /**
     * Returns the underlying web-ifc API.
     */
    get ifcAPI() {
        return this.state.api;
    }

    // SETUP - all the logic regarding the configuration of web-ifc-three

    async parse(buffer: ArrayBuffer) {
        const model = await this.parser.parse(buffer, this.state.coordinationMatrix?.toArray()) as IFCModel;
        model.setIFCManager(this);
        // this.state.useJSON ? await this.disposeMemory() : await this.types.getAllTypes(this.worker);
        await this.types.getAllTypes(this.worker);
        return model;
    }

    async exportMeshAsIFCProduct(exporter: ExportHelper, mesh: any[], ifcElement: any, ifcId: any, objectPlacement: Vector3): Promise<any> {

        let brepShapeList: any = [];
        for (let k = 0; k < mesh.length; k++) {
            let geom = mesh[k].geometry;
            //@ts-ignore
            let index = geom.getIndex().array;
            //@ts-ignore
            let position = geom.attributes.position.array;

            let posStride = geom.attributes.position.itemSize;

            let faces = [];
            for (let i = 0; i < index.length; i += 3) {
                let ia = index[i + 0];
                let ib = index[i + 1];
                let ic = index[i + 2];

                let pta: pt = { x: position[ia * posStride + 0], y: position[ia * posStride + 1], z: position[ia * posStride + 2] }
                let ptb: pt = { x: position[ib * posStride + 0], y: position[ib * posStride + 1], z: position[ib * posStride + 2] }
                let ptc: pt = { x: position[ic * posStride + 0], y: position[ic * posStride + 1], z: position[ic * posStride + 2] }
                //@ts-ignore
                faces.push(await exporter.Face([pta, ptb, ptc]));
            }

            let brep = await exporter.FacetedBREP(faces);
            let brepShape = await exporter.ShapeBREP([brep]);

            //Crear assignació de material per a la geometria
            if (mesh[k].material) {
                //@ts-ignore
                let col = mesh[k].material.color as THREE.Color;
                //@ts-ignore
                let opacity = mesh[k].material.opacity as number;

                if (col) {
                    let style = await exporter.ShapePresentationStyleAssignment("material", col.r, col.g, col.b, 1 - opacity);
                    await exporter.StyledItem(brep, style);
                }
            }

            brepShapeList.push(brepShape);
        }

        let productDef = await exporter.ProductDefinitionShape(brepShapeList);
        let placement = await exporter.Placement({ x: objectPlacement.x, y: objectPlacement.y, z: objectPlacement.z });
        let element = await exporter.Product(ifcElement, ifcId, productDef, placement);

        return element;
    }

    async createModelForExport(projectPlacement: Vector3, north: Vector3, objects: ExportObject[]) {
        if (this.state.api.wasmModule === undefined) await this.state.api.Init();
        console.log("Exporting model...");

        let model = await this.state.api.CreateModel();
        let exporter = new ExportHelper(model, this.state.api);
        let context = await exporter.RepresentationContext(projectPlacement, north)
        let subContext1 = await exporter.RepresentationSubContext(context, "Axis", "Model", "GRAPH_VIEW")
        let subContext2 = await exporter.RepresentationSubContext(context, "Body", "Model", "MODEL_VIEW")
        let subContext3 = await exporter.RepresentationSubContext(context, "Box", "Model", "MODEL_VIEW")
        let subContext4 = await exporter.RepresentationSubContext(context, "Footprint", "Model", "MODEL_VIEW")
        let project = await exporter.Project(context, "web-ifc-three", "this project was exported from web-ifc-three");


        const elementsList: any = [];
        for (let i = 0; i < objects.length; i++) {
            var meshList: any = [];
            for (let j = 0; j < objects[i].geometries.length; j++) {
                var mesh = new Mesh(objects[i].geometries[j], objects[i].geometryMaterials[j]);
                meshList.push(mesh);
            }
            const ifcElement = await this.exportMeshAsIFCProduct(exporter, meshList, objects[i].ifcElementType, objects[i].ifcElementId, objects[i].placement);
            elementsList.push(ifcElement);
        }

        let placement = await exporter.Placement({ x: projectPlacement.x, y: projectPlacement.y, z: projectPlacement.z });
        let buildingStorey = await exporter.BuildingStorey(IFCBUILDINGSTOREY, placement);
        let building = await exporter.Building(IFCBUILDING, placement);
        let site = await exporter.Site(IFCSITE, placement);
        const StoreyList: any = [];
        const BuildingList: any = [];
        const SiteList: any = [];
        StoreyList.push(buildingStorey);
        BuildingList.push(building);
        SiteList.push(site);
        exporter.RelContainedInSpatialStructure(IFCRELCONTAINEDINSPATIALSTRUCTURE, buildingStorey, elementsList);
        exporter.RelAggregates(IFCRELAGGREGATES, building, StoreyList);
        exporter.RelAggregates(IFCRELAGGREGATES, site, BuildingList);
        exporter.RelAggregates(IFCRELAGGREGATES, project, SiteList);

        let ifcData = await this.state.api.ExportFileAsIFC(model);
        let ifcDataString = new TextDecoder().decode(ifcData);
        console.log(ifcDataString);

        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(ifcDataString));
        element.setAttribute('download', "export.ifc");

        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
    }


    /**
     * Sets the relative path of web-ifc.wasm file in the project.
     * Beware: you **must** serve this file in your page; this means
     * that you have to copy this files from *node_modules/web-ifc*
     * to your deployment directory.
     *
     * If you don't use this methods,
     * IFC.js assumes that you are serving it in the root directory.
     *
     * Example if web-ifc.wasm is in dist/wasmDir:
     * `ifcLoader.setWasmPath("dist/wasmDir/");`
     *
     * @path Relative path to web-ifc.wasm.
     */
    async setWasmPath(path: string) {
        this.state.api.SetWasmPath(path);
        this.state.wasmPath = path;
    }

    /**
     * Makes object picking a lot faster
     * Courtesy of gkjohnson's [work](https://github.com/gkjohnson/three-mesh-bvh).
     * Import these objects from his library and pass them as arguments. IFC.js takes care of the rest!
     */
    setupThreeMeshBVH(computeBoundsTree: any, disposeBoundsTree: any, acceleratedRaycast: any) {
        this.BVH.initializeMeshBVH(computeBoundsTree, disposeBoundsTree, acceleratedRaycast);
    }

    /**
     * Sets a callback function that is called every 10% of IFC loaded.
     * @onProgress callback function
     */
    setOnProgress(onProgress: (event: ParserProgress) => void) {
        this.state.onProgress = onProgress;
    }


    /**
     * Sets a coordination matrix to be applied when loading geometry.
     * @matrix THREE.Matrix4
     */
    setupCoordinationMatrix(matrix: THREE.Matrix4) {
        this.state.coordinationMatrix = matrix;
    }

    /**
     * Clears the coordination matrix that is applied when loading geometry.
     */
    clearCoordinationMatrix() {
        delete this.state.coordinationMatrix;
    }

    /**
     * Applies a configuration for [web-ifc](https://ifcjs.github.io/info/docs/Guide/web-ifc/Introduction).
     */
    async applyWebIfcConfig(settings: LoaderSettings) {
        this.state.webIfcSettings = settings;
        if (this.state.worker.active && this.worker) {
            await this.worker.workerState.updateStateWebIfcSettings();
        }
    }

    /**
     * Uses web workers, making the loader non-blocking.
     * @active Wether to use web workers or not.
     * @path Relative path to the web worker file. Necessary if active=true.
     */
    async useWebWorkers(active: boolean, path?: string) {
        if (this.state.worker.active === active) return;
        // @ts-ignore
        this.state.api = null;
        if (active) {
            if (!path) throw new Error('You must provide a path to the web worker.');
            this.state.worker.active = active;
            this.state.worker.path = path;
            await this.initializeWorkers();
            const wasm = this.state.wasmPath;
            if (wasm) await this.setWasmPath(wasm);
        } else {
            this.state.api = new WebIFC.IfcAPI();
        }
    }

    /**
     * @deprecated This approach had sense when the compute-heavy operations were blocking. If you are facing performance issues, you can either use webworkers or use the approach used in web-ifc-viewer to work with JSON and glTF. If you have any question regarding this, check out the docs or ask us direclty.
     * Enables the JSON mode (which consumes way less memory) and eliminates the WASM data.
     * Only use this in the following scenarios:
     * - If you don't need to access the properties of the IFC
     * - If you will provide the properties as JSON.
     * @useJSON: Wether to use the JSON mode or not.
     */
    async useJSONData(useJSON = true) {
        this.state.useJSON = useJSON;
        if (useJSON) {
            await this.worker?.workerState.updateStateUseJson();
        }
    }

    /**
     * @deprecated This approach had sense when the compute-heavy operations were blocking. If you are facing performance issues, you can either use webworkers or use the approach used in web-ifc-viewer to work with JSON and glTF. If you have any question regarding this, check out the docs or ask us direclty.
     * Adds the properties of a model as JSON data. If you are using web workers, use
     * `loadJsonDataFromWorker()` instead to avoid overheads.
     * @modelID ID of the IFC model.
     * @data: data as an object where the keys are the expressIDs and the values the properties.
     */
    async addModelJSONData(modelID: number, data: { [id: number]: JSONObject }) {
        const model = this.state.models[modelID];
        if (!model) throw new Error('The specified model for the JSON data does not exist');
        if (this.state.worker.active) {
            await this.worker?.workerState.updateModelStateJsonData(modelID, data);
        } else {
            model.jsonData = data;
        }
    }

    /**
     * @deprecated This approach had sense when the compute-heavy operations were blocking. If you are facing performance issues, you can either use webworkers or use the approach used in web-ifc-viewer to work with JSON and glTF. If you have any question regarding this, check out the docs or ask us direclty.
     * Loads the data of an IFC model from a JSON file directly from a web worker. If you are not using
     * web workers, use `addModelJSONData()` instead.
     * @modelID ID of the IFC model.
     * @path: the path to the JSON file **relative to the web worker file**.
     */
    async loadJsonDataFromWorker(modelID: number, path: string) {
        if (this.state.worker.active) {
            await this.worker?.workerState.loadJsonDataFromWorker(modelID, path);
        }
    }

    /**
     * Closes the specified model and deletes it from the [scene](https://threejs.org/docs/#api/en/scenes/Scene).
     * @modelID ID of the IFC model.
     * @scene Scene where the model is (if it's located in a scene).
     */
    close(modelID: number, scene?: Scene) {
        this.state.api.CloseModel(modelID);
        if (scene) scene.remove(this.state.models[modelID].mesh);
        delete this.state.models[modelID];
    }

    /**
     * Gets the **Express ID** to which the given face belongs.
     * This ID uniquely identifies this entity within this IFC file.
     * @geometry The geometry IFC model.
     * @faceIndex The index of the face of a geometry.You can easily get this index using the [Raycaster](https://threejs.org/docs/#api/en/core/Raycaster).
     */
    getExpressId(geometry: BufferGeometry, faceIndex: number) {
        return this.properties.getExpressId(geometry, faceIndex);
    }

    /**
     * Returns all items of the specified type. You can import
     * the types from *web-ifc*.
     *
     * Example to get all the standard walls of a project:
     * ```js
     * import { IFCWALLSTANDARDCASE } from 'web-ifc';
     * const walls = ifcLoader.getAllItemsOfType(IFCWALLSTANDARDCASE);
     * ```
     * @modelID ID of the IFC model.
     * @type type of IFC items to get.
     * @verbose If false (default), this only gets IDs. If true, this also gets the native properties of all the fetched items.
     */
    getAllItemsOfType(modelID: number, type: number, verbose: boolean) {
        return this.properties.getAllItemsOfType(modelID, type, verbose);
    }

    /**
     * Gets the native properties of the given element.
     * @modelID ID of the IFC model.
     * @id Express ID of the element.
     * @recursive Wether you want to get the information of the referenced elements recursively.
     */
    getItemProperties(modelID: number, id: number, recursive = false) {
        return this.properties.getItemProperties(modelID, id, recursive);
    }

    /**
     * Gets the [property sets](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifckernel/lexical/ifcpropertyset.htm)
     * assigned to the given element.
     * @modelID ID of the IFC model.
     * @id Express ID of the element.
     * @recursive If true, this gets the native properties of the referenced elements recursively.
     */
    getPropertySets(modelID: number, id: number, recursive = false) {
        return this.properties.getPropertySets(modelID, id, recursive);
    }

    /**
     * Gets the properties of the type assigned to the element.
     * For example, if applied to a wall (IfcWall), this would get back the information
     * contained in the IfcWallType assigned to it, if any.
     * @modelID ID of the IFC model.
     * @id Express ID of the element.
     * @recursive If true, this gets the native properties of the referenced elements recursively.
     */
    getTypeProperties(modelID: number, id: number, recursive = false) {
        return this.properties.getTypeProperties(modelID, id, recursive);
    }

    /**
     * Gets the materials assigned to the given element.
     * @modelID ID of the IFC model.
     * @id Express ID of the element.
     * @recursive If true, this gets the native properties of the referenced elements recursively.
     */
    getMaterialsProperties(modelID: number, id: number, recursive = false) {
        return this.properties.getMaterialsProperties(modelID, id, recursive);
    }

    /**
     * Gets the ifc type of the specified item.
     * @modelID ID of the IFC model.
     * @id Express ID of the element.
     */
    getIfcType(modelID: number, id: number) {
        const typeID = this.state.models[modelID].types[id];
        return IfcElements[typeID];
    }

    /**
     * Gets the spatial structure of the project. The
     * [spatial structure](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcproductextension/lexical/ifcspatialstructureelement.htm)
     * is the hierarchical structure that organizes every IFC project (all physical items
     * are referenced to an element of the spatial structure). It is formed by
     * one IfcProject that contains one or more IfcSites, that contain one or more
     * IfcBuildings, that contain one or more IfcBuildingStoreys, that contain
     * one or more IfcSpaces.
     * @modelID ID of the IFC model.
     */
    getSpatialStructure(modelID: number, includeProperties?: boolean) {
        return this.properties.getSpatialStructure(modelID, includeProperties);
    }

    /**
     * Gets the mesh of the subset with the specified [material](https://threejs.org/docs/#api/en/materials/Material).
     * If no material is given, this returns the subset with the original materials.
     * @modelID ID of the IFC model.
     * @material Material assigned to the subset (if any).
     * @customId Optional identifier of the subset.
     */
    getSubset(modelID: number, material?: Material, customId?: string) {
        return this.subsets.getSubset(modelID, material, customId);
    }

    /**
     * Removes the specified subset.
     * @modelID ID of the IFC model.
     * @parent The parent where the subset is (can be any `THREE.Object3D`).
     * @material Material assigned to the subset, if any.
     */
    removeSubset(modelID: number, material?: Material, customID?: string) {
        this.subsets.removeSubset(modelID, material, customID);
    }

    /**
     * Creates a new geometric subset.
     * @config A configuration object with the following options:
     * - **scene**: `THREE.Object3D` where the model is located.
     * - **modelID**: ID of the model.
     * - **ids**: Express IDs of the items of the model that will conform the subset.
     * - **removePrevious**: wether to remove the previous subset of this model with this material.
     * - **material**: (optional) wether to apply a material to the subset.
     * - **customID**: (optional) custom identifier to distinguish subsets of the same model with the same material.
     */
    createSubset(config: SubsetConfig) {
        return this.subsets.createSubset(config);
    }

    /**
     * Removes the specified items from the geometry of a subset.
     * @modelID ID of the IFC model.
     * @ids Express IDs of the items of the model that will conform the subset.
     * @material (optional) Material assigned to the subset, if any.
     * @customID (optional) custom identifier to distinguish subsets of the same model with the same material.
     */
    removeFromSubset(modelID: number, ids: number[], customID?: string, material?: Material) {
        return this.subsets.removeFromSubset(modelID, ids, customID, material);
    }

    /**
     * Removes all the geometry of a subset.
     * @modelID ID of the IFC model.
     * @ids Express IDs of the items of the model that will conform the subset.
     * @material (optional) Material assigned to the subset, if any.
     * @customID (optional) custom identifier to distinguish subsets of the same model with the same material.
     */
    clearSubset(modelID: number, customID?: string, material?: Material) {
        return this.subsets.clearSubset(modelID, customID, material);
    }




    // UTILITIES - Miscelaneus logic for various purposes

    /**
    * Returns the IFC class name of an instance if the optional parameter is not provided.
    * If an entit class is provided, it will check if an instance belongs to the class.
    * @modelID ID of the IFC model.
    * @entityClass IFC Class name.
    */
    async isA(entity: any, entity_class: string) {
        return this.utils.isA(entity, entity_class);
    }

    async getSequenceData(modelID: number) {
        await this.sequenceData.load(modelID);
        return this.sequenceData;
    }


    /**
    * Returns the IFC objects filtered by IFC Type and wrapped with the entity_instance class.
    * If an IFC type class has subclasses, all entities of those subclasses are also returned.
    * @modelID ID of the IFC model.
    * @entityClass IFC Class name.
    */
    async byType(modelID: number, entityClass: string) {
        return this.utils.byType(modelID, entityClass);
    }

    /**
    * Returns the IFC objects filtered by IFC ID.
    * @modelID ID of the IFC model.
    * @id Express ID of the element.
    */
    async byId(modelID: number, id: number) {
        return this.utils.byId(modelID, id);
    }

    /**
    * Returns the IFC objects filtered by IFC Type and wrapped with the entity_instance class.
    * If an IFC type class has subclasses, all entities of those subclasses are also returned.
    * @modelID ID of the IFC model.
    * @entityClass IFC Class name.
    */
    async idsByType(modelID: number, entityClass: string) {
        return this.utils.idsByType(modelID, entityClass);
    }


    // MISC - Miscelaneus logic for various purposes

    /**
     * Disposes all memory used by the IFCLoader, including WASM memory and the web worker.
     * Use this if you want to destroy the object completely.
     * If you want to load an IFC later, you'll need to create a new instance.
     */
    async dispose() {
        IFCModel.dispose();
        await this.cleaner.dispose();
        this.subsets.dispose();
        if (this.worker && this.state.worker.active) await this.worker.terminate();
        (this.state as any) = null;
    }

    /**
     * @deprecated This approach had sense when the compute-heavy operations were blocking. If you are facing performance issues, you can either use webworkers or use the approach used in web-ifc-viewer to work with JSON and glTF. If you have any question regarding this, check out the docs or ask us direclty.
     * Completely releases the WASM memory, thus drastically decreasing the memory use of the app.
     * Only use this in the following scenarios:
     * - If you don't need to access the properties of the IFC
     * - If you will provide the properties as JSON.
     */
    async disposeMemory() {
        if (this.state.worker.active) {
            await this.worker?.Close();
        } else {
            // @ts-ignore
            this.state.api.Close();
            (this.state.api as any) = null;
            this.state.api = new WebIFC.IfcAPI();
        }
    }

    /**
     * For internal use of IFC.js dev team and testers
     */
    getAndClearErrors(modelID: number) {
        return this.parser.getAndClearErrors(modelID);
    }

    private async initializeWorkers() {
        this.worker = new IFCWorkerHandler(this.state, this.BVH);
        this.state.api = this.worker.webIfc;
        this.properties = this.worker.properties;
        await this.worker.parser.setupOptionalCategories(this.parser.optionalCategories);
        this.parser = this.worker.parser;
        await this.worker.workerState.updateStateUseJson();
        await this.worker.workerState.updateStateWebIfcSettings();
    }


}
