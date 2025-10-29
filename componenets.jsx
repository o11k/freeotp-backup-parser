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
    const [result, setResult] = React.useState("")

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
        if (file && loading < LOAD_STATE.DONE) throw new Error("unreachable without user shenanigans");
        if (!file) {setResult(""); return}

        const bytes = await readFile(file);
        await cheerpOSAddStringFile("/str/externalBackup.xml", bytes);
        const res = await window.JavaClass.parseBackupFile("/str/externalBackup.xml");
        setResult(JSON.parse(res));
    })()}, [file, password])

    React.useEffect(() => {(async () => {
        try {
            setLoading(LOAD_STATE.INITIZALIZE)
            await cheerpjInit();
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
                <input type="password" ref={passwordEl} onKeyDown={e => {if (e.key === "Enter") setPassword(passwordEl.current.value)}} />
                <button onClick={() => setPassword(passwordEl.current.value)}>Set</button>
                <br />
                <br />
                {!result ? null : <table border={1} style={{borderCollapse: "collapse"}}>
                    <thead>
                        <tr>
                            <th>QR</th>
                            <th>Issuer</th>
                            <th>Label</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.tokens.map(t => {
                            return <tr key={btoa(t.key.mCipherText.map(c => String.fromCharCode((c+255)%255)).join(""))}>
                                <td>🔒</td>
                                <td>{t.token.issuerInt ?? t.token.issuerExt ?? "<unknown>"}</td>
                                <td>{t.token.label}</td>
                            </tr>
                        })}
                    </tbody>
                </table>}
            </div>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById("freeotp-root")).render(<AppComponent />);
