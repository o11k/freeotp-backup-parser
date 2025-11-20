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
    const LOAD_STATE = Object.freeze({
        START: 0,
        INITIZALIZE: 1,
        JAR: 2,
        CLASS: 3,
        PARSE: 4,
        DECRYPT: 5,
        DONE: 100,
    })

    const passwordEl = React.useRef();

    const [file, setFile] = React.useState(null)
    const [password, setPassword] = React.useState("")
    const oldInputs = React.useRef({file, password})

    const [fileData, setFileData] = React.useState(null);
    const [otpUris, setOtpUris] = React.useState(null);

    const [loading, setLoading] = React.useState(LOAD_STATE.START)
    const [error, setError] = React.useState("")

    React.useEffect(() => {(async () => {
        if (!error) return;
        let errStr = error.toString();
        if (errStr instanceof Promise) errStr = await errStr;
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
                await cheerpOSAddStringFile("/str/externalBackup.xml", bytes);
                const jsFileData = parseBackupFile(bytes);
                currFileData = parseBackupFile(bytes);
                setFileData(currFileData);
            }
        }

        if (password && (passwordChanged || fileChanged)) {
            let otpUrisStr;
            try {
                otpUrisStr = await window.JavaClass.decryptBackupFile(JSON.stringify(currFileData), password);
            } catch (e) {
                if (passwordChanged) {
                    setError(e);
                    return;
                }
            }
            setOtpUris(JSON.parse(otpUrisStr));
        }

        if (fileChanged && !passwordChanged) passwordEl.current.focus();
    })()}, [file, password])

    React.useEffect(() => {(async () => {
        try {
            setLoading(LOAD_STATE.INITIZALIZE);
            const preload = await (await fetch("preload.json")).json()
            await cheerpjInit({preloadResources: preload});
            setLoading(LOAD_STATE.JAR)
            const lib = await cheerpjRunLibrary("/app/freeotpbackupparser/target/freeotpbackupparser-1.0-SNAPSHOT.jar");
            setLoading(LOAD_STATE.CLASS)
            const jclass = await lib.com.o11k.App;
            window.JavaClass = jclass;
            setLoading(LOAD_STATE.PARSE);
            const encrypted = await jclass.parseBackupFile("/app/externalBackup-demo.xml");
            console.log(encrypted);
            setLoading(LOAD_STATE.DECRYPT);
            const decrypted = await jclass.decryptBackupFile(encrypted, "demo");
            console.log(decrypted);
            setLoading(LOAD_STATE.DONE);
        } catch (e) {
            setError(e);
        }
    })()}, [])

    const loadEmoji = (stage) => {
        if (stage < loading) return "✅";
        if (stage === loading && !error) return "🕓";
        if (stage === loading && error) return "❌";
        if (stage > loading) return "⬜";
        throw new Error("unreachable");
    }

    return (
        <div>
            <div>
                <span>{loadEmoji(LOAD_STATE.INITIZALIZE)} Initializing CheerpJ</span><br />
                <span>{loadEmoji(LOAD_STATE.JAR)} Loading .jar file</span><br />
                <span>{loadEmoji(LOAD_STATE.CLASS)} Loading class</span><br />
                <span>{loadEmoji(LOAD_STATE.PARSE)} Invoking parse method for the first time</span><br />
                <span>{loadEmoji(LOAD_STATE.DECRYPT)} Invoking decrypt method for the first time</span><br />
            </div>
            <br />
            <div style={(loading === LOAD_STATE.DONE) ? {} : {opacity: 0.5, pointerEvents: "none", userSelect: "none"}}>
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
                                    {otpUris === null ? "🔒" : <QR text={otpUris[i]} width={200} height={200} />}
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

function parseBackupFile(/** @type {Uint8Array} */ data) {
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
            tokensMap.get(uuid).token = value;
        } else {
            const uuid = key;
            if (!tokensMap.has(uuid)) tokensMap.set(uuid, {});
            tokensMap.get(uuid).key = value;
        }
    }
    result.tokens = [...tokensMap.values()];

    expect(0x78, readInteger(1), "TC_ENDBLOCKDATA");

    return result;
}

ReactDOM.createRoot(document.getElementById("freeotp-root")).render(<AppComponent />);
