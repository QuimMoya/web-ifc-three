import { Matrix4, LineBasicMaterial, Vector3, BufferGeometry, Line } from 'three';
import { IFCLoader } from 'web-ifc-three/dist/IFCLoader';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { IFCWALLSTANDARDCASE, IFCSLAB, IFCWINDOW, IFCSPACE, IFCOPENINGELEMENT } from 'web-ifc';

export class IfcManager {
    constructor(scene, ifcModels) {
        this.scene = scene;
        this.ifcModels = ifcModels;
        this.ifcLoader = new IFCLoader();
        this.setupIfcLoader();
        this.setupFileOpener();
    }

    remove = false;

    async editSubset(type) {
        const ids = await this.ifcLoader.ifcManager.getAllItemsOfType(0, type, false);
        if (this.remove) this.ifcLoader.ifcManager.removeFromSubset(0, ids);
        else this.ifcLoader.ifcManager.createSubset({ modelID: 0, ids, applyBVH: false, removePrevious: false })
    }

    setupThreeMeshBVH() {
        this.ifcLoader.ifcManager.setupThreeMeshBVH(
            computeBoundsTree,
            disposeBoundsTree,
            acceleratedRaycast
        );
    }

    async setupIfcLoader() {

        await this.ifcLoader.ifcManager.parser.setupOptionalCategories({
            [IFCSPACE]: false,
            [IFCOPENINGELEMENT]: false
        });

        // await this.ifcLoader.ifcManager.useWebWorkers(true, 'IFCWorker.js');
        this.setupThreeMeshBVH();
    }

    setupFileOpener() {
        const input = document.querySelector('input[type="file"]');
        if (!input) return;
        input.addEventListener(
            'change',
            async (changed) => {
                await this.loadIFC(changed);
            },
            false
        );
    }

    async dispose() {
        this.ifcModels.length = 0;
        await this.ifcLoader.ifcManager.dispose();
        this.ifcLoader = null;
        this.ifcLoader = new IFCLoader();
        await this.setupIfcLoader();
    }

    subset = {};

    async loadIFC(changed) {

        const start = window.performance.now()

        const ifcURL = URL.createObjectURL(changed.target.files[0]);
        this.ifcLoader.ifcManager.setOnProgress((event) => console.log(event));

        const firstModel = Boolean(this.ifcModels.length === 0);

        await this.ifcLoader.ifcManager.applyWebIfcConfig({
            COORDINATE_TO_ORIGIN: firstModel,
            USE_FAST_BOOLS: false
        });

        const ifcModel = await this.ifcLoader.loadAsync(ifcURL);
        // console.log(ifcModel);

        if (firstModel) {
            const matrixArr = await this.ifcLoader.ifcManager.ifcAPI.GetCoordinationMatrix(ifcModel.modelID);
            const matrix = new Matrix4().fromArray(matrixArr);
            this.ifcLoader.ifcManager.setupCoordinationMatrix(matrix);
        }

        this.ifcModels.push(ifcModel);
        this.scene.add(ifcModel);

        ////////////////////
        const align = this.ifcLoader.ifcManager.state.alignments;

        //create a blue LineBasicMaterial
        let material = new LineBasicMaterial({ color: 0x0000ff });
        if (align.length > 0) {
            const alignments = align[0];
            for (let m = 0; m < alignments.length; m++) {
                const alignment = alignments[m];
                const origin = { x: 0, y: 0, z: 0 };
                const start = { x: 0, y: 0, z: 0 };

                origin.x = alignment.origin.x;
                origin.y = alignment.origin.z;
                origin.z = alignment.origin.y;

                let finish = false;
                for (let i = 0; i < alignment.horizontal.length; i++) {
                    for (let j = 0; j < alignment.horizontal[i].points.length; j++) {
                        start.x = alignment.horizontal[i].points[j].x - origin.x;
                        start.y = 0;
                        start.z = -(alignment.horizontal[i].points[j].y - origin.z);
                        finish = true;
                        break;
                    }
                    if (finish) { break; }
                }

                for (let i = 0; i < alignment.horizontal.length; i++) {
                    const points = [];
                    for (let j = 0; j < alignment.horizontal[i].points.length; j++) {
                        points.push(new Vector3(
                            alignment.horizontal[i].points[j].x - origin.x - start.x,
                            0,
                            -(alignment.horizontal[i].points[j].y - origin.z - start.z))
                        );
                    }
                    console.log("Horizontal ", points);
                    const geometry = new BufferGeometry().setFromPoints(points);
                    const line = new Line(geometry, material);
                    this.scene.add(line);
                }

                material = new LineBasicMaterial({ color: 0xff0000 });
                for (let i = 0; i < alignment.vertical.length; i++) {
                    const points = [];
                    for (let j = 0; j < alignment.vertical[i].points.length; j++) {
                        points.push(new Vector3(
                            alignment.vertical[i].points[j].x,
                            alignment.vertical[i].points[j].y - origin.y,
                            start.z)
                        );
                    }
                    console.log("Vertical ", points);
                    const geometry = new BufferGeometry().setFromPoints(points);
                    const line = new Line(geometry, material);
                    this.scene.add(line);
                }
            }
        }
        
        ////////////////////

        const stop = window.performance.now()

        console.log(`Time Taken to load = ${(stop - start) / 1000} seconds`);
    }
}