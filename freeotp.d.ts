type BackupFile = {
    masterKey: MasterKey,
    tokens: EncryptedToken[],
}

type EncryptedToken = {
    key: EncryptedKey,
    token: Token,
}

type MasterKey = {
    mEncryptedKey: EncryptedKey,
    mAlgorithm: string,
    mIterations: number,
    mSalt: number[],
}

type EncryptedKey = {
    mCipherText: number[],
    mParameters: number[],
    mCipher: string,
    mToken: string,
}

type Token = {
    type: "HOTP" | "TOTP",
    issuerExt?: string,
    label: string,

    issuerInt?: string,
    issuerAlt?: string,
    labelAlt?: string,

    algo?: "SHA1" | "SHA265" | "SHA512",
    
    counter?: number,
    period?: number,
    digits?: number,

    lock?: boolean,
    image?: string,
    color?: string,
}