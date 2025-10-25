type _FirstXRestY<X, Y> = [X, ...Y[]];

type FreeOTPBackupFile = [{
    type: "object",
    class: {
        name: "java.util.HashMap",
    },
    data: [{
        annotation: _FirstXRestY<Uint8Array, {
            type: "string",
            value: string,
        }>,
    }],
}]

type FreeOTPBackup = {
    masterKey: {
        mAlgorithm: "PBKDF2withHmacSHA512" | "PBKDF2withHmacSHA1",
        mIterations: number,
        mSalt: number[],
        mEncryptedKey: {
            mCipher: "AES/GCM/NoPadding",
            mToken: "AES",
            mCipherText: number[],
            mParameters: number[],
        },
    },
} & {
    [uuid: string]: {
        key: {},
        token: {
            algo?: string,
            issuerExt?: string,
            issuerInt?: string,
            issuerAlt?: string,
            label: string,
            labelAlt?: string,
            issuerImage?: string,
            issuerColor?: string,
            lock?: boolean,
            period?: number,
            digits?: number,
            type: "HOTP" | "TOTP",
            counter?: number,
        },
    }
};

function validateAST(contents: unknown): contents is FreeOTPBackupFile {
    if (!(contents instanceof Array) || contents.length !== 1) return false;

    const ast = contents[0] as any;
    if (typeof ast !== "object" || ast === null)
        return false;
    
    if (ast.type !== "object" || ast.class?.name !== "java.util.HashMap"
        || !(ast.data instanceof Array) || ast.data.length !== 1)
        return false;

    const annotation = ast.data[0].annotation;
    if (!(annotation instanceof Array) || annotation.length === 0
        || !(annotation[0] instanceof Uint8Array)
        || !annotation.slice(1).every(it =>
            typeof it === "object" && it !== null
            && it.type === "string" && typeof it.value === "string")
        )
            return false;

    return true;
}

async function parseFreeOTPBackupFile(file: File) {
    const reader = new FileReader();
    const readPromise = new Promise<Uint8Array>((res, rej) => {
        reader.addEventListener("load", () => res(new Uint8Array(reader.result as ArrayBuffer)));
        reader.addEventListener("error", () => rej(reader.error));
    })
    reader.readAsArrayBuffer(file);

    const bytes = await readPromise;
    const tree: Object = new Deserializer(bytes).deser();

    if (!validateAST(tree)) {
        throw new Error(`Invalid backup file`);
    }

    const [, ...keyvalObjects] = tree[0].data[0].annotation;
    const keyvals = keyvalObjects.map(it => it.value);
    
    if (keyvals.length % 2 != 0) {
        throw new Error("More keys than values");
    }

    const result: any = {};
    for (let i=0; i<keyvals.length; i+=2) {
        const [key, val] = [keyvals[i], keyvals[i+1]];
        if (key === "masterKey") {
            result.masterKey = JSON.parse(val);
        } else if (key.endsWith("-token")) {
            const uuid = key.slice(0, -"-token".length);
            if (!(uuid in result)) result[uuid] = {};
            result[uuid].token = JSON.parse(val);
        } else {
            const uuid = key;
            if (!(uuid in result)) result[uuid] = {};
            result[uuid].key = JSON.parse(JSON.parse(val)["key"]);
        }
    }

    // TODO validate result

    return result;
}
