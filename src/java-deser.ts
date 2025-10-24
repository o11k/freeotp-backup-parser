const STREAM_MAGIC      = 0xaced;
const STREAM_VERSION    = 0x0005;

const TC_NULL           = 0x70;
const TC_REFERENCE      = 0x71;
const TC_CLASSDESC      = 0x72;
const TC_OBJECT         = 0x73;
const TC_STRING         = 0x74;
const TC_ARRAY          = 0x75;
const TC_CLASS          = 0x76;
const TC_BLOCKDATA      = 0x77;
const TC_ENDBLOCKDATA   = 0x78;
const TC_RESET          = 0x79;
const TC_BLOCKDATALONG  = 0x7A;
const TC_EXCEPTION      = 0x7B;
const TC_LONGSTRING     = 0x7C;
const TC_PROXYCLASSDESC = 0x7D;
const TC_ENUM           = 0x7E;

const baseWireHandle    = 0x7E0000;

const SC_WRITE_METHOD   = 0x01;  // if SC_SERIALIZABLE
const SC_BLOCK_DATA     = 0x08;  // if SC_EXTERNALIZABLE
const SC_SERIALIZABLE   = 0x02;
const SC_EXTERNALIZABLE = 0x04;
const SC_ENUM           = 0x10;

class ByteReader {
    static get SEEK_SET() {return 0;}
    static get SEEK_CUR() {return 1;}
    static get SEEK_END() {return 2;}

    private data: Uint8Array;
    private _offset: number;

    private get offset() {return this._offset;}
    private set offset(newOffset: number) {
        this._offset = Math.max(0, Math.min(this.data.byteLength, newOffset));
    }

    constructor (data: Uint8Array) {
        this.data = data;
        this._offset = 0;
    }

    tell(): number {
        return this.offset;
    }

    seek(offset: number, whence=ByteReader.SEEK_SET): void {
        switch (whence) {
            case ByteReader.SEEK_SET:
                this.offset = offset;
                break;
            case ByteReader.SEEK_CUR:
                this.offset += offset;
                break;
            case ByteReader.SEEK_END:
                this.offset = this.data.byteLength + offset;
                break;
            default:
                throw new Error(`Invalid whence parameter: ${whence}`);
        }
    }

    read(size=-1): Uint8Array {
        if (size === -1) {
            size = this.data.byteLength - this.offset;
        }
        const result = new Uint8Array(this.data.slice(this.offset, this.offset + size));
        this.offset += size;

        return result;
    }

    peek(size=1): Uint8Array {
        const offset = this.offset;
        const result = this.read(size);
        this.offset = offset;

        return result;
    }

    eof(): boolean {
        return this.offset === this.data.byteLength;
    }
}

type JContent = JObject | JBlockData;
type JContents = JContent[];
type JObject = JNewObject | JNewClass | JNewArray | JNewString | JNewEnum | JNewClassDesc /*| JPrevObject*/ | JNullReference /*| JException*/ | JReset;
type JNewObject = {
    type: "object",
    class: JClassDesc,
    data: JClassData[],
}
type JNewClass = {
    type: "class",
    desc: JClassDesc,
}
type JNewArray = {
    type: "array",
    itemType: JClassDesc,
    items: JValues[],
}
type JNewString = {
    type: "string",
    value: string,
}
type JNewEnum = {
    type: "enum",
    desc: JClassDesc,
    name: JObject,  // TODO String
}
type JNewClassDesc = JClassDescProxy | JClassDescNonProxy
type JClassDescNonProxy = {
    type: "classDesc",
    proxy: false,
    name: string,
    serialVersionUID: bigint,
    flags: number,
    fields: JFieldDesc[],
    annotation: JContents,
    super: JClassDesc,
}
type JClassDescProxy = {
    type: "classDesc",
    proxy: true,
    interfaceNames: string[],
    annotation: JContents,
    super: JClassDesc,
}
type JPrevObject = JObject;
type JNullReference = null;
type JException = JObject;  // TODO Throwable
type JReset = {type: "reset"}

type JBlockData = Uint8Array;

type JClassDesc = JNewClassDesc | JNullReference /*| JPrevObject*/

type JFieldDesc = {
    type: "byte" | "char" | "double" | "float" | "integer" | "long" | "short" | "boolean"
    name: string,
} | {
    type: "array" | "object",
    name: string,
    className: JObject,  // TODO String
}
type JClassData =
      {values: JValues}
    | {values: JValues, annotation: JContents}
    /*| externalContens not implemented */
    | {annotation: JContents};
type JValue = number | bigint | boolean | JObject
type JValues = {[key: string]: JValue}

class Deserializer {
    reader: ByteReader;

    handles: {[key: number]: JObject};
    currHandle: number;

    constructor (data: Uint8Array) {
        this.reader = new ByteReader(data);
        this.handles = {};
        this.currHandle = baseWireHandle;
    }

    reset() {
        this.currHandle = baseWireHandle;
        this.handles = {};
    }

    newHandle(obj: JObject): void {
        const handle = this.currHandle++;
        this.handles[handle] = obj;
    }

    _deserInteger(size: number): bigint {
        const data = this.reader.read(size);
        if (data.byteLength < size) {
            throw Error(`EOF when deserializing integer of size ${size}`);
        }
        
        let result = 0n;
        for (const byte of data) {
            result <<= 8n;
            result += BigInt(byte);
        }

        return result;
    }

    deserByte(): number {
        return Number(this._deserInteger(1))
    }
    deserShort(): number {
        return Number(this._deserInteger(2))
    }
    deserInt(): number {
        return Number(this._deserInteger(4))
    }
    deserLong(): bigint {
        return this._deserInteger(8)
    }

    deserDouble(): number {
        const data = this.reader.read(8);
        if (data.byteLength < 8) {
            throw Error(`EOF when deserializing double`);
        }
        return new DataView(data.buffer).getFloat64(0, false);
    }


    deserFloat(): number {
        const data = this.reader.read(4);
        if (data.byteLength < 4) {
            throw Error(`EOF when deserializing double`);
        }
        return new DataView(data.buffer).getFloat32(0, false);
    }

    peekByte(): number {
        const offset = this.reader.tell();
        const result = Number(this._deserInteger(1));
        this.reader.seek(offset);
        return result;

    }    
 
    expectByte(expected: number): void {
        const offset = this.reader.tell()
        const found = this.deserByte();
        if (expected != found) {
            throw new Error(`Expected byte ${expected} at offset ${offset}, found ${found}`);
        }
    }
    
    expectShort(expected: number): void {
        const offset = this.reader.tell()
        const found = this.deserShort();
        if (expected != found) {
            throw new Error(`Expected short ${expected} at offset ${offset}, found ${found}`);
        }
    }
    
    expectInt(expected: number): void {
        const offset = this.reader.tell()
        const found = this.deserInt();
        if (expected != found) {
            throw new Error(`Expected int ${expected} at offset ${offset}, found ${found}`);
        }
    }
    
    expectLong(expected: number | bigint): void {
        const offset = this.reader.tell()
        expected = BigInt(expected);
        const found = this.deserLong();
        if (expected != found) {
            throw new Error(`Expected long ${expected} at offset ${offset}, found ${found}`);
        }
    }

    deserUtf() {
        const size = this.deserShort();
        const bytes = this.reader.read(size);
        if (bytes.byteLength < size) {
            throw new Error("Unexpected EOF while reading UTF data");
        }
        return new TextDecoder().decode(bytes);
    }

    deserLongUtf() {
        const sizeBig = this.deserLong();
        if (sizeBig > Number.MAX_SAFE_INTEGER) {
            throw new Error(`Can't deserialize utf string longer than ${Number.MAX_SAFE_INTEGER} bytes`);
        }
        const size = Number(sizeBig);
        const bytes = this.reader.read(size);
        if (bytes.byteLength < size) {
            throw new Error("Unexpected EOF while reading long UTF data");
        }
        return new TextDecoder().decode(bytes);
    }

    deser(): JContents {
        this.expectShort(STREAM_MAGIC);
        this.expectShort(STREAM_VERSION);

        const contents = [];
        while (!this.reader.eof()) {
            const content = this.deserContent();
            contents.push(content);
        }
        return contents
    }

    deserContent(): JContent {
        const type = this.peekByte();

        switch (type) {
            case TC_BLOCKDATA:
            case TC_BLOCKDATALONG:
                return this.deserBlockData();
            default:
                return this.deserObject();
        }
    }

    deserBlockData(): JBlockData {
        const type = this.deserByte();
        let size: number;
        switch (type) {
            case TC_BLOCKDATA:
                size = this.deserByte();
                break;
            case TC_BLOCKDATALONG:
                size = this.deserInt();
                break;
            default:
                throw new Error(`Unexpected block data TC: ${type}`);
        }

        const data = this.reader.read(size);
        if (data.byteLength < size) {
            throw new Error("Unexpected EOF while reading block data");
        }
        return data;
    }

    deserObject(): JObject {
        const type = this.peekByte();

        switch (type) {
            case TC_OBJECT:
                return this.deserNewObject();
            case TC_CLASS:
                return this.deserNewClass();
            case TC_ARRAY:
                return this.deserNewArray();
            case TC_STRING:
            case TC_LONGSTRING:
                return this.deserNewString();
            case TC_ENUM:
                return this.deserNewEnum();
            case TC_CLASSDESC:
            case TC_PROXYCLASSDESC:
                return this.deserNewClassDesc();
            case TC_REFERENCE:
                return this.deserPrevObject();
            case TC_NULL:
                this.deserByte();
                return null;
            case TC_EXCEPTION:            
                return this.deserException();
            case TC_RESET:
                this.reset();  // I assume this is called here, though the standard doesn't say it
                return {type: "reset"};
            default:
                throw new Error(`Unexpected object TC: ${type}`);
        }
    }

    deserNewObject(): JNewObject {
        this.expectByte(TC_OBJECT);
        const clazz = this.deserClassDesc();
        const result: JObject = {
            type: "object",
            class: clazz,
            data: [],
        };
        this.newHandle(result);
        result.data = this.deserClassDatas(clazz);
        return result;
    }

    deserNewClass(): JNewClass {
        this.expectByte(TC_CLASS);
        const desc = this.deserClassDesc();
        const result: JObject = {
            type: "class",
            desc: desc,
        }
        this.newHandle(result);
        return result;
    }

    deserNewArray(): JNewArray {
        this.expectByte(TC_ARRAY);
        const desc = this.deserClassDesc();
        const result: JObject = {
            type: "array",
            itemType: desc,
            items: [],
        };
        this.newHandle(result);
        const size = this.deserInt();
        for (let i=0; i<size; i++) {
            result.items.push(this.deserValues(desc));
        }
        return result;
    }

    deserNewString(): JNewString {
        const type = this.deserByte();
        const result: JObject = {
            type: "string",
            value: "",
        }
        this.newHandle(result);

        switch (type) {
            case TC_STRING:
                result.value = this.deserUtf();
                break;
            case TC_LONGSTRING:
                result.value = this.deserLongUtf();
                break;
            default:
                throw new Error(`Unexpected string TC: ${type}`);
        }

        return result;
    }

    deserNewEnum(): JNewEnum {
        this.expectByte(TC_ENUM);
        const desc = this.deserClassDesc();
        const result: JObject = {
            type: "enum",
            desc: desc,
            name: null,
        };
        this.newHandle(result);
        const name = this.deserObject();  // TODO String
        result.name = name;
        return result;
    }

    deserNewClassDesc(): JNewClassDesc {

        const deserFields = (): JFieldDesc[] => {
            const PRETTY_TYPECODES = Object.freeze({
                B: "byte",
                C: "char",
                D: "double",
                F: "float",
                I: "integer",
                J: "long",
                S: "short",
                Z: "boolean",
                "[": "array",
                "L": "object",
            });
            const result = [];
            const numFields = this.deserShort();
            for (let i=0; i<numFields; i++) {
                let field: JFieldDesc;

                const typecode = String.fromCharCode(this.deserByte());
                const name = this.deserUtf();

                if (!PRETTY_TYPECODES.hasOwnProperty(typecode)) {
                    throw new Error(`Field typecode not recognized: ${typecode}`);
                }
                const prettyTypecode = PRETTY_TYPECODES[typecode as keyof typeof PRETTY_TYPECODES];

                if (prettyTypecode === "array" || prettyTypecode === "object") {
                    const className = this.deserObject();  // TODO String
                    field = {
                        type: prettyTypecode,
                        name: name,
                        className: className,
                    }
                } else {
                    field = {
                        type: prettyTypecode,
                        name: name,
                    }
                }

                result.push(field);
            }
            return result;
        }

        const deserInterfaceNames = (): string[] => {
            const result = [];
            const count = this.deserInt();
            for (let i=0; i<count; i++) {
                result.push(this.deserUtf());
            }
            return result;
        }

        const type = this.deserByte();

        switch (type) {
            case TC_CLASSDESC: {
                const name = this.deserUtf();
                const serialVersionUID = this.deserLong();
                const result: JObject = {
                    type: "classDesc",
                    proxy: false,
                    name: name,
                    serialVersionUID: serialVersionUID,
                    flags: 0,
                    fields: [],
                    annotation: [],
                    super: null,
                };
                this.newHandle(result);
                result.flags = this.deserByte();
                result.fields = deserFields();
                result.annotation = this.deserAnnotation();
                result.super = this.deserClassDesc();
                return result;
            }
            case TC_PROXYCLASSDESC: {
                const result: JObject = {
                    type: "classDesc",
                    proxy: true,
                    interfaceNames: [],
                    annotation: [],
                    super: null,
                }
                this.newHandle(result);
                result.interfaceNames = deserInterfaceNames();
                result.annotation = this.deserAnnotation();
                result.super = this.deserClassDesc();
                return result;
            }
            default:
                throw new Error(`Unexpected new class desc TC: ${type}`);
        }
    }

    deserPrevObject(): JPrevObject {
        this.expectByte(TC_REFERENCE);
        const handle = this.deserInt();

        return this.handles[handle];
    }

    deserException(): JException {
        this.expectByte(TC_EXCEPTION);
        this.reset();
        const result = this.deserObject();  // TODO Throwable
        this.reset();
        return result;
    }

    deserClassDesc(): JClassDesc {
        const type = this.peekByte();
        switch (type) {
            case TC_CLASSDESC:
            case TC_PROXYCLASSDESC:
                return this.deserNewClassDesc();
            case TC_NULL:
                this.deserByte();
                return null;
            case TC_REFERENCE:
                const result = this.deserPrevObject();
                if (result?.type !== "classDesc") {
                    throw new Error(`Expected classDesc prev object, found ${result?.type}`);
                }
                return result;
            default:
                throw new Error(`Unexpected class desc TC: ${type}`);
        }
    }

    // Both classAnnotation and objectAnnotation
    deserAnnotation(): JContents {
        const result = [];
        while (this.peekByte() !== TC_ENDBLOCKDATA) {
            const content = this.deserContent();
            result.push(content);
        }
        this.deserByte();
        return result;
    }

    deserClassDatas(desc: JClassDesc): JClassData[] {
        const classes: JClassDescNonProxy[] = [];
        let currDesc = desc;
        while (currDesc !== null && !currDesc.proxy) {
            classes.unshift(currDesc);
            currDesc = currDesc.super;
        }

        const result = [];
        for (const desc of classes) {
            let data: JClassData;
            if ((desc.flags & SC_SERIALIZABLE) && !(desc.flags & SC_WRITE_METHOD)) {
                data = {values: this.deserValues(desc)};
            } else if ((desc.flags & SC_SERIALIZABLE) && (desc.flags & SC_WRITE_METHOD)) {
                data = {values: this.deserValues(desc), annotation: this.deserAnnotation()};
            } else if ((desc.flags & SC_EXTERNALIZABLE) && !(desc.flags & SC_BLOCK_DATA)) {
                throw new Error("PROTOCOL_VERSION_1 externalContents not supported");
            } else if ((desc.flags & SC_EXTERNALIZABLE) && (desc.flags & SC_BLOCK_DATA)) {
                data = {annotation: this.deserAnnotation()};
            } else {
                throw new Error(`Invalid flags for class "${desc.name}": ${desc.flags}`);
            }
            result.push(data);
        }
        return result;
    }

    deserValues(desc: JClassDesc): JValues {
        // Are these checks legitimate?
        if (desc === null) {
            throw new Error("Can't deserialize values for object of null class");
        }
        if (desc.proxy) {
            throw new Error("Can't deserialize values for object of proxy class");
        }
        const result: JValues = {};
        for (const field of desc.fields) {
            let value: JValue;
            switch (field.type) {
                // TODO signed integers & byte/char!!!
                case "byte":
                case "char":    value = this.deserByte(); break;
                case "double":  value = this.deserDouble(); break;
                case "float":   value = this.deserFloat(); break;
                case "integer": value = this.deserInt(); break;
                case "long":    value = this.deserLong(); break;
                case "short":   value = this.deserShort(); break;
                case "boolean": value = !!this.deserByte(); break;  // TODO assuming
                case "array":
                case "object":  value = this.deserObject(); break;
                default:
                    throw new Error(`Invalid field type: ${(field as any).type}`);
            }
            result[field.name] = value;
        }
        return result;
    }
}
