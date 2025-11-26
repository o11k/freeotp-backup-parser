async function readFile(file) {
    const reader = new FileReader();
    const readPromise = new Promise((res, rej) => {
        reader.addEventListener("load", () => res(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result))));
        reader.addEventListener("error", () => rej(reader.error));
    })
    reader.readAsArrayBuffer(file);

    return await readPromise;
}

function AppComponent() {
    const passwordEl = React.useRef();

    const [file, setFile] = React.useState(null)
    const [password, setPassword] = React.useState("")
    const oldInputs = React.useRef({file, password})

    const [fileData, setFileData] = React.useState(null);
    const [otpUris, setOtpUris] = React.useState(null);

    const [error, setError] = React.useState("")

    React.useEffect(() => {(async () => {
        if (!error) return;
        let errStr = error.toString();
        window.alert(errStr);
        throw error;
    })()}, [error])

    React.useEffect(() => {(async () => {
        const fileChanged = file !== oldInputs.current.file;
        const passwordChanged = password !== oldInputs.current.password;
        oldInputs.current = {file, password};

        if (fileChanged || passwordChanged) setOtpUris(null);

        let currFileData = fileData;

        if (fileChanged) {
            currFileData = null;
            setFileData(currFileData)

            if (file) {
                const bytes = await readFile(file);
                currFileData = parseBackupFile(bytes);
                setFileData(currFileData);
            }
        }

        if (password && (passwordChanged || fileChanged)) {
            try {
                let masterKey;
                try {
                    masterKey = await decryptMasterKey(currFileData.masterKey, password)
                } catch (_) {
                    throw new Error("Wrong password");
                }

                let otpUris;
                try {
                    otpUris = await Promise.all(currFileData.tokens.map(async t => {
                        const secret = await decryptTokenSecret(masterKey, t.key);
                        const uri = tokenToUri(t.token, secret);
                        return uri;
                    }))
                    setOtpUris(otpUris);
                } catch (e) {
                    throw new Error("Successfully decrypted master key, but failed to decrypt token secrets. Corrupted file?", {cause: e});
                }
            } catch (e) {
                if (passwordChanged) {
                    setError(e);
                    return;
                }
            }
        }

        if (fileChanged && !passwordChanged) passwordEl.current.focus();
    })()}, [file, password])

    return (
        <div>
            <div>
                Select <code>externalBackup.xml</code> file
                <br />
                <input type="file" onChange={e => setFile([...e.target.files].at(0))} />
                <br />
                <br />
                Enter password
                <br />
                <input
                    type="password"
                    ref={passwordEl}
                    onKeyDown={e => {if (e.key === "Enter") setPassword(passwordEl.current.value)}}
                    disabled={otpUris != null}
                />
                <button onClick={() => setPassword(passwordEl.current.value)} disabled={otpUris != null}>Set</button>
                <br />
                <br />
                {fileData === null ? null : <table border={1} style={{borderCollapse: "collapse"}}>
                    <thead>
                        <tr>
                            <th>QR</th>
                            <th>Issuer</th>
                            <th>Label</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fileData.tokens.map((t, i) => {
                            return <tr key={btoa(t.key.mCipherText.map(c => String.fromCharCode((c+255)%255)).join(""))}>
                                <td style={{padding: 30}}>
                                    {otpUris === null ? "🔒" : <><QR text={otpUris[i]} width={200} height={200} /><br />{otpUris[i]}</>}
                                </td>
                                <td>{t.token.issuerExt ?? t.token.issuerInt ?? "<unknown>"}</td>
                                <td>{t.token.label}</td>
                            </tr>
                        })}
                    </tbody>
                </table>}
            </div>
        </div>
    )
}

function QR({ text, width, height }) {
    const handleRef =  React.useCallback(el => {
        if (el)
            new QRCode(el, {text, width, height, correctLevel : QRCode.CorrectLevel.L});
    }, [text, width, height])

    return <div ref={handleRef}></div>
}

/**
 * 
 * @param {Uint8Array} data 
 * @returns {BackupFile}
 */
function parseBackupFile(data) {
    let index = 0;

    const read = (numBytes, exact=true) => {
        if (exact && index + numBytes > data.byteLength) {
            throw Error("Unexpected EOF");
        }
        const result = data.slice(index, index+numBytes);
        index += numBytes;
        index = Math.min(index, data.byteLength);
        return result;
    }

    const readInteger = (numBytes, signed=false) => {
        const bytes = read(numBytes);

        let result = 0n;
        for (const byte of bytes) {
            result = (result << 8n) + BigInt(byte);
        }

        // Signed int
        const modulus = 1n << BigInt(bytes.byteLength * 8);
        const signBit = bytes[0] >> (8-1)
        if (signed && signBit) {
            result = result - modulus;
        }

        return result;
    }

    const readUtf = () => {
        const length = readInteger(2);
        const bytes = read(Number(length));
        return new TextDecoder().decode(bytes);
    }

    const expect = (expected, actual, info="") => {
        let same;
        if (expected instanceof Uint8Array && actual instanceof Uint8Array) {
            same = expected.byteLength === actual.byteLength && expected.every((b, i) => b === actual[i]);
        } else {
            if (typeof expected === "number") expected = BigInt(expected);
            if (typeof actual === "number") actual = BigInt(actual);
            same = expected === actual;
        }
        if (!same) {
            if (info) info += " ";
            throw Error(`Error while parsing file: expected ${info}${expected}, found ${actual}`);
        }
    }

    // Header
    expect(0xaced, readInteger(2), "STREAM_MAGIC");
    expect(5, readInteger(2), "STREAM_VERSION");

    expect(0x73, readInteger(1), "TC_OBJECT");

    // Class Desc
    expect(0x72, readInteger(1), "TC_CLASSDESC");
    expect("java.util.HashMap", readUtf());
    expect(0x0507dac1c31660d1n, readInteger(8), "serialVersionUID");
    expect(0x03, readInteger(1), "classDescFlags");
    expect(2, readInteger(2), "fieldCount");
    expect(0x46, readInteger(1), "float indicator");
    expect("loadFactor", readUtf());
    expect(0x49, readInteger(1), "int indicator");
    expect("threshold", readUtf());
    expect(0x78, readInteger(1), "TC_ENDBLOCKDATA");
    expect(0x70, readInteger(1), "TC_NULL");

    // Class Data
    read(4);  // loadFactor
    read(4);  // threshold

    expect(0x77, readInteger(1), "TC_BLOCKDATA");
    expect(8, readInteger(1), "block data length");
    const _hashMapCapacity = readInteger(4);
    const hashMapSize = readInteger(4);

    const result = {};
    const tokensMap = new Map();

    for (let i=0; i<hashMapSize; i++) {
        expect(0x74, readInteger(1), "TC_STRING");
        const key = readUtf();
        expect(0x74, readInteger(1), "TC_STRING");
        const value = readUtf();

        if (key === "masterKey") {
            result.masterKey = JSON.parse(value);
        } else if (key.endsWith("-token")) {
            const uuid = key.slice(0, -"-token".length);
            if (!tokensMap.has(uuid)) tokensMap.set(uuid, {});
            tokensMap.get(uuid).token = JSON.parse(value);
        } else {
            const uuid = key;
            if (!tokensMap.has(uuid)) tokensMap.set(uuid, {});
            tokensMap.get(uuid).key = JSON.parse(JSON.parse(value).key);
        }
    }
    result.tokens = [...tokensMap.values()];

    expect(0x78, readInteger(1), "TC_ENDBLOCKDATA");

    return result;
}

/**
 * 
 * @param {MasterKey} masterKey 
 * @param {string} password 
 * @returns {Promise<CryptoKey>}
 */
async function decryptMasterKey(masterKey, password) {
    let kdf, hmac;
    if (masterKey.mAlgorithm === "PBKDF2withHmacSHA512") {
        kdf = "PBKDF2";
        hmac = "SHA-512";
    } else if (masterKey.mAlgorithm === "PBKDF2withHmacSHA1") {
        kdf = "PBKDF2";
        hmac = "SHA-1";
    } else {
        throw Error("Unexpected MasterKey algorithm: " + masterKey.mAlgorithm);
    }

    const salt = new Uint8Array(masterKey.mSalt);
    const iterations = masterKey.mIterations;

    const kdfParams = {
        name: kdf,
        hash: hmac,
        salt: salt,
        iterations: iterations
    }

    const baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        kdfParams.name,
        false,
        ["deriveKey"],
    )

    const decryptionKey = await crypto.subtle.deriveKey(
        kdfParams,
        baseKey,
        {
            name: "AES-GCM",  // EncryptedKey always uses AES-GCM
            length: salt.byteLength * 8,
        },
        true,
        ["decrypt"],
    )

    const {iv, tagLength} = parseDerAesGcmParams(new Uint8Array(masterKey.mEncryptedKey.mParameters))

    const rawDecryptedMasterKey = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
            tagLength: tagLength,
            additionalData: new TextEncoder().encode(masterKey.mEncryptedKey.mToken),
        },
        decryptionKey,
        new Uint8Array(masterKey.mEncryptedKey.mCipherText),
    )

    const decryptedMasterKey = await crypto.subtle.importKey(
        "raw",
        rawDecryptedMasterKey,
        "AES-GCM",
        true,
        ["decrypt"],
    )

    return decryptedMasterKey;
}

/**
 * 
 * @param {Uint8Array} params 
 * @returns {{iv: Uint8Array, tagLength: number}}
 */
function parseDerAesGcmParams(params) {
    const SEQUENCE = 0x30;
    const OCTETSTRING = 0x04;
    const INTEGER = 0x02;

    if (params[0] !== SEQUENCE ||
        params[1] !== params.byteLength-2
    ) {
        throw new Error("Malformed AES/GCM params");
    }

    const stringOffset = 2;
    const stringLength = params[3];

    if (typeof stringLength !== "number") {
        throw new Error("Malformed AES/GCM params");
    }

    const intOffset = 4 + stringLength;
    const intLength = params[intOffset + 1];

    if (intLength !== 1 ||
        intOffset + intLength + 2 !== params.byteLength
    ) {
        throw new Error("Malformed AES/GCM params");
    }

    return {
        iv: params.slice(stringOffset+2, stringOffset+2 + stringLength),
        tagLength: params[intOffset + 2] * 8,
    }
}

/**
 * 
 * @param {CryptoKey} masterKey 
 * @param {EncryptedKey} encryptedToken 
 * @returns {Promise<string>}
 */
async function decryptTokenSecret(masterKey, encryptedToken) {
    const {iv, tagLength} = parseDerAesGcmParams(new Uint8Array(encryptedToken.mParameters))

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
            tagLength: tagLength,
            additionalData: new TextEncoder().encode(encryptedToken.mToken),
        },
        masterKey,
        new Uint8Array(encryptedToken.mCipherText),
    )

    return uint8ToBase32(new Uint8Array(decrypted));
}


/**
 * 
 * @param {Uint8Array} bytes 
 * @returns {string}
*/
function uint8ToBase32(bytes) {
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let output = "";

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    while (output.length % 8 !== 0) {
        output += "=";
    }

    return output;
}

/**
 * 
 * @param {Token} token 
 * @param {string} secret
 * @returns {string} 
 */
function tokenToUri(token, secret) {
    const url = new URL("otpauth://example.com/path");

    url.host = token.type.toLowerCase();
    if (token.issuerExt === undefined) {
        url.pathname = token.label;
    } else {
        url.pathname = token.issuerExt + ":" + token.label;
    }

    const params = url.searchParams;

    params.set("secret", secret);

    if (token.issuerInt !== undefined) {
        params.set("issuer", token.issuerInt);
    }
    if (token.issuerAlt !== undefined) {
        params.set("issuerAlt", token.issuerAlt);
    }
    if (token.labelAlt !== undefined) {
        params.set("mLabelAlt", token.labelAlt);
    }
    if (token.algo !== undefined) {
        params.set("algorithm", token.algo);
    }
    if (token.period !== undefined) {
        params.set("period", token.period.toString());
    }
    if (token.digits !== undefined) {
        params.set("digits", token.digits.toString());
    }
    if (token.lock !== undefined) {
        params.set("lock", token.lock.toString());
    }
    if (token.color !== undefined) {
        params.set("color", token.color);
    }
    if (token.image !== undefined) {
        params.set("image", token.image);
    }
    if (token.type === "HOTP") {
        if (token.counter === undefined) {
            throw new Error("HOTP token must have a counter field");
        }
        params.set("counter", token.counter.toString());
    }

    return url.toString();
}

ReactDOM.createRoot(document.getElementById("freeotp-root")).render(<AppComponent />);
