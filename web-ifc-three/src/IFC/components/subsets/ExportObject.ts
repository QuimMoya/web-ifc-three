import { BoxGeometry, BufferGeometry, Material, Mesh, MeshBasicMaterial, Object3D, CylinderGeometry, RingGeometry, Scene, Vector3 } from 'three';
import * as WebIFC from 'web-ifc';

export interface ExportObject {
    geometry: any,
    material: Material,
    ifcElementType: any,
    ifcElementId: number,
    placement: Vector3
}