import * as wifc from "web-ifc";
import { WebIfcAPI } from "../BaseDefinitions";

export let EID = 1;

function real(v: number): any {
    return { type: 4, value: v }
}

function ref(v: number): any {
    return { type: 5, value: v }
}

function empty(): any {
    return { type: 6 }
}

function str(v: string): any {
    return { type: 1, value: v }
}

function enm(v: string): any {
    return { type: 3, value: v }
}

export interface pt {
    x: number, y: number, z: number;
}

export interface pt2D {
    x: number, y: number;
}

export class ExportHelper {

    model: number;
    api: WebIfcAPI;

    async Write(lineObject: any) {
        let rawLineData = {
            ID: lineObject.expressID,
            type: lineObject.type,
            arguments: lineObject.ToTape()
        };

        await this.api.WriteRawLineData(this.model, rawLineData);
    }

    constructor(m: number, api: WebIfcAPI) {
        this.model = m;
        this.api = api;
    }

    async Point(o: pt): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcCartesianPoint(ID,
            wifc.IFCCARTESIANPOINT,
            [real(o.x), real(o.y), real(o.z)]);
        await this.Write(pt);
        return ref(ID);
    }

    async PolyLoop(os: pt[]): Promise<any> {
        let refs = await Promise.all(os.map((o: pt) => this.Point(o)));
        let ID = EID++;
        let loop = new wifc.IfcPolyLoop(ID,
            wifc.IFCPOLYLOOP,
            refs);
        await this.Write(loop);
        return ref(ID);
    }

    async FaceOuterBound(os: pt[]): Promise<any> {
        let ID = EID++;
        let bound = new wifc.IfcFaceOuterBound(ID,
            wifc.IFCFACEOUTERBOUND,
            await this.PolyLoop(os),
            enm("T")
        );
        this.Write(bound);
        return ref(ID);
    }

    async Face(os: pt[]): Promise<any> {
        let ID = EID++;
        let face = new wifc.IfcFace(ID,
            wifc.IFCFACE,
            [await this.FaceOuterBound(os)]
        );
        this.Write(face);
        return ref(ID);
    }

    async ClosedShell(faceRefs: any[]): Promise<any> {
        let ID = EID++;
        let shell = new wifc.IfcClosedShell(ID,
            wifc.IFCCLOSEDSHELL,
            faceRefs
        );
        this.Write(shell);
        return ref(ID);
    }

    async FacetedBREP(faceRefs: any[]): Promise<any> {
        let ID = EID++;
        let brep = new wifc.IfcFacetedBrep(ID,
            wifc.IFCFACETEDBREP,
            await this.ClosedShell(faceRefs)
        );
        this.Write(brep);
        return ref(ID);
    }

    async ColourRGB(r: number, g: number, b: number): Promise<any> {
        let ID = EID++;
        let col = new wifc.IfcColourRgb(ID,
            wifc.IFCCOLOURRGB,
            empty(),
            real(r),
            real(g),
            real(b)
        );
        this.Write(col);
        return ref(ID);
    }

    async SurfaceStyleShading(r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let col = new wifc.IfcSurfaceStyleShading(ID,
            wifc.IFCSURFACESTYLESHADING,
            await this.ColourRGB(r, g, b),
            real(a)
        );
        this.Write(col);
        return ref(ID);
    }

    async SurfaceStyleRendering(r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let col = new wifc.IfcSurfaceStyleRendering(ID,
            wifc.IFCSURFACESTYLERENDERING,
            await this.ColourRGB(r, g, b),
            real(a),
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            enm("NOTDEFINED")
        );
        this.Write(col);
        return ref(ID);
    }

    async SurfaceStyle(name: string, r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let col = new wifc.IfcSurfaceStyle(ID,
            wifc.IFCSURFACESTYLE,
            str(name),
            enm(wifc.IfcSurfaceSide.BOTH),
            [await this.SurfaceStyleShading(r, g, b, a)]
        );
        this.Write(col);
        return ref(ID);
    }

    async PresentationStyleAssignment(name: string, r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let style = new wifc.IfcPresentationStyleAssignment(ID,
            wifc.IFCPRESENTATIONSTYLEASSIGNMENT,
            [await this.SurfaceStyle(name, r, g, b, a)]
        );
        this.Write(style);
        return ref(ID);
    }

    async ShapePresentationStyleAssignment(name: string, r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let style = new wifc.IfcPresentationStyleAssignment(ID,
            wifc.IFCPRESENTATIONSTYLEASSIGNMENT,
            [await this.ShapeStyleAssignment(name, r, g, b, a)]
        );
        this.Write(style);
        return ref(ID);
    }

    async ShapeStyleAssignment(name: string, r: number, g: number, b: number, a: number): Promise<any> {
        let ID = EID++;
        let style = new wifc.IfcSurfaceStyle(ID,
            wifc.IFCSURFACESTYLE,
            str(name),
            enm("BOTH"),
            [await this.SurfaceStyleRendering(r, g, b, a)]
        );
        this.Write(style);
        return ref(ID);
    }

    async StyledItem(item: any, style: any): Promise<any> {
        let ID = EID++;
        let s = new wifc.IfcStyledItem(ID,
            wifc.IFCSTYLEDITEM,
            item,
            [style],
            empty()
        );
        this.Write(s);
        return ref(ID);
    }

    async StyledItemContext(style: any): Promise<any> {
        let ID = EID++;
        let s = new wifc.IfcStyledItem(ID,
            wifc.IFCSTYLEDITEM,
            empty(),
            [style],
            empty()
        );
        this.Write(s);
        return ref(ID);
    }

    async StyledRepresentationContext(context: any, name: string, description: string ,style: any): Promise<any> {
        let ID = EID++;
        let s = new wifc.IfcStyledRepresentation(ID,
            wifc.IFCSTYLEDREPRESENTATION,
            context,
            str(name),
            str(description),
            style
        );
        this.Write(s);
        return ref(ID);
    }

    async ShapeBREP(brepRefs: any[]): Promise<any> {
        let ID = EID++;
        let shape = new wifc.IfcShapeRepresentation(ID,
            wifc.IFCSHAPEREPRESENTATION,
            empty(),
            str("Body"),
            str("Brep"),
            brepRefs
        );
        this.Write(shape);
        return ref(ID);
    }

    async ProductDefinitionShape(shapeRefs: any[]): Promise<any> {
        let ID = EID++;
        let def = new wifc.IfcProductDefinitionShape(ID,
            wifc.IFCPRODUCTDEFINITIONSHAPE,
            empty(),
            empty(),
            shapeRefs
        );
        this.Write(def);
        return ref(ID);
    }

    async Product(constructor: any, typeID: number, productShape: any, placement: any): Promise<any> {
        let ID = EID++;
        let pt = new constructor(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            empty(),
            str("label"),
            placement,
            productShape,
            str(""),
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async Building(typeID: number, placement: any): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcBuilding(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            str("description"),
            str("label"),
            placement,
            empty(),
            str(""),
            enm(wifc.IfcElementCompositionEnum.ELEMENT),
            empty(),
            empty(),
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async BuildingStorey(typeID: number, placement: any): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcBuildingStorey(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            str("description"),
            str("label"),
            placement,
            empty(),
            str(""),
            enm(wifc.IfcElementCompositionEnum.ELEMENT),
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async Site(typeID: number, placement: any): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcSite(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            str("description"),
            str("label"),
            placement,
            empty(),
            str(""),
            enm(wifc.IfcElementCompositionEnum.ELEMENT),
            empty(),
            empty(),
            empty(),
            empty(),
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async RelContainedInSpatialStructure(typeID: number, buildingStorey: any, elementsList: any[]): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcRelContainedInSpatialStructure(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            str("description"),
            elementsList,
            buildingStorey);
        this.Write(pt);
        return ref(ID);
    }

    async RelAggregates(typeID: number, element: any, elementsList: any[]): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcRelAggregates(ID,
            typeID,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str("name"),
            str("description"),
            element,
            elementsList);
        this.Write(pt);
        return ref(ID);
    }

    async Dir(o: pt): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcDirection(ID,
            wifc.IFCDIRECTION,
            [real(o.x), real(o.y), real(o.z)]);
        this.Write(pt);
        return ref(ID);
    }

    async Point2D(o: pt2D): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcCartesianPoint(ID,
            wifc.IFCCARTESIANPOINT,
            [real(o.x), real(o.y)]);
        this.Write(pt);
        return ref(ID);
    }

    async AxisPlacement(o: pt): Promise<any> {
        let locationID = await this.Point(o);
        let ID = EID++;
        let pt = new wifc.IfcAxis2Placement3D(ID,
            wifc.IFCAXIS2PLACEMENT3D,
            locationID,
            empty(),
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async AxisPlacement2D(o: pt2D): Promise<any> {
        let locationID = await this.Point2D(o);
        let ID = EID++;
        let pt = new wifc.IfcAxis2Placement2D(ID,
            wifc.IFCAXIS2PLACEMENT2D,
            locationID,
            empty());
        this.Write(pt);
        return ref(ID);
    }

    async Placement(o: pt): Promise<any> {
        let axisID = await this.AxisPlacement(o);
        let ID = EID++;
        let pt = new wifc.IfcLocalPlacement(ID,
            wifc.IFCLOCALPLACEMENT,
            empty(),
            axisID);
        this.Write(pt);
        return ref(ID);
    }

    async CircleProfile(rad: number, o: pt2D): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcCircleProfileDef(ID,
            wifc.IFCCIRCLEPROFILEDEF,
            enm(wifc.IfcProfileTypeEnum.AREA),
            str('column-prefab'),
            await this.AxisPlacement2D(o),
            real(rad));
        this.Write(pt);
        return ref(ID);
    }

    async Project(context: any, name: string, description: string): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcProject(ID,
            wifc.IFCPROJECT,
            str(Math.random().toString(16).substr(2, 8)),
            empty(),
            str(name),
            str(description),
            empty(),
            empty(),
            empty(),
            [context],
            await this.UnitAssignment()
        );
        this.Write(pt);
        return ref(ID);
    }

    async RepresentationContext(pos: any, north: any)
    {
        let ID = EID++;
        let pt = new wifc.IfcGeometricRepresentationContext(ID,
            wifc.IFCGEOMETRICREPRESENTATIONCONTEXT,
            str("Model"),
            empty(),
            real(3),
            real(1e-5),
            await this.AxisPlacement(pos),
            await this.Dir(north)
        );
        this.Write(pt);
        return ref(ID);
    }

    async RepresentationSubContext(context: any, identifier: string, description: string, enumerated: string)
    {
        let ID = EID++;
        let pt = new wifc.IfcGeometricRepresentationSubContext(ID,
            wifc.IFCGEOMETRICREPRESENTATIONSUBCONTEXT,
            str(identifier),
            str(description),
            str("*"),
            str("*"),
            str("*"),
            str("*"),
            context,
            empty(),
            enm(enumerated),
            empty(),
        );
        this.Write(pt);
        return ref(ID);
    }

    async UnitAssignment() {
        let ID = EID++;
        let lst: any = []
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.LENGTHUNIT), enm(wifc.IfcSIUnitName.METRE)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.AREAUNIT), enm(wifc.IfcSIUnitName.SQUARE_METRE)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.VOLUMEUNIT), enm(wifc.IfcSIUnitName.CUBIC_METRE)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.MASSUNIT), enm(wifc.IfcSIUnitName.GRAM)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.SOLIDANGLEUNIT), enm(wifc.IfcSIUnitName.STERADIAN)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.TIMEUNIT), enm(wifc.IfcSIUnitName.SECOND)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.THERMODYNAMICTEMPERATUREUNIT), enm(wifc.IfcSIUnitName.DEGREE_CELSIUS)))
        lst.push(await this.SiUnit(enm(wifc.IfcUnitEnum.LUMINOUSINTENSITYUNIT), enm(wifc.IfcSIUnitName.LUMEN)))
        let pt = new wifc.IfcUnitAssignment(ID,
            wifc.IFCUNITASSIGNMENT,
            lst
        );
        this.Write(pt);
        return ref(ID);
    }

    async SiUnit(unit: any, name: any) {
        let ID = EID++;
        let pt = new wifc.IfcSIUnit(ID,
            wifc.IFCSIUNIT,
            empty(),
            unit,
            empty(),
            name);
        this.Write(pt);
        return ref(ID);
    }

    async ExtrudedAreaSolid(pos: pt, dir: pt, rad: number, len: number): Promise<any> {
        let ID = EID++;
        let pt = new wifc.IfcExtrudedAreaSolid(ID,
            wifc.IFCEXTRUDEDAREASOLID,
            await this.CircleProfile(rad, { x: 0, y: 0 }),
            await this.AxisPlacement(pos),
            await this.Dir(dir),
            real(len));
        this.Write(pt);
        return ref(ID);
    }
}